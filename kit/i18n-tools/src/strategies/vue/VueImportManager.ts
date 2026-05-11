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
        updatedCode = this.addPluginLocaleImportToNonSetupScript(updatedCode);
      } else if (hasSetup) {
        // 仅 <script setup>：标准 useI18n hook 注入路径
        updatedCode = this.addHookImport(updatedCode);
        updatedCode = this.addHookDeclaration(updatedCode);
      } else {
        // 仅普通 <script>：按需为模块顶层裸 t() 注入 import
        updatedCode = this.addPluginLocaleImportToNonSetupScript(updatedCode);
      }
    }

    return updatedCode;
  }

  /**
   * 若 SFC 的非-setup <script> 块（或 SFC 唯一 <script> 块）内含裸 t() 调用，
   * 向该块顶部注入 `import { t } from tImport`。已存在则跳过。
   *
   * 适用场景：
   *   - 仅 <script>（Options API + 模块顶层调用）
   *   - 双块共存（非-setup 块为模块顶层 import 锚点，setup 块共享作用域复用）
   * 不适用 <script setup> 单存场景 —— 那种走 useI18n hook 注入路径。
   */
  private addPluginLocaleImportToNonSetupScript(code: string): string {
    const block = VueImportManager.findScriptBlock(code, { nonSetupOnly: true });
    if (!block) return code;

    // 检测块内是否存在裸 t() 调用
    // 用负向先行排除 this.t / `xt(` / `$t(` 等误匹配
    if (!/(?:^|[^\w.$])t\s*\(/.test(block.content)) return code;

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
   * 添加 Hook 导入（如 useI18n 或 useTranslation）。
   *
   * 仅在 <script setup> 单块场景调用 —— 双块共存场景由 handleGlobalImports 改走
   * 模块顶层 import { t } from tImport 路径，setup 块直接复用，不注入 hook。
   */
  private addHookImport(code: string): string {
    if (this.library.getImportCheckRegex().test(code)) {
      return code;
    }
    const hookImport = this.library.generateImportStatement();
    return this.addImportToScript(code, hookImport);
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
   * 在 <script> 块内追加一条 import 语句
   */
  private addImportToScript(code: string, importStatement: string): string {
    const block = VueImportManager.findScriptBlock(code);
    if (!block) return code;
    const updatedScript = CommonASTUtils.appendImportLine(block.content, importStatement);
    return code.slice(0, block.start) + updatedScript + code.slice(block.end);
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
