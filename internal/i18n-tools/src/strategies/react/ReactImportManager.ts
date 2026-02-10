import type { IImportManager } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { ExtractedString, TransformContext } from '../../utils/types';
import type { ReactI18nLibrary } from './libraries';

/**
 * 管理i18n转换中所需的import语句和相关代码
 */
export class ReactImportManager implements IImportManager {
  private tImport: string;
  private library: ReactI18nLibrary;

  constructor(tImport: string = '@/plugins/locale', library: ReactI18nLibrary) {
    this.tImport = tImport;
    this.library = library;
  }

  // ==================== 添加 Imports ====================

  /**
   * 处理所有导入和全局声明
   */
  handleGlobalImports(code: string, fileStrings: ExtractedString[]): string {
    if (fileStrings.length === 0) {
      return code;
    }

    let updatedCode = code;

    // 检查是否需要全局函数 (非React组件上下文)
    if (this.needsGlobalFunction(fileStrings)) {
      updatedCode = this.addGlobalFunctionImport(updatedCode);
      const globalDeclaration = this.library.generateGlobalDeclaration();
      if (globalDeclaration) {
        updatedCode = this.addGlobalFunctionDeclaration(
          updatedCode,
          globalDeclaration,
        );
      }
    }
    return updatedCode;
  }

  private needsGlobalFunction(fileStrings: ExtractedString[]): boolean {
    return fileStrings.some((str) => str.componentType === 'other');
  }

