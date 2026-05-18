import { parse as parseSFC } from '@vue/compiler-sfc';
import type { IImportManager } from '../../adapters/FrameworkAdapter';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import type { ExtractedString } from '../../utils/types';
import type { VueI18nLibrary } from './libraries';

/**
 * SFC <script> 块定位结果（基于 @vue/compiler-sfc 解析，避免正则在含
 * `<!-- </script> -->` 注释或多 script 块时被截断）
 */
interface ScriptBlockLocation {
  /** <script> 标签内部内容（不含开闭标签） */
  content: string;
  /** content 在原始 code 中的起始偏移 */
  start: number;
  /** content 在原始 code 中的结束偏移 */
  end: number;
}

/**
 * 管理 Vue i18n 转换中所需的 import 语句和相关代码
 */
export class VueImportManager implements IImportManager {
  private tImport: string;
  private library: VueI18nLibrary;

  constructor(tImport: string, library: VueI18nLibrary) {
    this.tImport = tImport;
    this.library = library;
  }

  // ==================== 添加 Imports ====================

  /**
   * 处理所有导入和全局声明
   */
  handleGlobalImports(code: string, fileStrings: ExtractedString[], filePath?: string): string {
    if (fileStrings.length === 0) {
      return code;
    }

    let updatedCode = code;
    const ext = filePath?.split('.').pop()?.toLowerCase();

    if (ext === 'ts' || ext === 'js') {
      // 先清理占位声明，再注入真正的 import { t }，否则会和原 declare 冲突。
      updatedCode = this.stripPlaceholderTDeclares(updatedCode);
      updatedCode = this.addPluginLocaleImport(updatedCode);
    } else {
      const hasScriptStrings = fileStrings.some(
        (s) => s.context === 'script' || s.context === 'js-code',
      );
      if (!hasScriptStrings) return updatedCode;

      let descriptor;
      try {
        descriptor = parseSFC(code).descriptor;
      } catch {
        return updatedCode;
      }
      const hasNonSetup = !!descriptor.script;
      const hasSetup = !!descriptor.scriptSetup;

      updatedCode = this.stripPlaceholderTDeclares(updatedCode);

      if (hasNonSetup && hasSetup) {
        // 双块共存：t 来自非-setup 块顶层 import { t } from tImport；setup 块
        // 共享模块作用域直接复用，因此 setup 块**不**注入 useI18n / const t。
        // Why: 与本仓库 demo 注释约定一致（"所有 import 集中到顶部 script 块"），
        // 也避免双块各自 import 后 eslint-plugin-vue 把整个 SFC 视为一个 program
        // 时触发 import/order 报错。
        // 同步清理 setup 块内可能残留的 hook 注入（旧代码或上一轮工具产物），
        // 否则会与 nonSetup 顶层 import 形成双 t 声明。
        updatedCode = this.removeHookImportAndDeclaration(updatedCode);
        updatedCode = this.addPluginLocaleImportToScript(updatedCode, 'nonSetupOnly');
      } else if (hasSetup) {
        // 仅 <script setup>：统一走「模块顶层 import { t } from tImport」路径，
        // 不再走 useI18n hook 注入。
        //
        // Why 统一：
        //   1. 编译宏场景（defineProps 等参数引用 t()）本来就强制走模块 import；
        //      hook 路径在该场景下会触发 vue/valid-define-* 规则与 SFC 编译错误。
        //   2. 两条策略并存导致策略切换时清理不对称——例如上一轮工具走模块 import
        //      留下 `import { t } from tImport`，本轮走 hook 又注入 `const { t } =
        //      useI18n()`，t 被声明两次报 SyntaxError（已发生的真实 bug）。
        //   3. 业务侧 tImport 通常导出 `i18n.global.t`，与 useI18n().t 在响应式
        //      行为上等价（template 调用都跟随 locale 切换重渲染）。
        //
        // 适用前提：tImport 必须暴露命名导出 `t`、vue-i18n 走 legacy:false +
        // reactive composer、非 SSR、不依赖 useScope:'local' 的局部 messages。
        //
        // 无条件先清一次 hook 残留：业务仓库可能有大量上一轮 hook 注入痕迹，
        // 不清理会与即将写入的 import { t } 双声明。清理正则只匹配工具注入的
        // 无参形态（`useI18n()` / `const { t } = useI18n()`），不会误伤手写的
        // `useI18n({ useScope:'local', messages })` 等高级用法。
        updatedCode = this.removeHookImportAndDeclaration(updatedCode);
        updatedCode = this.addPluginLocaleImportToScript(updatedCode, 'setupOnly');
      } else {
        // 仅普通 <script>：按需为模块顶层裸 t() 注入 import
        updatedCode = this.addPluginLocaleImportToScript(updatedCode, 'nonSetupOnly');
      }
    }

    return updatedCode;
  }

