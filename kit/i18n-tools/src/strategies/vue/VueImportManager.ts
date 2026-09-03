import { parse as parseSFC } from '@vue/compiler-sfc';
import type { IImportManager } from '../../adapters/FrameworkAdapter';
import {
  mergeNamedImport,
  removeNamedImports,
  stripImportListComments,
} from '../../utils/import-surgery';
import { escapeRegExp } from '../../utils/string-escape';
import { FileUtils } from '../../utils/file-utils';
import { LoggerUtils } from '../../utils/logger';
import { isStandaloneScriptPath, mapScriptBlocks } from './sfc-blocks';
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
  /** 已就「本地 t 遮蔽注入」提示过的文件，避免同一文件在 import 注入与 hook 注入两条路径上重复刷屏。 */
  private readonly localTShadowWarned = new Set<string>();

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

    // 独立脚本（.ts/.js/.tsx/.jsx）没有 SFC 块，直接在模块顶层注入 import { t }。
    if (filePath !== undefined && isStandaloneScriptPath(filePath)) {
      // 先清理占位声明，再注入真正的 import { t }，否则会和原 declare 冲突。
      updatedCode = this.stripPlaceholderTDeclares(updatedCode);
      updatedCode = this.addPluginLocaleImport(updatedCode, filePath);
    } else {
      const hasScriptStrings = fileStrings.some((s) => s.context === 'script');
      if (!hasScriptStrings) return updatedCode;

      let descriptor;
      try {
        descriptor = parseSFC(code).descriptor;
      } catch {
        return updatedCode;
      }
      const hasNonSetup = !!descriptor.script;
      const hasSetup = !!descriptor.scriptSetup;

      // 切到 script 块内 strip：正则作用于整份 .vue 会删掉 `<pre>`/`<code>` 里逐字展示的
      // 同形示例代码（`declare const t: …` / `void t;`），那是不可恢复的内容丢失。
      updatedCode = mapScriptBlocks(updatedCode, (script) =>
        this.stripPlaceholderTDeclares(script),
      );

      if (hasNonSetup && hasSetup) {
        // 双块共存：t 来自非-setup 块顶层 import { t } from tImport；setup 块
        // 共享模块作用域直接复用，因此 setup 块**不**注入 useI18n / const t。
        // Why: 与本仓库 demo 注释约定一致（"所有 import 集中到顶部 script 块"），
        // 也避免双块各自 import 后 eslint-plugin-vue 把整个 SFC 视为一个 program
        // 时触发 import/order 报错。
        // 同步清理 setup 块内可能残留的 hook 注入（旧代码或上一轮工具产物），
        // 否则会与 nonSetup 顶层 import 形成双 t 声明。
        updatedCode = this.removeHookImportAndDeclaration(updatedCode);
        updatedCode = this.addPluginLocaleImportToScript(updatedCode, 'nonSetupOnly', filePath);
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
        updatedCode = this.addPluginLocaleImportToScript(updatedCode, 'setupOnly', filePath);
      } else {
        // 仅普通 <script>：按需为模块顶层裸 t() 注入 import
        updatedCode = this.addPluginLocaleImportToScript(updatedCode, 'nonSetupOnly', filePath);
      }
    }

    return updatedCode;
  }

  /**
   * 为「仅 <script setup>」补齐模块级 `import { t } from tImport`：先清工具注入的 hook 残留，
   * 再注入模块 import。与 handleGlobalImports 的 hasSetup 分支同口径。
   *
   * 供 VueComponentInjector.inject 在「中文仅在 template、但 setup 内有裸 t() 需绑定」——即
   * handleGlobalImports 因无 script 字符串早退——的场景复用，避免回落到 useI18n hook 注入
   * （与统一策略不一致）。幂等：内部 addPluginLocaleImportToScript 已对「已有本地 t 绑定」早退，
   * stripPlaceholderTDeclares 是删除操作，重复执行结果不变。
   */
  applySetupModuleImport(code: string, filePath?: string): string {
    // 与 handleGlobalImports 同序：先清占位 declare（否则 `declare const t` 与注入的
    // import 在同一模块作用域重复声明，TS2440），再注入 import { t }。
    // 必须经 mapScriptBlocks 只在 script 块内 strip，避免删掉 `<pre>`/`<code>` 里
    // 逐字展示的同形示例代码。
    const stripped = mapScriptBlocks(code, (script) => this.stripPlaceholderTDeclares(script));
    const cleaned = this.removeHookImportAndDeclaration(stripped);
    return this.addPluginLocaleImportToScript(cleaned, 'setupOnly', filePath);
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
  private addPluginLocaleImportToScript(
    code: string,
    scope: 'setupOnly' | 'nonSetupOnly',
    filePath?: string,
  ): string {
    const block = VueImportManager.findScriptBlock(code, { [scope]: true });
    if (!block) return code;

    // 检测「整个 SFC 的所有 script 块」是否存在裸 t() 调用——而不是仅检测目标 block。
    // Why: 双块共存场景下，import 写到 nonSetup 块，但 t() 调用可能在 setup 块；
    //   仅看目标块会漏判，导致 setup 用 t 但 t 无声明（统一策略前置清理 hook 后
    //   尤其致命）。模块作用域下任一块声明 import { t }，所有块都能用。
    // 用负向先行排除 this.t / `xt(` / `$t(` 等误匹配；先抹掉 `function t(` 这类**声明**形态，
    // 否则用户自己的 `function t(k) {…}` 会被当成一处裸 t() 调用，让下方 hasLocalTDeclaration
    // 分支打出「跳过注入 t 来源」——而该文件根本没有需要 t 的调用点（提取端已整处跳过）。
    const allScriptContent = VueImportManager.collectAllScriptContent(code).replace(
      /\bfunction\s*\*?\s*t\s*\(/g,
      ' (',
    );
    if (!/(?:^|[^\w.$])t\s*\(/.test(allScriptContent)) return code;

    // 已存在从「任意模块」导入的具名本地 t（本工具 tImport 或用户手写的其它路径），再注入模块级
    // import { t } 会在同一模块作用域产生重复 t 声明（SyntaxError）。故检测必须覆盖任意导入路径
    // （只认 tImport 会对 `import { t } from '@/other'` 视而不见），且必须基于 allScriptContent
    // （双块共享模块作用域，仅看目标 block 会漏判）——与 VueComponentInjector hook 路径同口径。
    if (this.hasNamedImportLocalT(allScriptContent)) {
      return code;
    }

    // 已有本地 t 声明（解构 `const { t, locale } = useI18n()` / `const { total: t } = obj`，
    // 或普通赋值 `const t = useI18n().t`）时，再注入模块级 `import { t }` 会在同一模块作用域
    // 重复声明 t（TS2440 / SyntaxError）。此时 t 已可用，跳过注入即可。
    // 检测面取全部 script 块：多 script 块共享模块作用域，只看目标块会漏判。
    // removeHookImportAndDeclaration 已先清掉工具自注入的「恰好 { t } = hook()」形态，
    // 故此处只会命中用户手写声明——既修复双声明，又不影响工具自身的 hook→import 迁移。
    if (this.hasLocalTDeclaration(allScriptContent)) {
      this.warnLocalTShadowsInjection(filePath);
      return code;
    }

    const updatedScript = VueImportManager.mapScriptBody(block.content, (body) =>
      mergeNamedImport(body, this.tImport, ['t']),
    );
    return code.slice(0, block.start) + updatedScript + code.slice(block.end);
  }

  /**
   * 把改写只施加到「开标签换行之后」的块正文上，前导换行原样保留。
   *
   * SFC 块 content 以换行开头（`<script setup>` 之后换行才是代码），而 import 追加按行数组
   * 定位插入点、首行是空串时会插到它前面 —— 拼回 SFC 就成了 `<script setup>import { t } …`，
   * 与开标签挤在同一行。剥掉前导换行再改写即可让 import 自成一行。
   */
  private static mapScriptBody(content: string, transform: (body: string) => string): string {
    const lead = /^[\r\n]*/.exec(content)?.[0] ?? '';
    return lead + transform(content.slice(lead.length));
  }

  /**
   * 清理 setup 块内由本工具注入的标准形式：
   *   import { useI18n } from 'vue-i18n';
   *   const { t } = useI18n();
   *
   * 仅作用于 <script setup> 块，且只清模块作用域（块顶层、零缩进）的声明：函数体内的
   * `const { t } = useI18n()` 是用户手写的局部绑定，与注入的模块级 import 不撞名，删掉
   * 会丢掉局部 scope 语义。useI18n({ useScope: 'local', messages: ... }) 等含参高级用法
   * 同样不在清理正则范围内（regex 仅匹配 useI18n() 无参形式）。
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
    const escapedHook = escapeRegExp(this.library.hookName);
    const hookCallStillUsed = new RegExp(`\\b${escapedHook}\\s*\\(`).test(updated);
    if (!hookCallStillUsed) {
      updated = removeNamedImports(
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
   * 判断脚本块内是否已存在「从本库 hook 解构出的本地 t」绑定，如
   * `const { t } = useI18n()` / `const { t, locale } = useI18n()` /
   * `const { i18n, t } = useTranslation()`（hookName 来自 library，避免硬编码）。
   *
   * 用于在注入模块级 `import { t }` 前规避「本地解构 t + 模块 import t」双声明冲突。
   * 关键：判定的是「本地绑定名」是否为 t —— `const { t: localT } = useI18n()` 把 t 重命名
   * 为 localT，本地并无 t，应返回 false（否则会漏注入导致裸 t() 未声明）；`const
   * { translate: t } = useI18n()` 把别名绑定到 t，则应返回 true。
   *
   * 同时被 VueComponentInjector.inject() 复用：注入 useI18n() hook 前需用同款判定排除
   * 用户已手写的多键解构（如 `{ t, locale }`），否则会与之形成双 t 声明（SFC 编译失败）。
   */
  hasLocalHookTBinding(scriptContent: string): boolean {
    const escapedHook = escapeRegExp(this.library.hookName);
    // 行首锚定（^[ \t]* + gm）：只匹配作为语句出现在行首（允许缩进）的真实 hook 解构，排除
    // 注释里的 `// const { t } = useI18n()`。否则误判「已有 hook 绑定」而漏注入 → 裸 t() 未声明。
    // 与姊妹方法 mergeNamedImport 的锚定口径一致。
    const destructureRe = new RegExp(
      `^[ \\t]*(?:export\\s+)?const\\s*\\{([^}]*)\\}\\s*=\\s*${escapedHook}\\s*\\(`,
      'gm',
    );
    let match: RegExpExecArray | null;
    while ((match = destructureRe.exec(scriptContent)) !== null) {
      if (VueImportManager.destructureBindsLocalT(match[1] ?? '')) return true;
    }
    return false;
  }

  /**
   * 脚本内是否存在「本地绑定名为 t」的模块作用域声明：任意来源的解构 `const { t } = x()` /
   * `const { total: t } = obj` / 嵌套解构 `const { data: { t } } = props` / 数组解构
   * `const [t] = x()`，普通赋值声明 `const t = useI18n().t` / `let t;`，以及函数与类声明
   * `function t() {}` / `class t {}`。`export` 前缀（`export const t = …`）同样是模块作用域
   * 声明，一并识别。
   *
   * 判定的是本地绑定名 —— `const tt` / `const t2` / `const { t: localT } = x` 本地都没有 t，
   * 必须照常注入，否则裸 t() 无声明。
   *
   * 判定面限定在零缩进的行首声明（= 模块作用域）：注入的是模块级 `import { t }`，只有同在
   * 模块作用域的 t 才与它撞名；函数体内的 t 是合法遮蔽，把它算作命中反而会漏注入，让模块
   * 顶层被改写出的 t() 找不到绑定。
   */
  hasLocalTDeclaration(scriptContent: string): boolean {
    for (const inner of VueImportManager.destructurePatterns(scriptContent)) {
      if (VueImportManager.destructureBindsLocalT(inner)) return true;
    }
    // 普通声明：t 后必须是非标识符字符，`const tt` / `const t2` / `const t$` 不命中。
    if (/^(?:export\s+)?(?:const|let|var)\s+t(?![\w$])/m.test(scriptContent)) return true;
    // 函数 / 类声明同样在模块作用域占用标识符 t，与注入的 import 重名直接编译失败
    // （Identifier 't' has already been declared）。覆盖 async / generator / export default。
    return /^(?:export\s+(?:default\s+)?)?(?:(?:async\s+)?function\s*\*?\s*t(?![\w$])|(?:abstract\s+)?class\s+t(?![\w$]))/m.test(
      scriptContent,
    );
  }

  /**
   * 逐条取出「行首解构声明」定界符内的模式文本（不含最外层大括号 / 方括号）。
   *
   * 用括号配平扫描而非 `\{([^}]*)\}`：后者在 `const { data: { t } } = props` 上停在第一个
   * `}`，拿到的片段解析不出内层的本地 t 绑定 → 漏判 → 与注入的 `import { t }` 双声明。
   * 数组解构 `const [t] = useX()` 与对象解构同为模块作用域绑定，两种定界符都要收。
   * 行首零缩进锚定（^ + gm）：只认模块作用域声明，同时排除注释里的同形文本，与
   * hasLocalTDeclaration 同口径。
   */
  private static *destructurePatterns(scriptContent: string): Generator<string> {
    const headRe = /^(?:export\s+)?(?:const|let|var)\s*[{[]/gm;
    while (headRe.exec(scriptContent) !== null) {
      const start = headRe.lastIndex; // 紧跟最外层 `{`
      const end = VueImportManager.matchingCloseIndex(scriptContent, start);
      if (end === -1) continue; // 括号不配平（截断片段 / 非代码文本）→ 放弃该起点
      yield scriptContent.slice(start, end);
      headRe.lastIndex = end + 1;
    }
  }

  /** 从 `start`（最外层左括号之后）向后找配平的右括号下标，找不到返回 -1。 */
  private static matchingCloseIndex(text: string, start: number): number {
    let depth = 1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  /**
   * 解构模式里是否存在本地绑定名为 t 的项。
   * 本地绑定名：`key: local`（重命名）→ local；`name`（含默认值 `name = x`）→ name；
   * `key: { … }` / `key: [ … ]` → 递归进嵌套模式。
   */
  private static destructureBindsLocalT(inner: string): boolean {
    for (const part of VueImportManager.splitTopLevel(inner, ',')) {
      const colon = VueImportManager.indexOfTopLevel(part, ':');
      let target = colon === -1 ? part : part.slice(colon + 1);
      // 去掉默认值：`t = fallback` 的本地名是 t
      const eq = VueImportManager.indexOfTopLevel(target, '=');
      if (eq !== -1) target = target.slice(0, eq);
      target = target.trim();
      if (!target) continue;
      if (target.startsWith('{') || target.startsWith('[')) {
        if (VueImportManager.destructureBindsLocalT(target.slice(1, -1))) return true;
        continue;
      }
      if (target === 't') return true;
    }
    return false;
  }

  /** 按顶层（括号深度 0）的分隔符切分，嵌套模式内的同名字符不当分隔符。 */
  private static splitTopLevel(text: string, separator: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let last = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
      else if (ch === separator && depth === 0) {
        parts.push(text.slice(last, i));
        last = i + 1;
      }
    }
    parts.push(text.slice(last));
    return parts;
  }

  /** 顶层（括号深度 0）首个 `ch` 的下标，没有则 -1。 */
  private static indexOfTopLevel(text: string, ch: string): number {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (c === '{' || c === '[' || c === '(') depth++;
      else if (c === '}' || c === ']' || c === ')') depth--;
      else if (c === ch && depth === 0) return i;
    }
    return -1;
  }

  /**
   * 脚本内是否存在「本地绑定名为 t」的具名 import，如 `import { t } from 'x'` /
   * `import { foo as t } from 'x'`。用于在注入模块级 `import { t }` 前规避双声明冲突。
   *
   * 关键：判定的是「本地绑定名」而非源名。`import { t as translate }` 的本地名是 translate，
   * 本地并无 t，应返回 false —— 否则会误判「已有 t」而跳过注入，使裸 t() 未声明；
   * `import { foo as t }` 本地名是 t，返回 true。
   *
   * `import type { t }` 同样在模块作用域占用标识符 t（与注入的值导入 t 冲突，TS2300），
   * 故 type-only 形式一并识别；命名列表先剥注释，`{ foo, // 备注\n t }` 里的 t 不被注释吞掉。
   */
  hasNamedImportLocalT(scriptContent: string): boolean {
    // 行首锚定（^[ \t]* + gm）：排除注释里的 `// import { t } from './old'`，否则误判「已有本地 t
    // 导入」而跳过注入真正的 import { t } → 裸 t() 未声明。与 mergeNamedImport 同口径。
    const importRe =
      /^[ \t]*import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/gm;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(scriptContent)) !== null) {
      const inner = stripImportListComments(match[1] ?? '');
      for (const rawPart of inner.split(',')) {
        const part = rawPart.trim();
        if (!part) continue;
        // 本地绑定名：`orig as local` → local；`name`（去掉 type-only 修饰）→ name。
        const localName = /\sas\s/.test(part)
          ? part.split(/\sas\s/)[1]!.trim()
          : part.replace(/^type\s+/, '').trim();
        if (localName === 't') return true;
      }
    }

    // 默认导入 `import t from 'x'` / `import t, { x } from 'x'` 与命名空间导入
    // `import * as t from 'x'` 同样在模块作用域绑定本地名 t，必须一并识别：只认花括号命名
    // 列表会漏掉这两种形态 → 仍注入 `import { t }` → 同作用域重复声明 t → SFC 编译失败。
    // 默认导入：`import` 后第一个标识符即默认本地名（`{`/`*` 不属 [\w$]，不会误匹配纯命名/纯命名空间）。
    const defaultImportRe =
      /^[ \t]*import\s+([\w$]+)\s*(?:,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?\s*from\s*['"][^'"]+['"]/gm;
    while ((match = defaultImportRe.exec(scriptContent)) !== null) {
      if (match[1] === 't') return true;
    }
    // 命名空间导入：`import * as t from 'x'` 的本地名是 as 后的标识符。
    const namespaceImportRe = /^[ \t]*import\s+\*\s+as\s+([\w$]+)\s*from\s*['"][^'"]+['"]/gm;
    while ((match = namespaceImportRe.exec(scriptContent)) !== null) {
      if (match[1] === 't') return true;
    }

    return false;
  }

  /**
   * 提示「本地已有名为 t 的声明，故不注入 t 来源」。
   *
   * 跳过注入是保产物可编译的必要取舍（否则同作用域重复声明 t），但转换写出的 t() 此刻
   * 调用的是用户自己的那个 t —— 不是 i18n 运行时，页面上拿不到译文且不报错，必须让用户看见。
   */
  private warnLocalTShadowsInjection(filePath?: string): void {
    const key = filePath ?? '';
    if (this.localTShadowWarned.has(key)) return;
    this.localTShadowWarned.add(key);
    const where = filePath ? `：${FileUtils.getRelativePath(filePath)}` : '';
    LoggerUtils.warn(
      `⚠️ 跳过注入 t 来源${where}\n` +
        `   原因：文件里已有名为 t 的本地声明，再注入 import { t } 会重复声明同一标识符。\n` +
        `   影响：本次替换出的 t() 调用绑定到该本地 t，不会走 i18n 运行时。\n` +
        `   建议：把本地那个 t 改名，或手工确认它就是期望的翻译函数。`,
    );
  }

  /**
   * 从 tImport 配置路径导入 t 函数（用于纯 .ts/.js 文件）
   *
   * 两道跳过守卫与 SFC 路径 addPluginLocaleImportToScript 完全对齐：具名本地 t 导入、
   * 本地 t 声明（`const t = …` / 解构）任一存在都不注入，否则同一模块作用域重复声明 t
   * （TS2440 / SyntaxError）。纯 .ts/.js 整个文件即模块作用域，直接检测 code。
   */
  private addPluginLocaleImport(code: string, filePath?: string): string {
    if (this.hasNamedImportLocalT(code)) {
      return code;
    }
    if (this.hasLocalTDeclaration(code)) {
      this.warnLocalTShadowsInjection(filePath);
      return code;
    }
    return mergeNamedImport(code, this.tImport, ['t']);
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
