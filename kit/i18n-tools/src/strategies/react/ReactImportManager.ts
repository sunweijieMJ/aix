import type { IImportManager } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
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
        updatedCode = this.addGlobalFunctionDeclaration(updatedCode, globalDeclaration);
      }
    }
    return updatedCode;
  }

  private needsGlobalFunction(fileStrings: ExtractedString[]): boolean {
    return fileStrings.some((str) => str.componentType === 'other');
  }

  private addGlobalFunctionImport(code: string): string {
    const funcName = this.library.globalFunctionName.split('.')[0]!;
    const escapedPath = CommonASTUtils.escapeRegExp(this.tImport);
    if (
      new RegExp(`import\\s*\\{.*${funcName}.*\\}\\s*from\\s*['"]${escapedPath}['"]`).test(code)
    ) {
      return code;
    }
    return CommonASTUtils.mergeNamedImport(code, this.tImport, [funcName]);
  }

  private addGlobalFunctionDeclaration(code: string, declaration: string): string {
    // 检查是否已存在
    if (code.includes(declaration.trim())) {
      return code;
    }
    // 在最后一个 import 之后插入声明，前置空行便于阅读
    const lines = code.split('\n');
    const lastImportIndex = CommonASTUtils.findLastImportLineIndex(lines);
    lines.splice(lastImportIndex + 1, 0, '\n' + declaration.trim());
    return lines.join('\n');
  }

  /**
   * 添加 i18n 库导入 (实现接口方法)
   */
  addI18nImports(code: string, imports: string[]): string {
    return CommonASTUtils.mergeNamedImport(code, this.library.packageName, imports);
  }

  // ==================== 清理 AST 节点 ====================

  /**
   * 解除 HOC 的包裹（由 library 适配器驱动）
   */
  static unwrapHOC(node: ts.Node, context: TransformContext, library: ReactI18nLibrary): ts.Node {
    // case 1: export default HOC(Component)
    if (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) {
      if (library.isHOCCall(node.expression)) {
        const wrappedComponent = library.getHOCWrappedComponent(node.expression);
        if (wrappedComponent) {
          const arg = node.expression.arguments[0]!;
          return ts.factory.updateExportAssignment(node, node.modifiers, arg);
        }
      }
    }

    // case 2: const Injected = HOC(Component)
    if (ts.isVariableStatement(node)) {
      const remainingDeclarations = node.declarationList.declarations.filter((decl) => {
        if (ts.isIdentifier(decl.name)) {
          return !context.componentNameMap.has(decl.name.text);
        }
        return true;
      });

      if (remainingDeclarations.length === 0) {
        return ts.factory.createNotEmittedStatement(node);
      }

      if (remainingDeclarations.length < node.declarationList.declarations.length) {
        const newDeclList = ts.factory.updateVariableDeclarationList(
          node.declarationList,
          remainingDeclarations,
        );
        return ts.factory.updateVariableStatement(node, node.modifiers, newDeclList);
      }
    }

    // case 3: class _Comp ... (通常由HOC引入)
    if (ts.isClassDeclaration(node) && node.name && node.name.text.startsWith('_')) {
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
      if (ts.isIdentifier(tagName) && context.componentNameMap.has(tagName.text)) {
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
  static cleanupHOCPropsType(node: ts.Node, library: ReactI18nLibrary): ts.Node {
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
        return ts.factory.updateIntersectionTypeNode(node, ts.factory.createNodeArray(newTypes));
      }
    }

    return node;
  }

  /**
   * 清理导入语句 (AST)
   *
   * tImport 路径下：仅摘除工具注入的全局函数命名（library.globalFunctionName 的根标识符），
   * 保留用户在同一路径下自有的其他命名导入。
   * Why 精准：tImport 可能是用户的通用 utility 路径（如 `@/plugins/locale`），
   * generate 阶段以 mergeNamedImport 把全局函数合并到现有 import，restore 时若整条删除
   * 会把用户原有的其他命名导入也一并清掉，破坏编译。与 VueRestoreTransformer
   * 的 cleanupPluginLocaleImport 行为对齐。
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

    // 清理工具注入的全局函数 import：精准摘除 funcName，保留同路径其他命名
    if (moduleName === tImport) {
      const funcName = library.globalFunctionName.split('.')[0]!;
      const namedBindings = node.importClause?.namedBindings;
      if (!namedBindings || !ts.isNamedImports(namedBindings)) {
        // 副作用 import / namespace import / default-only：不归工具管，原样保留
        return node;
      }
      const remaining = namedBindings.elements.filter(
        (el) => (el.propertyName ?? el.name).text !== funcName,
      );
      if (remaining.length === namedBindings.elements.length) {
        // 不含目标命名，原样保留
        return node;
      }
      if (remaining.length === 0 && !node.importClause?.name) {
        return ts.factory.createNotEmittedStatement(node);
      }
      const newNamedImports = ts.factory.updateNamedImports(namedBindings, remaining);
      const newImportClause = ts.factory.updateImportClause(
        node.importClause!,
        node.importClause!.isTypeOnly,
        node.importClause!.name,
        newNamedImports,
      );
      return ts.factory.updateImportDeclaration(
        node,
        node.modifiers,
        newImportClause,
        node.moduleSpecifier,
        node.attributes,
      );
    }

    return node;
  }

  /**
   * 清理变量声明语句 (AST)（由 library 适配器驱动）
   *
   * 三类清理：
   *   1. Hook 声明（useIntl / useTranslation）整条移除
   *   2. 全局函数声明（getIntl）整条移除
   *   3. 解构中仅保留翻译变量（如 `const { t } = ...`）整条移除；
   *      混合解构（如 `const { t, i18n } = ...`）则重建解构模式仅删除翻译项
   */
  static cleanupVariableStatements(node: ts.VariableStatement, library: ReactI18nLibrary): ts.Node {
    const next: ts.VariableDeclaration[] = [];
    let mutated = false;

    for (const original of node.declarationList.declarations) {
      if (library.isHookDeclaration(original) || library.isGlobalFunctionDeclaration(original)) {
        mutated = true;
        continue;
      }

      let declaration = original;

      if (ts.isObjectBindingPattern(declaration.name)) {
        const varName = library.translationVarName;
        const elements = declaration.name.elements.filter((element) => {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            return element.name.text !== varName;
          }
          return true;
        });

        if (elements.length === 0) {
          mutated = true;
          continue;
        }

        if (elements.length !== declaration.name.elements.length) {
          declaration = ts.factory.updateVariableDeclaration(
            declaration,
            ts.factory.createObjectBindingPattern(elements),
            declaration.exclamationToken,
            declaration.type,
            declaration.initializer,
          );
          mutated = true;
        }
      }

      next.push(declaration);
    }

    if (next.length === 0) {
      return ts.factory.createNotEmittedStatement(node);
    }

    if (mutated) {
      return ts.factory.updateVariableStatement(
        node,
        node.modifiers,
        ts.factory.updateVariableDeclarationList(node.declarationList, next),
      );
    }

    return node;
  }

  /**
   * 清理Hook依赖数组中的翻译变量引用 (AST)
   */
  static cleanupHookDependencies(node: ts.CallExpression, library: ReactI18nLibrary): ts.Node {
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
      const newDepsArray = ts.factory.createArrayLiteralExpression(filteredElements);
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