  /**
   * 若指定 SFC <script> 块内含裸 t() 调用，向该块顶部注入 `import { t } from
   * tImport`。已存在则跳过。
   *
   * 适用场景：
   *   - 仅 <script>（Options API + 模块顶层调用）—— scope='nonSetupOnly'
   *   - 双块共存（非-setup 块为模块顶层 import 锚点）—— scope='nonSetupOnly'
   *   - 仅 <script setup> 且存在编译宏引用 t —— scope='setupOnly'
   *     （setup 顶层 import 编译后仍属模块作用域，可被编译宏自由引用）
   */
  private addPluginLocaleImportToScript(code: string, scope: 'setupOnly' | 'nonSetupOnly'): string {
    const block = VueImportManager.findScriptBlock(code, { [scope]: true });
    if (!block) return code;

    // 检测「整个 SFC 的所有 script 块」是否存在裸 t() 调用——而不是仅检测目标 block。
    // Why: 双块共存场景下，import 写到 nonSetup 块，但 t() 调用可能在 setup 块；
    //   仅看目标块会漏判，导致 setup 用 t 但 t 无声明（统一策略前置清理 hook 后
    //   尤其致命）。模块作用域下任一块声明 import { t }，所有块都能用。
    // 用负向先行排除 this.t / `xt(` / `$t(` 等误匹配。
    const allScriptContent = VueImportManager.collectAllScriptContent(code);
    if (!/(?:^|[^\w.$])t\s*\(/.test(allScriptContent)) return code;

    const escapedPath = CommonASTUtils.escapeRegExp(this.tImport);
    if (
      new RegExp(`import\\s*\\{[^}]*\\bt\\b[^}]*\\}\\s*from\\s*['"]${escapedPath}['"]`).test(
        block.content,
      )
    ) {
      return code;
    }

    const updatedScript = CommonASTUtils.mergeNamedImport(block.content, this.tImport, ['t']);
    return code.slice(0, block.start) + updatedScript + code.slice(block.end);
  }

  /**
   * 清理 setup 块内由本工具注入的标准形式：
   *   import { useI18n } from 'vue-i18n';
   *   const { t } = useI18n();
   *
   * 仅作用于 <script setup> 块。useI18n({ useScope: 'local', messages: ... })
   * 等含参高级用法是用户手写代码，不在清理正则范围内（regex 仅匹配 useI18n()
   * 无参形式），不会被误伤。
   *
   * 使用场景：原本走 hook 注入的文件后续出现了编译宏引用 t，需迁移到模块
   * import 路径 —— 此时残留的 hook 声明会让 setup 局部 t 遮蔽模块顶层 t，
   * 必须清理。
   */
  private removeHookImportAndDeclaration(code: string): string {
    const block = VueImportManager.findScriptBlock(code, { setupOnly: true });
    if (!block) return code;

    let updated = block.content;
    updated = updated.replace(this.library.getHookDeclarationCleanupRegex(), '');
    // 仍有用户手写的 useI18n()/useTranslation() 调用时，保守保留 import；
    // 否则用 removeNamedImports 精准摘除 hookName，保留同包其他命名导入
    // （如 createI18n）。hookName 来自 library，避免硬编码 useI18n 误判 vue-i18next。
    const escapedHook = CommonASTUtils.escapeRegExp(this.library.hookName);
    const hookCallStillUsed = new RegExp(`\\b${escapedHook}\\s*\\(`).test(updated);
    if (!hookCallStillUsed) {
      updated = CommonASTUtils.removeNamedImports(
        updated,
        (moduleName) => this.library.isLibraryImport(moduleName),
        [this.library.hookName],
      );
    }

    if (updated === block.content) return code;
    return code.slice(0, block.start) + updated + code.slice(block.end);
  }

  /**
   * 删除与"即将注入的真实 t 标识符"冲突的占位声明：
   *   declare const t: <signature>;
   *   void t;
   *
   * Why: i18n 提取器约定模板里写 t() / $t() 的字符串会被识别为"已国际化"而跳过。
   * 业务方为了让源文件在跑 i18n-tools 之前也能通过 tsc，常见写法是 `declare
   * const t: ...;`。一旦工具注入真实的 `import { t }` 或 `const { t } = useI18n()`,
   * 占位 declare 就会和真正的 t 标识符产生 "Duplicate identifier / Import
   * declaration conflicts with local declaration" 错误。注入前清理它。
   *
   * **只 strip 与即将注入的标识符同名的 declare**。`$t` 工具不会注入（它是 Vue
   * Options API 的实例属性，无法在模块顶层 import），所以 `declare const $t`
   * 不冲突，必须保留——否则会误伤业务方对 $t 调用的类型支持。
   *
   * 仅匹配单行形式的 declare 与 `void t;` 占位行；多行类型签名是少见情况，
   * 留给业务方自行处理。
   */
  private stripPlaceholderTDeclares(code: string): string {
    const declareRe = /^[ \t]*declare[ \t]+const[ \t]+t[ \t]*:[^\n;]+;[ \t]*\r?\n?/gm;
    const voidRe = /^[ \t]*void[ \t]+t[ \t]*;[ \t]*\r?\n?/gm;
    return code.replace(declareRe, '').replace(voidRe, '');
  }

  /**
   * 添加从 @/plugins/locale 导入 t 函数（用于纯 .ts/.js 文件）
   */
  private addPluginLocaleImport(code: string): string {
    const escapedPath = CommonASTUtils.escapeRegExp(this.tImport);
    if (
      new RegExp(`import\\s*\\{[^}]*\\bt\\b[^}]*\\}\\s*from\\s*['"]${escapedPath}['"]`).test(code)
    ) {
      return code;
    }
    return CommonASTUtils.mergeNamedImport(code, this.tImport, ['t']);
  }

  /**
   * 添加 i18n 库导入 (实现接口方法)
   *
   * 仅在 SFC 的 <script> 块内合并/追加。VueComponentInjector 只对 SFC 调用本方法，
   * 非 SFC 输入按 HEAD 行为原样返回。
   */
  addI18nImports(code: string, imports: string[]): string {
    return this.mergeNamedImportInScript(code, this.library.packageName, imports);
  }

  /**
   * 添加 Hook 声明（如 const { t } = useI18n() 或 const { t } = useTranslation()）
   *
   * 仅注入到 <script setup>。普通 <script>（Options API）走 this.$t，无需 hook 声明。
   */
  addHookDeclaration(code: string): string {
    if (this.library.getHookDeclarationCheckRegex().test(code)) {
      return code;
    }

    const block = VueImportManager.findScriptBlock(code, { setupOnly: true });
    if (!block) return code;

    const declaration = this.library.generateHookDeclaration() + '\n';
    const lines = block.content.split('\n');

    // 优先以"最后一条 import 之后"作为锚点；只有完全没有 import 时才寻找首个非空非注释行。
    const lastImportIndex = CommonASTUtils.findLastImportLineIndex(lines);
    let insertIndex: number;
    if (lastImportIndex >= 0) {
      insertIndex = lastImportIndex + 1;
    } else {
      insertIndex = lines.length;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i]!.trim();
        if (trimmed && !trimmed.startsWith('//')) {
          insertIndex = i;
          break;
        }
      }
    }

