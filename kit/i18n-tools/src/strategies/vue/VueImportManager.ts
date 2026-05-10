import type { IImportManager } from '../../adapters/FrameworkAdapter';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import type { ExtractedString } from '../../utils/types';
import type { VueI18nLibrary } from './libraries';

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
      const isScriptSetup = /<script\s+setup/.test(code);
      const hasScriptStrings = fileStrings.some(
        (s) => s.context === 'script' || s.context === 'js-code',
      );

      if (isScriptSetup && hasScriptStrings) {
        // SFC + script setup 注入 const { t } = useI18n() 之前同样要清理占位声明。
        updatedCode = this.stripPlaceholderTDeclares(updatedCode);
        updatedCode = this.addHookImport(updatedCode);
        updatedCode = this.addHookDeclaration(updatedCode);
      }
    }

    return updatedCode;
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
   * 添加 Hook 导入（如 useI18n 或 useTranslation）
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
   */
  addHookDeclaration(code: string): string {
    if (this.library.getHookDeclarationCheckRegex().test(code)) {
      return code;
    }

    const declaration = this.library.generateHookDeclaration() + '\n';

    const scriptSetupMatch = code.match(/(<script[^>]*setup[^>]*>)([\s\S]*?)<\/script>/);
    if (scriptSetupMatch) {
      const scriptTag = scriptSetupMatch[1]!;
      const scriptContent = scriptSetupMatch[2]!;
      const lines = scriptContent.split('\n');

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
      const newScriptContent = lines.join('\n');
      return code.replace(scriptSetupMatch[0], `${scriptTag}${newScriptContent}</script>`);
    }

    return code;
  }

  /**
   * 在 <script> 块内合并/追加命名导入（对 SFC 文件，避免误匹配 template/style 中的相似字符串）
   */
  private mergeNamedImportInScript(code: string, packageName: string, names: string[]): string {
    const scriptMatch = VueImportManager.matchScriptBlock(code);
    if (!scriptMatch) return code;
    const scriptTag = scriptMatch[1]!;
    const scriptContent = scriptMatch[2]!;
    const updatedScript = CommonASTUtils.mergeNamedImport(scriptContent, packageName, names);
    return code.replace(scriptMatch[0], `${scriptTag}${updatedScript}</script>`);
  }

  /**
   * 在 <script> 块内追加一条 import 语句
   */
  private addImportToScript(code: string, importStatement: string): string {
    const scriptMatch = VueImportManager.matchScriptBlock(code);
    if (!scriptMatch) return code;
    const scriptTag = scriptMatch[1]!;
    const scriptContent = scriptMatch[2]!;
    const updatedScript = CommonASTUtils.appendImportLine(scriptContent, importStatement);
    return code.replace(scriptMatch[0], `${scriptTag}${updatedScript}</script>`);
  }

  /**
   * 定位 SFC 中需要写入 import / hook 的 <script> 块。
   *
   * Why: 一个 SFC 可同时存在 <script> 与 <script setup>（Vue 3 合法用法）。
   *      naïvely 用 /<script[^>]*>/ 总会命中文档中第一个 <script>，
   *      把 import 错误地塞进非 setup 块，导致 hook/composable 不可用。
   *      因此优先匹配带 setup 的 script 块，没有时再回落到普通 script。
   */
  private static matchScriptBlock(code: string): RegExpMatchArray | null {
    const setupMatch = code.match(/(<script[^>]*\bsetup\b[^>]*>)([\s\S]*?)<\/script>/);
    if (setupMatch) return setupMatch;
    return code.match(/(<script[^>]*>)([\s\S]*?)<\/script>/);
  }
}
