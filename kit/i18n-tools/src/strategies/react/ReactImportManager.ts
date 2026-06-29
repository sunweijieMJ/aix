import type { IImportManager } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { ExtractedString, TransformContext } from '../../utils/types';
import type { ReactI18nLibrary } from './libraries';
import { TRANSLATION_DEPENDENCY_HOOKS, resolveHookName } from './hooks-utils';

/**
 * 类组件 HOC 注入时给内部类附加的后缀：`原类名 + WithOutIntl`。
 * inject（ReactComponentInjector）与 restore（unwrapHOC / 预备遍历）必须共用同一约定，
 * 否则两端命名不一致会导致 restore 无法还原类名 + 丢失 export（Bug B3）。
 */
export const HOC_CLASS_SUFFIX = 'WithOutIntl';

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
    // jsx-text 会被替换成 JSX 组件（如 react-intl 的 <FormattedMessage>），不需要全局 t/intl。
    // 必须排除它：否则 react-intl 对纯 jsx-text 的模块作用域文本也注入 const intl = getIntl();，
    // 该声明永不被使用（no-unused-vars 失败），且因声明体引用 getIntl 无法被 finalizeImports 自愈。
    return fileStrings.some((str) => str.componentType === 'other' && str.context !== 'jsx-text');
  }

  private addGlobalFunctionImport(code: string): string {
    const funcName = this.library.globalFunctionName.split('.')[0]!;
    // mergeNamedImport 幂等且按命名精确去重，直接调用即可。不能用 `import {.*funcName.*}`
    // 这类宽松正则预检——funcName='t' 时会误命中任何含字母 t 的同路径导入而漏注入。
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

  /**
   * 注入收尾：删除被 useTranslation 注入遮蔽后变成未使用的 tImport `t` 导入。
   *
   * 场景：组件原本 `import { t } from '@/plugins/locale'` 并在组件内用 t(...)；本工具
   * 给组件注入 `const { t } = useTranslation()` 后，组件内的 t 全部解析到注入的局部 t，
   * 原 import 沦为死导入（ESLint no-unused-vars，过不了 lint）。这里在确认 t 已无未遮蔽
   * 引用后精准摘除（与 Vue restore 侧 cleanupPluginLocaleImport 同构）。
   *
   * 保守：若模块级（组件外）仍有 t 使用，isImportedNameUnused 返回 false，导入保留。
   */
  finalizeImports(code: string, filePath: string): string {
    const funcName = this.library.globalFunctionName.split('.')[0]!;
    if (!CommonASTUtils.isImportedNameUnused(code, filePath, this.tImport, funcName)) {
      return code;
    }
    return CommonASTUtils.removeNamedImports(code, (moduleName) => moduleName === this.tImport, [
      funcName,
    ]);
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
          // 类组件 HOC（内部名 = 原名+WithOutIntl）：原本是 `export default class Foo`，inject 时
          // 拆成「class FooWithOutIntl + export default HOC(FooWithOutIntl)」。还原时删除这条默认导出
          // 语句，由 case 3 把 `export default` 还给改回原名的类——否则会产出引用旧内部名的
          // `export default FooWithOutIntl`（Bug #1 的 restore 配套）。
          if (wrappedComponent.endsWith(HOC_CLASS_SUFFIX)) {
            return ts.factory.createNotEmittedStatement(node);
          }
          // 函数组件 HOC：内部名即原名，直接解包为 `export default Foo`
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

    // case 3: 类组件 HOC 把原类改名为 `原名 + WithOutIntl`（或旧约定 `_原名`），还原回原名。
    if (ts.isClassDeclaration(node) && node.name) {
      const innerName = node.name.text;
      let originalName: string | undefined;
      if (innerName.endsWith(HOC_CLASS_SUFFIX) && innerName.length > HOC_CLASS_SUFFIX.length) {
        originalName = innerName.slice(0, -HOC_CLASS_SUFFIX.length);
      } else if (innerName.startsWith('_')) {
        originalName = innerName.substring(1);
      }

      if (originalName) {
        // inject 时把 export 从类移到了 HOC 导出语句（export const X = HOC(XWithOutIntl) 或
        // export default HOC(XWithOutIntl)）。case 1/case 2 删除该导出语句后，若原本带 export，
        // 需把 export 还给类，否则模块对外 API 丢失。
        const reExportDefault = context.defaultExportedHocInnerNames?.has(innerName);
        const reExportNamed = context.exportedHocInnerNames?.has(innerName);
        const hasExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        let modifiers: readonly ts.ModifierLike[] | undefined = node.modifiers;
        if (!hasExport) {
          if (reExportDefault) {
            // 默认导出：还回 `export default`
            modifiers = [
              ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
              ts.factory.createModifier(ts.SyntaxKind.DefaultKeyword),
              ...(node.modifiers ?? []),
            ];
          } else if (reExportNamed) {
            modifiers = [
              ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
              ...(node.modifiers ?? []),
            ];
          }
        }
        return ts.factory.updateClassDeclaration(
          node,
          modifiers,
          ts.factory.createIdentifier(originalName),
          node.typeParameters,
          node.heritageClauses,
          node.members,
        );
      }
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
        // 类组件 HOC：内部类名是 `公共名 + WithOutIntl` 的人造名，restore 会把内部类改回公共名，
        // 故 JSX 用法应保持公共名不动；只有函数组件 HOC（内部名 ≠ 公共名）才需要把用法改名到内部名。
        if (newName === tagName.text + HOC_CLASS_SUFFIX) {
          return node;
        }
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
   * 清理 i18n 库导入 (AST)：restore 时从 `import ... from '<library.packageName>'` 中**仅摘除
   * 工具注入的 i18n 具名导入**（Trans / useTranslation / withTranslation / WithTranslation 等），
   * 保留用户在同一行手写的其它导入（如 I18nextProvider / IntlProvider）；摘除后若整条变空则移除。
   *
   * 注意：tImport（如 `@/plugins/locale`）下的全局函数 `t` **不在此处理**。它可能是用户原有、
   * 且仍被「locale 查不到而未被还原的存活 t() 调用」引用——若在逐节点遍历时无条件删除，会删掉
   * 仍被使用的 import，产出 `Cannot find name 't'`（TS2304）。因此 tImport 的 `t` 清理延后到
   * 「整文件还原完成、确认 t 已无任何引用」的收尾 pass（见 ReactRestoreTransformer.transform 末尾
   * 的 finalizeTImport + CommonASTUtils.isImportedNameUnused 守卫），与 generate 侧
   * ReactImportManager.finalizeImports 对称。
   */
  static cleanupImports(
    node: ts.ImportDeclaration,
    library: ReactI18nLibrary,
    keepLibraryImport = false,
  ): ts.Node {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
      return node;
    }
    // keepLibraryImport：还原后仍有未还原的翻译调用 / 组件存活（locale 缺 key），它们依赖
    // useTranslation / useIntl / Trans / FormattedMessage 等具名导入。此时保留整条 import，
    // 否则产出引用未定义标识符的不可编译代码（与下方 cleanupVariableStatements 守卫成对）。
    if (node.moduleSpecifier.text !== library.packageName || keepLibraryImport) {
      return node;
    }

    // 仅摘除工具注入的 i18n 具名导入（Trans / useTranslation / withTranslation / WithTranslation
    // 等），保留用户在同一行从该包手写的其它导入（如 react-i18next 的 I18nextProvider /
    // initReactI18next、react-intl 的 IntlProvider / createIntl）。此前无条件整条
    // createNotEmittedStatement 会把这些非 i18n 导入一并删除，产出 `Cannot find name '...'`
    // （TS2304）的不可编译代码——与 Vue 端 VueRestoreTransformer.cleanupImports 的精确摘除对齐。
    const importClause = node.importClause;
    if (!importClause) return node; // 副作用导入（无具名/默认绑定），原样保留

    const named = importClause.namedBindings;
    // 命名空间导入（import * as X）不含工具注入的具名项，整体保留
    if (!named || !ts.isNamedImports(named)) return node;

    const injectable = new Set(
      library.getImportSpecifiers({ hasJsxComponent: true, hasHook: true, hasHOC: true }),
    );
    // 仅删除「未改名且命中注入集」的 specifier：改名导入（`import { Trans as T }`）一定是
    // 用户代码（工具只注入裸名），故 propertyName 存在时一律保留。
    const remaining = named.elements.filter(
      (el) => el.propertyName !== undefined || !injectable.has(el.name.text),
    );

    if (remaining.length === named.elements.length) return node; // 无工具注入名可摘，保留

    // 摘除后既无具名也无默认导入 → 整条移除
    if (remaining.length === 0 && !importClause.name) {
      return ts.factory.createNotEmittedStatement(node);
    }

    const newImportClause = ts.factory.updateImportClause(
      importClause,
      importClause.isTypeOnly,
      importClause.name,
      remaining.length > 0 ? ts.factory.updateNamedImports(named, remaining) : undefined,
    );
    return ts.factory.updateImportDeclaration(
      node,
      node.modifiers,
      newImportClause,
      node.moduleSpecifier,
      node.attributes,
    );
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
  /**
   * 判定变量声明的初始化器是否为 `this.props`——HOC 注入 `const { t/intl } = this.props` 的来源。
   * 用于 cleanupVariableStatements 收窄通用解构清理，避免按名误删来源无关的同名解构。
   */
  private static isThisPropsInitializer(init: ts.Expression | undefined): boolean {
    return (
      init !== undefined &&
      ts.isPropertyAccessExpression(init) &&
      init.expression.kind === ts.SyntaxKind.ThisKeyword &&
      ts.isIdentifier(init.name) &&
      init.name.text === 'props'
    );
  }

  /**
   * 回调体内是否存在「翻译调用之外」对 varName 的引用。
   * 翻译调用（t('key') / intl.formatMessage('key')）还原后整体替换为字符串，其被调表达式里的
   * varName 引用会消失，不计为残留使用；其余任何对 varName 的引用（实参、成员访问等）都视为
   * 残留使用，需保留依赖项。自顶向下遍历，不依赖 parent 指针（转换中新建子树可能未设 parent）。
   */
  private static callbackUsesVarOutsideTranslationCalls(
    callback: ts.Expression | undefined,
    varName: string,
    library: ReactI18nLibrary,
  ): boolean {
    if (!callback) return false;
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (ts.isCallExpression(node) && library.isTranslationCall(node)) {
        // 翻译调用：跳过被调表达式（t / intl.formatMessage 的 intl 接收者），仅检查其实参。
        node.arguments.forEach(visit);
        return;
      }
      if (ts.isIdentifier(node) && node.text === varName) {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(callback);
    return found;
  }

  static cleanupVariableStatements(
    node: ts.VariableStatement,
    library: ReactI18nLibrary,
    keepTranslationVar = false,
  ): ts.Node {
    // keepTranslationVar：还原后仍有未还原的翻译调用存活（locale 缺 key / 动态 key /
    // t(变量)），翻译变量(t / intl)仍被引用。此时保留其 hook/global 声明与解构绑定，
    // 否则删声明而调用尚存 → 产出 `Cannot find name 't'`（TS2304）。与 Vue 端
    // isTNameUnusedInScript 守卫、本类 finalizeTImport 的 isImportedNameUnused 守卫对齐。
    if (keepTranslationVar) {
      return node;
    }

    const next: ts.VariableDeclaration[] = [];
    let mutated = false;

    // 从对象解构里剔除翻译变量；返回 null 表示该声明只含翻译项、应整条删除。
    const stripTranslationBinding = (
      declaration: ts.VariableDeclaration,
    ): ts.VariableDeclaration | null => {
      if (!ts.isObjectBindingPattern(declaration.name)) return declaration;
      const varName = library.translationVarName;
      const elements = declaration.name.elements.filter((element) => {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          return element.name.text !== varName;
        }
        return true;
      });

      if (elements.length === 0) return null;
      if (elements.length === declaration.name.elements.length) return declaration;

      return ts.factory.updateVariableDeclaration(
        declaration,
        ts.factory.createObjectBindingPattern(elements),
        declaration.exclamationToken,
        declaration.type,
        declaration.initializer,
      );
    };

    for (const original of node.declarationList.declarations) {
      // 混合解构 hook（如 `const { t, i18n } = useTranslation()`）：仅删翻译项、保留其余
      // 绑定（i18n 等），而非随 hook 声明整条删除——否则存活的 i18n 引用会报 TS2304。
      // 必须先于下面的整条删除分支处理：isHookDeclaration 对 `{ t }` 与 `{ t, i18n }`
      // 都返回 true，若先命中整条删除分支，混合解构的保留逻辑将永不可达。
      if (library.isHookDeclaration(original) && ts.isObjectBindingPattern(original.name)) {
        const stripped = stripTranslationBinding(original);
        if (stripped === null) {
          mutated = true;
          continue;
        }
        if (stripped !== original) mutated = true;
        next.push(stripped);
        continue;
      }

      if (library.isHookDeclaration(original) || library.isGlobalFunctionDeclaration(original)) {
        mutated = true;
        continue;
      }

      let declaration = original;

      // 仅清理 HOC 注入的 `const { t/intl } = this.props`（见 ReactComponentInjector 的注入形态）。
      // 必须用 this.props 初始化器收窄：否则会按名误删来源无关的同名解构——例如
      // `const { t } = useTemperature()`（react-i18next，t 是温度）或 `const { intl } = useCtx()`
      // （react-intl）——把整条不相关声明删掉，令该变量 undefined（TS2304 / 运行时 ReferenceError）。
      // hook 解构由上面的 isHookDeclaration 分支处理，此处只剩 props 解构这一种合法形态。
      if (
        ts.isObjectBindingPattern(declaration.name) &&
        ReactImportManager.isThisPropsInitializer(declaration.initializer)
      ) {
        const stripped = stripTranslationBinding(declaration);
        if (stripped === null) {
          mutated = true;
          continue;
        }
        if (stripped !== declaration) {
          declaration = stripped;
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
  static cleanupHookDependencies(
    node: ts.CallExpression,
    library: ReactI18nLibrary,
    keepTranslationVar: boolean = false,
  ): ts.Node {
    // 必须与 generate 端 HooksUtils.addTranslationVarToHooksDependencies 对称：
    // 复用同一份 hook 名解析（兼容 React.useXxx）与列表（含 useLayoutEffect），
    // 否则会漏清理 add 端已注入的依赖，留下指向已删除翻译变量的悬空引用。
    //
    // 与 cleanupImports / cleanupVariableStatements 同样受 keepTranslationVar 守卫：
    // 当某个 t() 调用因 key 缺失 / 动态 key 未被还原时，translation 变量声明与 import
    // 都会被保留（keepTranslationVar=true），此时绝不能把 t 从依赖数组里删掉——否则
    // 回调体仍引用 t 而 deps 漏了它，触发 exhaustive-deps 违规 + 语言切换时闭包陈旧。
    if (keepTranslationVar) {
      return node;
    }
    const hookName = resolveHookName(node);
    if (!hookName || !TRANSLATION_DEPENDENCY_HOOKS.includes(hookName)) {
      return node;
    }

    const depsArg = node.arguments[1];
    if (!depsArg || !ts.isArrayLiteralExpression(depsArg)) {
      return node;
    }

    const varName = library.translationVarName;

    // 仅当回调体内 varName 的所有出现都是 i18n 翻译调用的被调表达式（t('key') /
    // intl.formatMessage('key')，还原后整体→字符串、该引用随之消失）时，才从依赖数组剥离
    // varName。若回调把同名变量当普通值使用（如 `useMemo(() => compute(t), [t])` 中 t 是温度），
    // 还原不会动它，盲删 deps 会留下悬空依赖 + 陈旧闭包（exhaustive-deps 违规）。与
    // cleanupVariableStatements 的 this.props 收窄同一思路：不按名误删来源无关的同名标识符。
    const callback = node.arguments[0];
    if (ReactImportManager.callbackUsesVarOutsideTranslationCalls(callback, varName, library)) {
      return node;
    }

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
