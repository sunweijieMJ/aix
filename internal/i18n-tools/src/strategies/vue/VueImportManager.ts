import type { IImportManager } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import type { ExtractedString } from '../../utils/types';

/**
 * 管理 Vue i18n 转换中所需的 import 语句和相关代码
 */
export class VueImportManager implements IImportManager {
  // ==================== 添加 Imports ====================

  /**
   * 处理所有导入和全局声明
   * @param code - 源代码
   * @param fileStrings - 提取的字符串信息
   * @param filePath - 文件路径（用于判断文件类型）
   * @returns 更新后的代码
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

    // 检查是否是纯 .ts 或 .js 文件
    if (ext === 'ts' || ext === 'js') {
      // 对于纯 .ts/.js 文件，从 @/plugins/locale 导入 t
      updatedCode = this.addPluginLocaleImport(updatedCode);
    } else {
      // 对于 .vue 文件
      const isScriptSetup = /<script\s+setup/.test(code);

      if (isScriptSetup) {
        // 对于 Composition API (script setup)，添加 useI18n
        updatedCode = this.addUseI18nImport(updatedCode);
        updatedCode = this.addUseI18nDeclaration(updatedCode);
      } else {
        // 对于 Options API，不需要额外导入，直接使用 this.$t
      }
    }

    return updatedCode;
  }

  /**
   * 添加从 @/plugins/locale 导入 t 函数（用于纯 .ts/.js 文件）
   * @param code - 源代码
   * @returns 更新后的代码
   */
  private addPluginLocaleImport(code: string): string {
    // 检查是否已经导入了 t
    if (
      /import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/.test(
        code,
      )
    ) {
      return code;
    }

    // 查找最后一个 import 语句的位置
    const lines = code.split('\n');
    let lastImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }

    const importStatement = "import { t } from '@/plugins/locale';";

    if (lastImportIndex >= 0) {
      // 在最后一个 import 后面插入
      lines.splice(lastImportIndex + 1, 0, importStatement);
    } else {
      // 如果没有 import，在文件开头插入
      lines.unshift(importStatement);
    }

    return lines.join('\n');
  }

  /**
   * 添加 i18n 库导入 (实现接口方法)
   * @param code - 源代码
   * @param imports - 导入项数组
   * @returns 更新后的代码
   */
  addI18nImports(code: string, imports: string[]): string {
    return this.addVueI18nImports(code, imports);
  }

  /**
   * 添加 useI18n 导入
   * @param code - 源代码
   * @returns 更新后的代码
   */
  private addUseI18nImport(code: string): string {
    // 检查是否已经导入了 useI18n
    if (/import\s*\{[^}]*useI18n[^}]*\}\s*from\s*['"]vue-i18n['"]/.test(code)) {
      return code;
    }

    const useI18nImport = "import { useI18n } from 'vue-i18n';\n";
    return this.addImportToScript(code, useI18nImport);
  }

  /**
   * 添加 useI18n 声明 (const { t } = useI18n())
   * @param code - 源代码
   * @returns 更新后的代码
   */
  private addUseI18nDeclaration(code: string): string {
    // 检查是否已经声明了 useI18n
    if (/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/.test(code)) {
      return code;
    }

    // 在 script setup 中添加 const { t } = useI18n();
    const declaration = 'const { t } = useI18n();\n';

    // 找到 script setup 标签后的第一个有效代码行，在它之前插入
    const scriptSetupMatch = code.match(
      /<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/,
    );
    if (scriptSetupMatch) {
      const scriptContent = scriptSetupMatch[1]!;
      const lines = scriptContent.split('\n');

      // 找到第一个非导入、非空行的位置
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

      // 在合适的位置插入声明
      lines.splice(insertIndex, 0, declaration);
      const newScriptContent = lines.join('\n');
      return code.replace(
        scriptSetupMatch[0],
        `<script setup lang="ts">${newScriptContent}</script>`,
      );
    }

    return code;
  }

  /**
   * 添加 vue-i18n 导入
   * @param code - 源代码
   * @param imports - 导入项数组（如 ['useI18n']）
   * @returns 更新后的代码
   */
  private addVueI18nImports(code: string, imports: string[]): string {
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]vue-i18n['"];?/;
    const match = code.match(importRegex);
    let updatedCode = code;

    if (match) {
      const existingImports = match[1]!.split(',').map((imp) => imp.trim());
      const newImports = [...new Set([...existingImports, ...imports])];
      updatedCode = code.replace(
        match[0],
        `import { ${newImports.join(', ')} } from 'vue-i18n';`,
      );
    } else {
      const importStatement = `import { ${imports.join(', ')} } from 'vue-i18n';\n`;
      updatedCode = this.addImportToScript(code, importStatement);
    }

    return updatedCode;
  }

  /**
   * 在 script 标签内添加 import 语句
   * @param code - 完整的 .vue 文件代码
   * @param importStatement - 要添加的 import 语句
   * @returns 更新后的代码
   */
  private addImportToScript(code: string, importStatement: string): string {
    // 匹配 script 标签
    const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) {
      return code;
    }

    const scriptContent = scriptMatch[1]!;
    const lines = scriptContent.split('\n');
    const lastImportIndex = this.findLastImportIndex(lines);

    lines.splice(lastImportIndex + 1, 0, importStatement.trim());
    const newScriptContent = lines.join('\n');

    return code.replace(
      scriptMatch[0],
      `<script setup lang="ts">${newScriptContent}</script>`,
    );
  }

  /**
   * 查找最后一个 import 语句的行号
   * @param lines - 代码行数组
   * @returns 最后一个 import 语句的行号
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
   * @param code - 代码字符串
   * @returns 转换后的代码
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
   * @param node - 导入声明节点
   * @returns 清理后的节点
   */
  static cleanupImports(node: ts.ImportDeclaration): ts.Node {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
      return node;
    }

    const moduleName = node.moduleSpecifier.text;

    // 清理 vue-i18n 相关导入
    if (moduleName === 'vue-i18n') {
      return ts.factory.createNotEmittedStatement(node);
    }

    return node;
  }

  /**
   * 清理变量声明语句（移除 useI18n 相关声明）
   * @param node - 变量声明语句节点
   * @returns 清理后的节点
   */
  static cleanupVariableStatements(node: ts.VariableStatement): ts.Node {
    const filteredDeclarations = node.declarationList.declarations.filter(
      (declaration) => {
        if (ts.isIdentifier(declaration.name)) {
          // 移除 useI18n 相关的变量声明: const { t } = useI18n()
          if (
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer)
          ) {
            const expression = declaration.initializer.expression;
            if (ts.isIdentifier(expression) && expression.text === 'useI18n') {
              return false;
            }
          }
        }

        // 移除解构 const { t } = useI18n()
        if (ts.isObjectBindingPattern(declaration.name)) {
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
   * 清理 Composition API 中的 Hook 依赖（如果需要）
   * @param node - 调用表达式节点
   * @returns 清理后的节点
   */
  static cleanupHookDependencies(node: ts.CallExpression): ts.Node {
    if (!ts.isIdentifier(node.expression)) {
      return node;
    }

    const hookName = node.expression.text;

    // Vue 的 watch, watchEffect 等 Hook
    if (!['watch', 'watchEffect', 'computed'].includes(hookName)) {
      return node;
    }

    // 对于 watch，检查依赖数组
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