    lines.splice(insertIndex, 0, declaration);
    return code.slice(0, block.start) + lines.join('\n') + code.slice(block.end);
  }

  /**
   * 在 <script> 块内合并/追加命名导入（对 SFC 文件，避免误匹配 template/style 中的相似字符串）
   */
  private mergeNamedImportInScript(code: string, packageName: string, names: string[]): string {
    const block = VueImportManager.findScriptBlock(code);
    if (!block) return code;
    const updatedScript = CommonASTUtils.mergeNamedImport(block.content, packageName, names);
    return code.slice(0, block.start) + updatedScript + code.slice(block.end);
  }

  /**
   * 把 SFC 的 script 与 scriptSetup 块内容合并为一个字符串。
   * 用于「是否需要注入 t 来源」的全局检测：双块共存时 t() 可能只在其中一块。
   * 解析失败返回空串，调用方据此跳过注入（保守行为，避免破坏未知格式文件）。
   */
  private static collectAllScriptContent(code: string): string {
    let descriptor;
    try {
      descriptor = parseSFC(code).descriptor;
    } catch {
      return '';
    }
    const parts: string[] = [];
    if (descriptor.script) parts.push(descriptor.script.content);
    if (descriptor.scriptSetup) parts.push(descriptor.scriptSetup.content);
    return parts.join('\n');
  }

  /**
   * 定位 SFC 中需要写入 import / hook 的 <script> 块。
   *
   * Why: 一个 SFC 可同时存在 <script> 与 <script setup>（Vue 3 合法用法）。
   *      naïvely 用 /<script[^>]*>/ 总会命中第一个 <script>，并被 template
   *      或注释中的 `</script>` 字符串截断（如 `<!-- </script> -->`）。
   *      改用 @vue/compiler-sfc 解析，优先返回 scriptSetup 块。
   */
  private static findScriptBlock(
    code: string,
    options: { setupOnly?: boolean; nonSetupOnly?: boolean } = {},
  ): ScriptBlockLocation | null {
    let descriptor;
    try {
      descriptor = parseSFC(code).descriptor;
    } catch {
      return null;
    }

    let block;
    if (options.setupOnly) {
      block = descriptor.scriptSetup;
    } else if (options.nonSetupOnly) {
      block = descriptor.script;
    } else {
      block = descriptor.scriptSetup ?? descriptor.script;
    }
    if (!block) return null;

    return {
      content: block.content,
      start: block.loc.start.offset,
      end: block.loc.end.offset,
    };
  }
}