  private addGlobalFunctionImport(code: string): string {
    const funcName = this.library.globalFunctionName.split('.')[0]!;
    const escapedPath = this.tImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(
        `import\\s*\\{.*${funcName}.*\\}\\s*from\\s*['"]${escapedPath}['"]`,
      ).test(code)
    ) {
      return code;
    }
    const importStatement = `import { ${funcName} } from '${this.tImport}';\n`;
    return this.addImportStatement(code, importStatement);
  }

  private addGlobalFunctionDeclaration(
    code: string,
    declaration: string,
  ): string {
    // 检查是否已存在
    if (code.includes(declaration.trim())) {
      return code;
    }

    const lines = code.split('\n');
    const lastImportIndex = this.findLastImportIndex(lines);
    lines.splice(lastImportIndex + 1, 0, '\n' + declaration.trim());
    return lines.join('\n');
  }

  /**
   * 添加i18n库导入 (实现接口方法)
   */
  addI18nImports(code: string, imports: string[]): string {
    return this.addLibraryImports(code, imports);
  }

  /**
   * 添加 i18n 库导入
   */
  private addLibraryImports(code: string, imports: string[]): string {
    const packageName = this.library.packageName;
    const escapedPkg = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const importRegex = new RegExp(
      `import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escapedPkg}['"];?`,
    );
    const match = code.match(importRegex);
    let updatedCode = code;
    if (match) {
      const existingImports = match[1]!.split(',').map((imp) => imp.trim());
      const newImports = [...new Set([...existingImports, ...imports])];
      updatedCode = code.replace(
        match[0],
        `import { ${newImports.join(', ')} } from '${packageName}';`,
      );
    } else {
      const importStatement = `import { ${imports.join(', ')} } from '${packageName}';\n`;
      updatedCode = this.addImportStatement(code, importStatement);
    }
    return updatedCode;
  }

  private addImportStatement(code: string, importStatement: string): string {
    const lines = code.split('\n');
    const lastImportIndex = this.findLastImportIndex(lines);
    lines.splice(lastImportIndex + 1, 0, importStatement.trim());
    return lines.join('\n');
  }

  private findLastImportIndex(lines: string[]): number {
    let lastImportIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i]!.trim().startsWith('import ')) {
        lastImportIndex = i;
        break;
      }
    }
    return lastImportIndex;
  }

  // ==================== 清理 Imports 和相关代码 ====================

  /**
   * 转换代码中的Unicode编码为中文字符
   */
  static convertUnicodeToChineseInCode(code: string): string {
    // 处理单引号字符串中的Unicode编码（包含混合内容）
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

    // 处理双引号字符串中的Unicode编码
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

    // 处理JSX表达式中的Unicode编码
    code = code.replace(/\{'([^']*\\u[0-9a-fA-F]{4}[^']*)'\}/g, (match) => {
      const unicodeStr = match.slice(2, -2);
      try {
        const decoded = unicodeStr.replace(
          /\\u([0-9a-fA-F]{4})/g,
          (_subMatch, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
          },
        );
        return `{'${decoded}'}`;
      } catch {
        return match;
      }
    });

    // 处理模板字符串中的Unicode编码
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

  // ==================== 清理 AST 节点 ====================

  /**
   * 解除 HOC 的包裹（由 library 适配器驱动）
   */
  static unwrapHOC(
    node: ts.Node,
    context: TransformContext,
    library: ReactI18nLibrary,
  ): ts.Node {
    // case 1: export default HOC(Component)
    if (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) {
      if (library.isHOCCall(node.expression)) {
        const wrappedComponent = library.getHOCWrappedComponent(
          node.expression,
        );
        if (wrappedComponent) {
          const arg = node.expression.arguments[0]!;
          return ts.factory.updateExportAssignment(node, node.modifiers, arg);
        }
      }
    }

    // case 2: const Injected = HOC(Component)
    if (ts.isVariableStatement(node)) {
      const remainingDeclarations = node.declarationList.declarations.filter(
        (decl) => {
          if (ts.isIdentifier(decl.name)) {
            return !context.componentNameMap.has(decl.name.text);
          }
          return true;
        },
      );

      if (remainingDeclarations.length === 0) {
        return ts.factory.createNotEmittedStatement(node);
      }

      if (
        remainingDeclarations.length < node.declarationList.declarations.length
      ) {
        const newDeclList = ts.factory.updateVariableDeclarationList(
          node.declarationList,
          remainingDeclarations,
        );
        return ts.factory.updateVariableStatement(
          node,
          node.modifiers,
          newDeclList,
        );
      }
    }

    // case 3: class _Comp ... (通常由HOC引入)
    if (
      ts.isClassDeclaration(node) &&
      node.name &&
      node.name.text.startsWith('_')
    ) {
      const newName = node.name.text.substring(1);
      return ts.factory.updateClassDeclaration(
        node,
        node.modifiers,
        ts.factory.createIdentifier(newName),
        node.typeParameters,
        node.heritageClauses,
        node.members,
      );
    }

    return node;
  }

  /**
   * 根据上下文中的映射重命名组件
   */
  static renameComponent(node: ts.Node, context: TransformContext): ts.Node {
    if (
      ts.isJsxOpeningElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxClosingElement(node)
    ) {
      const tagName = node.tagName;
      if (
        ts.isIdentifier(tagName) &&
        context.componentNameMap.has(tagName.text)
      ) {
        const newName = context.componentNameMap.get(tagName.text)!;
        const newTagName = ts.factory.createIdentifier(newName);

        if (ts.isJsxOpeningElement(node)) {
          return ts.factory.updateJsxOpeningElement(
            node,
            newTagName,
            node.typeArguments,
            node.attributes,
          );
        }
        if (ts.isJsxSelfClosingElement(node)) {
          return ts.factory.updateJsxSelfClosingElement(
            node,
            newTagName,
            node.typeArguments,
            node.attributes,
          );
        }
        if (ts.isJsxClosingElement(node)) {
          return ts.factory.updateJsxClosingElement(node, newTagName);
        }
      }
    }

    return node;
  }

  /**
   * 清理 HOC Props 类型引用（由 library 适配器驱动）
   */
  static cleanupHOCPropsType(
    node: ts.Node,
    library: ReactI18nLibrary,
  ): ts.Node {
    const propsType = library.hocPropsType;

    // case 1: `extends HOCPropsType`
    if (ts.isHeritageClause(node)) {
      const newTypes = node.types.filter((type) => {
        return !(
          ts.isExpressionWithTypeArguments(type) &&
          ts.isIdentifier(type.expression) &&
          type.expression.text === propsType
        );
      });
      if (newTypes.length !== node.types.length) {
        if (newTypes.length === 0) {
          return ts.factory.createNotEmittedStatement(node);
        }
        return ts.factory.updateHeritageClause(node, newTypes);
      }
    }

    // case 2: `type T = HOCPropsType & {}`
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === propsType
    ) {
      return ts.factory.createTypeLiteralNode([]);
    }

    // case 3: 处理交叉类型
    if (ts.isIntersectionTypeNode(node)) {
      const newTypes = node.types.filter((type) => {
        return !(
          ts.isTypeReferenceNode(type) &&
          ts.isIdentifier(type.typeName) &&
          type.typeName.text === propsType
        );
      });

      if (newTypes.length === 1) {
        return newTypes[0]!;
      }
      if (newTypes.length !== node.types.length) {
        return ts.factory.updateIntersectionTypeNode(
          node,
          ts.factory.createNodeArray(newTypes),
        );
      }
    }

    return node;
  }

  /**
   * 清理导入语句 (AST)
   */
  static cleanupImports(
    node: ts.ImportDeclaration,
    tImport: string,
    library: ReactI18nLibrary,
  ): ts.Node {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
      return node;
    }

    const moduleName = node.moduleSpecifier.text;

    // 清理 i18n 库相关导入
    if (moduleName === library.packageName) {
      return ts.factory.createNotEmittedStatement(node);
    }

    // 清理全局函数相关导入
    if (moduleName === tImport) {
      return ts.factory.createNotEmittedStatement(node);
    }

    return node;
  }

  /**
   * 清理变量声明语句 (AST)（由 library 适配器驱动）
   */
  static cleanupVariableStatements(
    node: ts.VariableStatement,
    library: ReactI18nLibrary,
  ): ts.Node {
    const filteredDeclarations = node.declarationList.declarations.filter(
      (declaration) => {
        // 移除 Hook 声明 (useIntl / useTranslation)
        if (library.isHookDeclaration(declaration)) {
          return false;
        }

        // 移除全局函数声明 (getIntl)
        if (library.isGlobalFunctionDeclaration(declaration)) {
          return false;
        }

        // 移除解构中的翻译变量
        if (ts.isObjectBindingPattern(declaration.name)) {
          const varName = library.translationVarName;
          const elements = declaration.name.elements.filter((element) => {
            if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
              return element.name.text !== varName;
            }
            return true;
          });

          if (elements.length === 0) {
            return false;
          }

          if (elements.length !== declaration.name.elements.length) {
            const newBindingPattern =
              ts.factory.createObjectBindingPattern(elements);
            declaration = ts.factory.updateVariableDeclaration(
              declaration,
              newBindingPattern,
              declaration.exclamationToken,
              declaration.type,
              declaration.initializer,
            );
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
   * 清理Hook依赖数组中的翻译变量引用 (AST)
   */
  static cleanupHookDependencies(
    node: ts.CallExpression,
    library: ReactI18nLibrary,
  ): ts.Node {
    if (!ts.isIdentifier(node.expression)) {
      return node;
    }

    const hookName = node.expression.text;
    if (!['useCallback', 'useMemo', 'useEffect'].includes(hookName)) {
      return node;
    }

    const depsArg = node.arguments[1];
    if (!depsArg || !ts.isArrayLiteralExpression(depsArg)) {
      return node;
    }

    const varName = library.translationVarName;
    const filteredElements = depsArg.elements.filter((element) => {
      if (ts.isIdentifier(element) && element.text === varName) {
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

    return node;
  }
}
