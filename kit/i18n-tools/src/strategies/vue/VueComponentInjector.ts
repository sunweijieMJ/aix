import { parse as parseSFC } from '@vue/compiler-sfc';
import { stripCommentsForScan } from '../../utils/source-key-scanner';
import type { IComponentInjector } from '../../adapters/FrameworkAdapter';
import type { VueImportManager } from './VueImportManager';
import type { VueI18nLibrary } from './libraries';

/**
 * Vue 组件注入器
 * 负责向 Vue 组件注入国际化（i18n）能力
 *
 * 对于 Vue：
 * - Composition API (script setup): 通过 VueImportManager 添加 Hook 导入和声明
 * - Options API: 使用 this.$t()，无需额外注入
 *
 * library 与 importManager 由 VueAdapter 注入，不再使用默认值。
 */
export class VueComponentInjector implements IComponentInjector {
  private library: VueI18nLibrary;
  private importManager: VueImportManager;

  constructor(library: VueI18nLibrary, importManager: VueImportManager) {
    this.library = library;
    this.importManager = importManager;
  }

  /**
   * 注入国际化能力到 Vue 组件
   *
   * 仅对 .vue 的 <script setup> 块注入 Hook；纯 .ts/.js 文件由 VueImportManager
   * 直接从 tImport 路径注入 { t }，不走此处。
   */
  inject(code: string, filePath?: string): string {
    let descriptor;
    try {
      descriptor = parseSFC(code).descriptor;
    } catch {
      // 解析失败（非 SFC / 语法坏掉）→ 下面回退到正则粗判，不因解析失败就整体放弃注入。
      descriptor = undefined;
    }

    // <script setup> 判定以已解析的 descriptor 为准，不用 `/<script\s+setup/` 正则：
    // 后者要求 setup 紧跟在 `<script` 之后，对合法的属性顺序颠倒（`<script lang="ts" setup>`）
    // 判定为 false → 整个注入被静默跳过。触发面是「中文只在 template（handleGlobalImports 因无
    // script 字符串早退）+ setup 内已有裸 t()」，产物引用未声明的 t。
    // 解析失败时的兜底正则同样放宽到「<script 开标签内任意位置的 setup 属性」：要求 setup 前有
    // 空白、后接空白/`/`/`>`，从而不被 `src="setup.js"` 这类属性值骗到。
    const hasSetupBlock = descriptor
      ? Boolean(descriptor.scriptSetup)
      : /<script[^>]*\ssetup(?=[\s/>])/.test(code);
    if (!hasSetupBlock) {
      return code;
    }

    // 双块共存场景：t 由 VueImportManager 在非-setup 块顶层 import 注入；
    // setup 块共享模块作用域直接复用，**不**再注入 useI18n hook。
    if (descriptor?.script && descriptor.scriptSetup) {
      return code;
    }

    // 与 VueImportManager 的「setup-only 统一走模块 import」策略对齐：
    // 若 setup 块已存在 `import { t } from '<any>'`（通常由 handleGlobalImports
    // 先一步注入），t 已在模块作用域可用，无需再注入 useI18n() hook。
    // 否则会产生 TS2440: Import declaration conflicts with local declaration of 't'。
    //
    // 同理：若用户已手写从 hook 解构出的本地 t（含多键形态 `const { t, locale } =
    // useI18n()`），t 已可用，再注入 `const { t } = useI18n()` 会双声明 t 致 SFC
    // 编译失败。getHookDeclarationCheckRegex 只匹配恰好 `{ t }`，识别不出多键解构，
    // 故此处复用 importManager.hasLocalHookTBinding（与 handleGlobalImports 同款判定）。
    if (descriptor?.scriptSetup) {
      const setupContent = descriptor.scriptSetup.content;
      if (
        this.importManager.hasNamedImportLocalT(setupContent) ||
        this.importManager.hasLocalHookTBinding(setupContent)
      ) {
        return code;
      }
    }

    if (!this.needsHook(code)) {
      return code;
    }

    // 与 VueImportManager「仅 <script setup> 统一走模块 import、不注入 useI18n hook」策略对齐
    // （见 handleGlobalImports 的 hasSetup 分支）。这里绝不能改注入 useI18n hook：本路径只在
    // 「中文只在 template、handleGlobalImports 因无 script 字符串早退」时触发（有 script 字符串
    // 时 handleGlobalImports 已注入 import { t }，下方守卫提前 return），一旦注入 hook，产物形态
    // 就取决于中文落在 template 还是 script，两种形态自相矛盾，且对用户手写的 plain `const t`
    // 容易双声明。统一补模块 import，复用同一套「清 hook 残留 + 注入 import { t }」逻辑。
    return this.importManager.applySetupModuleImport(code, filePath);
  }

  /**
   * 检查代码是否需要 Hook
   *
   * Why: 此处的目标是判断"transform 阶段是否插入了 t()/$t() 调用"，必须先剥除注释与
   *      字符串字面量再做边界匹配（用 lookbehind 兼容行首调用）。直接对原文跑
   *      /[^\w.$]t\(/ 会把注释、字符串字面量与 HTML 注释里的 `t(` 误判为真实调用，
   *      注入冗余 hook，并掩盖真正的"未转换"场景。
   */
  private needsHook(code: string): boolean {
    if (this.library.getHookDeclarationCheckRegex().test(code)) {
      return false;
    }

    const cleaned = VueComponentInjector.stripCommentsAndStrings(code);
    return /(^|[^\w.$])t\(/.test(cleaned);
  }

  /**
   * 启发式剥除注释与字符串字面量，仅用于 needsHook 之类的存在性检测。
   *
   * 不处理模板字面量内嵌套表达式中的字符串（成本过高且检测目标无关），
   * 一律将整个 `\`...\`` 当作字符串吞掉；正则字面量、JSX 等同理。
   *
   * 剥注释走 stripCommentsForScan（SFC 分段 + JS 词法状态机）而非「匹配 `//` 至行尾」的正则：
   * 后者会被字符串里的 URL 骗到，`const url = 'https://a.com'; report(t('k'))` 这类同行写法
   * 里 `//a.com'; report(t('k'))` 被整段当行注释抹掉 → needsHook 判 false → 不注入 hook，
   * 而 transform 已产出 t() 调用 → 运行时引用未定义标识符。
   *
   * 入参恒为 .vue SFC（调用方 inject 已判定 `<script setup>`），故固定按 .vue 分流：
   * 对整文件直接跑 JS 状态机会被 template 文本里的裸 URL / 不配对 `/*` 吞掉后续内容，
   * 同样把 t() 调用检测掉（见 stripCommentsForScan 注释）。
   */
  private static stripCommentsAndStrings(code: string): string {
    return stripCommentsForScan('component.vue', code)
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }
}
