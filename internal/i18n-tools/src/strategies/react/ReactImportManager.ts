import type { IImportManager } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { ExtractedString, TransformContext } from '../../utils/types';

/**
 * 管理i18n转换中所需的import语句和相关代码
 */
export class ReactImportManager implements IImportManager {
  // ==================== 添加 Imports ====================

  /**
   * 处理所有导入和全局声明
   * @param code - 源代码
   * @param fileStrings - 提取的字符串信息
   * @returns 更新后的代码
   */
  handleGlobalImports(code: string, fileStrings: ExtractedString[]): string {
    if (fileStrings.length === 0) {
      return code;
    }

    let updatedCode = code;

    // 检查是否需要 getIntl (非React组件上下文)
    if (this.needsGetIntl(fileStrings)) {
      updatedCode = this.addGetIntlImport(updatedCode);
      updatedCode = this.addGetIntlDeclaration(updatedCode);
    }
    return updatedCode;
  }

  /**
   * 检查是否需要getIntl
   * @param fileStrings
   */
  private needsGetIntl(fileStrings: ExtractedString[]): boolean {
    return fileStrings.some((str) => str.componentType === 'other');
  }

  /**
   * 添加getIntl导入
   */
  private addGetIntlImport(code: string): string {
    if (
      /import\s*\{.*getIntl.*\}\s*from\s*['"]@\/plugins\/locale['"]/.test(code)
    ) {
      return code;
    }
    const getIntlImport = "import { getIntl } from '@/plugins/locale';\n";
    return this.addImportStatement(code, getIntlImport);
  }

  /**
   * 添加getIntl声明
   */
  private addGetIntlDeclaration(code: string): string {
    if (/const\s+intl\s*=\s*getIntl\(\)/.test(code)) {
      return code;
    }

    const getIntlDeclaration = '\nconst intl = getIntl();';
    const lines = code.split('\n');
    const lastImportIndex = this.findLastImportIndex(lines);

    lines.splice(lastImportIndex + 1, 0, getIntlDeclaration);
    return lines.join('\n');
  }

  /**
   * 添加i18n库导入 (实现接口方法)
   * @param code - 源代码
   * @param imports - 导入项数组
   * @returns 更新后的代码
   */
  addI18nImports(code: string, imports: string[]): string {
    return this.addReactIntlImports(code, imports);
  }

  /**
   * 添加react-intl导入
   * @param imports - 导入项数组
   */
  private addReactIntlImports(code: string, imports: string[]): string {
    const importRegex = /import\s*{([^}]+)}\s*from\s*['"]react-intl['"];?/;
    const match = code.match(importRegex);
    let updatedCode = code;
    if (match) {
      const existingImports = match[1]!.split(',').map((imp) => imp.trim());
      const newImports = [...new Set([...existingImports, ...imports])];
      updatedCode = code.replace(
        match[0],
        `import { ${newImports.join(', ')} } from 'react-intl';`,
      );
    } else {
      const importStatement = `import { ${imports.join(', ')} } from 'react-intl';\n`;
      updatedCode = this.addImportStatement(code, importStatement);
    }
    return updatedCode;
  }

  /**
   * 在合适的位置添加import语句
   * @param importStatement - 完整的import语句
   * @returns 更新后的代码
   */
  private addImportStatement(code: string, importStatement: string): string {
    const lines = code.split('\n');
    const lastImportIndex = this.findLastImportIndex(lines);
    lines.splice(lastImportIndex + 1, 0, importStatement.trim());
    return lines.join('\n');
  }

  /**
   * 查找最后一个import语句的行号
   * @param lines - 代码行数组
   * @returns 最后一个import语句的行号
   */
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
   * @param code - 代码字符串
   * @returns 转换后的代码
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

    // 处理JSX表达式中的Unicode编码 {'\u4e2d\u6587'}
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

    // 处理模板字符串中的Unicode编码 `\u4e2d\u6587${var}`
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
   * 解除 injectIntl HOC 的包裹
   * @param node - AST节点
   * @param context - 转换上下文
   * @returns 转换后的节点
   */
  static unwrapInjectIntl(node: ts.Node, context: TransformContext): ts.Node {
    // case 1: export default injectIntl(Component)
    if (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) {
      const callExpr = node.expression;
      if (
        ts.isIdentifier(callExpr.expression) &&
        callExpr.expression.text === 'injectIntl' &&
        callExpr.arguments[0]
      ) {
        return ts.factory.updateExportAssignment(
          node,
          node.modifiers,
          callExpr.arguments[0],
        );
      }
    }

    // case 2: const Injected = injectIntl(Component)
    // 此时只做删除，重命名操作已在 prepass 和 renameComponent 中处理
    if (ts.isVariableStatement(node)) {
      const remainingDeclarations = node.declarationList.declarations.filter(
        (decl) => {
          if (ts.isIdentifier(decl.name)) {
            return !context.componentNameMap.has(decl.name.text);
          }
          return true;
        },
      );

      // 如果所有声明都被移除了，则删除整个语句
      if (remainingDeclarations.length === 0) {
        return ts.factory.createNotEmittedStatement(node);
      }

      // 否则，更新变量声明列表
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
   * @param node - AST节点
   * @param context - 转换上下文
   * @returns 转换后的节点
   */
  static renameComponent(node: ts.Node, context: TransformContext): ts.Node {
    // 重命名 JSX 标签
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
   * 清理对 WrappedComponentProps 的类型引用
   * @param node - AST节点
   * @returns 转换后的节点
   */
  static cleanupWrappedComponentProps(node: ts.Node): ts.Node {
    // case 1: `extends WrappedComponentProps`
    if (ts.isHeritageClause(node)) {
      const newTypes = node.types.filter((type) => {
        return !(
          ts.isExpressionWithTypeArguments(type) &&
          ts.isIdentifier(type.expression) &&
          type.expression.text === 'WrappedComponentProps'
        );
      });
      if (newTypes.length !== node.types.length) {
        // 如果过滤后没有类型了, 直接移除这个heritage clause
        if (newTypes.length === 0) {
          return ts.factory.createNotEmittedStatement(node);
        }
        return ts.factory.updateHeritageClause(node, newTypes);
      }
    }

    // case 2: `type T = WrappedComponentProps & {}`
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === 'WrappedComponentProps'
    ) {
      // 通常这个节点被包含在 ts.IntersectionTypeNode 或 ts.UnionTypeNode 中
      // 在父节点中处理它会更简单。
      // 这里返回一个空对象类型，父节点在过滤时可以轻易移除
      return ts.factory.createTypeLiteralNode([]);
    }

    // case 3: 处理交叉类型 `type T = A & B`
    if (ts.isIntersectionTypeNode(node)) {
      const newTypes = node.types.filter((type) => {
        return !(
          ts.isTypeReferenceNode(type) &&
          ts.isIdentifier(type.typeName) &&
          type.typeName.text === 'WrappedComponentProps'
        );
      });

      // 如果只有一个类型剩下，就不是交叉类型了
      if (newTypes.length === 1) {
        return newTypes[0]!;
      }
      return ts.factory.updateIntersectionTypeNode(
        node,
        ts.factory.createNodeArray(newTypes),
      );
    }

    return node;
  }

  /**
   * 清理导入语句 (AST)
   * @param node - 导入声明节点
   * @returns 清理后的节点
   */
  static cleanupImports(node: ts.ImportDeclaration): ts.Node {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
      return node;
    }

    const moduleName = node.moduleSpecifier.text;

    // 清理react-intl相关导入
    if (moduleName === 'react-intl') {
      // 完全移除react-intl导入，因为我们不再需要任何国际化功能
      return ts.factory.createNotEmittedStatement(node);
    }

    // 清理 getIntl 相关导入
    if (moduleName === '@/plugins/locale') {
      // 完全移除@/plugins/locale导入，因为我们不再需要getIntl
      return ts.factory.createNotEmittedStatement(node);
    }

    return node;
  }

  /**
   * 清理变量声明语句 (AST)
   * @param node - 变量声明语句节点
   * @returns 清理后的节点
   */
  static cleanupVariableStatements(node: ts.VariableStatement): ts.Node {
    // 不再删除消息常量，只删除intl相关的变量声明
    const filteredDeclarations = node.declarationList.declarations.filter(
      (declaration) => {
        if (ts.isIdentifier(declaration.name)) {
          // 移除useIntl相关的变量声明
          if (
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer)
          ) {
            const expression = declaration.initializer.expression;
            if (ts.isIdentifier(expression) && expression.text === 'useIntl') {
              return false;
            }
            // 移除 getIntl 相关的变量声明
            if (ts.isIdentifier(expression) && expression.text === 'getIntl') {
              return false;
            }
          }
        }

        // 移除解构 const { intl } = this.props 或类似的
        if (ts.isObjectBindingPattern(declaration.name)) {
          const elements = declaration.name.elements.filter((element) => {
            if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
              return element.name.text !== 'intl';
            }
            return true;
          });

          // 如果过滤后没有元素了，移除整个声明
          if (elements.length === 0) {
            return false;
          }

          // 如果只剩下一个元素且原来有多个，需要更新节点
          if (elements.length !== declaration.name.elements.length) {
            // 创建新的绑定模式
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
   * 清理Hook依赖数组中的intl引用 (AST)
   * @param node - 调用表达式节点
   * @returns 清理后的节点
   */
  static cleanupHookDependencies(node: ts.CallExpression): ts.Node {
    if (!ts.isIdentifier(node.expression)) {
      return node;
    }

    const hookName = node.expression.text;

    // 检查是否是我们关心的Hook
    if (!['useCallback', 'useMemo', 'useEffect'].includes(hookName)) {
      return node;
    }

    // 获取依赖数组参数（通常是第二个参数）
    const depsArgIndex = hookName === 'useEffect' ? 1 : 1;
    const depsArg = node.arguments[depsArgIndex];

    if (!depsArg || !ts.isArrayLiteralExpression(depsArg)) {
      return node;
    }

    // 过滤掉 intl 依赖
    const filteredElements = depsArg.elements.filter((element) => {
      if (ts.isIdentifier(element) && element.text === 'intl') {
        return false;
      }
      return true;
    });

    // 如果依赖数组有变化，创建新的节点
    if (filteredElements.length !== depsArg.elements.length) {
      const newDepsArray =
        ts.factory.createArrayLiteralExpression(filteredElements);
      const newArguments = [...node.arguments];
      newArguments[depsArgIndex] = newDepsArray;

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
