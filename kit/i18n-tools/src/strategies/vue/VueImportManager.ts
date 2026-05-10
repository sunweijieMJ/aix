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
      updatedCode = this.addPluginLocaleImport(updatedCode);
    } else {
      const isScriptSetup = /<script\s+setup/.test(code);
      const hasScriptStrings = fileStrings.some(
        (s) => s.context === 'script' || s.context === 'js-code',
      );

      if (isScriptSetup && hasScriptStrings) {
        updatedCode = this.addHookImport(updatedCode);
        updatedCode = this.addHookDeclaration(updatedCode);
      }
    }

    return updatedCode;
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
