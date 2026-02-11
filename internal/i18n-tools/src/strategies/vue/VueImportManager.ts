import type { IImportManager } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import type { ExtractedString } from '../../utils/types';
import type { VueI18nLibrary } from './libraries';
import { VueI18nLibraryImpl } from './libraries';

/**
 * 管理 Vue i18n 转换中所需的 import 语句和相关代码
 */
export class VueImportManager implements IImportManager {
  private tImport: string;
  private library: VueI18nLibrary;

  constructor(tImport: string = '@/plugins/locale', library?: VueI18nLibrary) {
    this.tImport = tImport;
    this.library = library ?? new VueI18nLibraryImpl();
  }

  // ==================== 添加 Imports ====================

  /**
   * 处理所有导入和全局声明
   */
  handleGlobalImports(
    code: string,
    fileStrings: ExtractedString[],
    filePath?: string,
  ): string {
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
    const escapedPath = this.tImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(
        `import\\s*\\{[^}]*\\bt\\b[^}]*\\}\\s*from\\s*['"]${escapedPath}['"]`,
      ).test(code)
    ) {
      return code;
    }

    const lines = code.split('\n');
    let lastImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }

    const importStatement = `import { t } from '${this.tImport}';`;

    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, importStatement);
    } else {
      lines.unshift(importStatement);
    }

    return lines.join('\n');
  }

  /**
   * 添加 i18n 库导入 (实现接口方法)
   */
  addI18nImports(code: string, imports: string[]): string {
    return this.addLibraryImports(code, imports);
  }

  /**
   * 添加 Hook 导入（如 useI18n 或 useTranslation）
   */
  private addHookImport(code: string): string {
    if (this.library.getImportCheckRegex().test(code)) {
      return code;
    }

    const hookImport = this.library.generateImportStatement() + '\n';
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

    const scriptSetupMatch = code.match(
      /(<script[^>]*setup[^>]*>)([\s\S]*?)<\/script>/,
    );
    if (scriptSetupMatch) {
      const scriptTag = scriptSetupMatch[1]!;
      const scriptContent = scriptSetupMatch[2]!;
      const lines = scriptContent.split('\n');

      let insertIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i]!.trim();
        if (
          trimmed &&
          !trimmed.startsWith('import ') &&
          !trimmed.startsWith('//')
        ) {
          insertIndex = i;
          break;
        }
      }

      lines.splice(insertIndex, 0, declaration);
      const newScriptContent = lines.join('\n');
      return code.replace(
        scriptSetupMatch[0],
        `${scriptTag}${newScriptContent}</script>`,
      );
    }

    return code;
  }

  /**
   * 添加 i18n 库导入
   */
  private addLibraryImports(code: string, imports: string[]): string {
    const packageName = this.library.packageName;
    const importRegex = new RegExp(
      `import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"];?`,
    );
    const match = code.match(importRegex);
    if (match) {
      const existingImports = match[1]!.split(',').map((imp) => imp.trim());
      const newImports = [...new Set([...existingImports, ...imports])];
      return code.replace(
        match[0],
        `import { ${newImports.join(', ')} } from '${packageName}';`,
      );
    }
    const importStatement = `import { ${imports.join(', ')} } from '${packageName}';\n`;
    return this.addImportToScript(code, importStatement);
  }

  /**
   * 在 script 标签内添加 import 语句
   */
  private addImportToScript(code: string, importStatement: string): string {
    const scriptMatch = code.match(/(<script[^>]*>)([\s\S]*?)<\/script>/);
    if (!scriptMatch) {
      return code;
    }

    const scriptTag = scriptMatch[1]!;
    const scriptContent = scriptMatch[2]!;
    const lines = scriptContent.split('\n');
    const lastImportIndex = this.findLastImportIndex(lines);

    lines.splice(lastImportIndex + 1, 0, importStatement.trim());
    const newScriptContent = lines.join('\n');

    return code.replace(
      scriptMatch[0],
      `${scriptTag}${newScriptContent}</script>`,
    );
  }

  /**
   * 查找最后一个 import 语句的行号
   */
  private findLastImportIndex(lines: string[]): number {
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    return lastImportIndex;
  }

  // ==================== 清理 Imports 和相关代码 ====================

  /**
   * 转换代码中的 Unicode 编码为中文字符
   */
  static convertUnicodeToChineseInCode(code: string): string {
    // 处理单引号字符串中的 Unicode 编码
    code = code.replace(/'([^']*\\u[0-9a-fA-F]{4}[^']*)'/g, (match) => {
      const unicodeStr = match.slice(1, -1);
      try {
        const decoded = unicodeStr.replace(
          /\\u([0-9a-fA-F]{4})/g,
          (_subMatch, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
          },
        );
        return `'${decoded}'`;
      } catch {
        return match;
      }
    });

    // 处理双引号字符串中的 Unicode 编码
    code = code.replace(/"([^"]*\\u[0-9a-fA-F]{4}[^"]*)"/g, (match) => {
      const unicodeStr = match.slice(1, -1);
      try {
        const decoded = unicodeStr.replace(
          /\\u([0-9a-fA-F]{4})/g,
          (_subMatch, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
          },
        );
        return `"${decoded}"`;
      } catch {
        return match;
      }
    });

    // 处理模板字符串中的 Unicode 编码
    code = code.replace(/`([^`]*\\u[0-9a-fA-F]{4}[^`]*)`/g, (match) => {
      const templateStr = match.slice(1, -1);
      try {
        const decoded = templateStr.replace(
          /\\u([0-9a-fA-F]{4})/g,
          (_subMatch, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
          },
        );
        return `\`${decoded}\``;
      } catch {
        return match;
      }
    });

    return code;
  }

  /**
   * 清理导入语句（用于 restore 操作）
   * 支持传入 library 实例来检测对应包的导入
   */
  static cleanupImports(
    node: ts.ImportDeclaration,
    library?: VueI18nLibrary,
  ): ts.Node {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
      return node;
    }

    const moduleName = node.moduleSpecifier.text;

    if (library) {
      if (library.isLibraryImport(moduleName)) {
        return ts.factory.createNotEmittedStatement(node);
      }
    } else {
      // 向后兼容：默认清理 vue-i18n
      if (moduleName === 'vue-i18n') {
        return ts.factory.createNotEmittedStatement(node);
      }
    }

    return node;
  }

  /**
   * 清理变量声明语句（移除 Hook 相关声明）
   * 支持传入 library 实例来检测对应 Hook
   */
  static cleanupVariableStatements(
    node: ts.VariableStatement,
    library?: VueI18nLibrary,
  ): ts.Node {
    const lib = library ?? new VueI18nLibraryImpl();

    const filteredDeclarations = node.declarationList.declarations.filter(
      (declaration) => {
        if (ts.isIdentifier(declaration.name)) {
          if (
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer)
          ) {
            const expression = declaration.initializer.expression;
            if (
              ts.isIdentifier(expression) &&
              lib.isHookDeclaration(expression.text)
            ) {
              return false;
            }
          }
        }

        // 移除解构 const { t } = useI18n() / useTranslation()
        if (ts.isObjectBindingPattern(declaration.name)) {
          if (
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer)
          ) {
            const expression = declaration.initializer.expression;
            if (
              ts.isIdentifier(expression) &&
              lib.isHookDeclaration(expression.text)
            ) {
              return false;
            }
          }

          const elements = declaration.name.elements.filter((element) => {
            if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
              return element.name.text !== 't';
            }
            return true;
          });

          if (elements.length === 0) {
            return false;
          }
        }

        return true;
      },
    );

    if (filteredDeclarations.length === 0) {
      return ts.factory.createNotEmittedStatement(node);
    }

    if (
      filteredDeclarations.length < node.declarationList.declarations.length
    ) {
      return ts.factory.updateVariableStatement(
        node,
        node.modifiers,
        ts.factory.updateVariableDeclarationList(
          node.declarationList,
          filteredDeclarations,
        ),
      );
    }

    return node;
  }

  /**
   * 清理 Composition API 中的 Hook 依赖
   */
  static cleanupHookDependencies(node: ts.CallExpression): ts.Node {
    if (!ts.isIdentifier(node.expression)) {
      return node;
    }

    const hookName = node.expression.text;

    if (!['watch', 'watchEffect', 'computed'].includes(hookName)) {
      return node;
    }

    if (hookName === 'watch' && node.arguments[1]) {
      const depsArg = node.arguments[1];

      if (ts.isArrayLiteralExpression(depsArg)) {
        const filteredElements = depsArg.elements.filter((element) => {
          if (ts.isIdentifier(element) && element.text === 't') {
            return false;
          }
          return true;
        });

        if (filteredElements.length !== depsArg.elements.length) {
          const newDepsArray =
            ts.factory.createArrayLiteralExpression(filteredElements);
          const newArguments = [...node.arguments];
          newArguments[1] = newDepsArray;
          return ts.factory.updateCallExpression(
            node,
            node.expression,
            node.typeArguments,
            newArguments,
          );
        }
      }
    }

    return node;
  }
}
