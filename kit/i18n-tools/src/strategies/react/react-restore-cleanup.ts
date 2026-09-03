import ts from 'typescript';
import type { TransformContext } from '../../utils/types';
import {
  findInnermostBindingDeclaration,
  hasLocalDeclarationWithin,
  isIdentifierValueReference,
} from '../../utils/scope-analysis';
import { ReactASTUtils } from './react-ast-utils';
import type { ReactI18nLibrary } from './libraries';
import { TRANSLATION_DEPENDENCY_HOOKS, resolveHookName } from './hooks-utils';

/**
 * React restore 侧的「拆注入」清理：把 generate 阶段注入的 HOC 包裹、Props 类型、
 * hook / 全局函数声明与 hook 依赖项逐一还原掉。
 *
 * 职责边界：全部是**逐节点的纯函数**（node in → node out），由 ReactRestoreTransformer
 * 在其 visitor 里按序调用；不读文件、不做整文件级判定（「t 是否还有存活引用」这类守卫由
 * transformer 算出后以 keep* 旗标传入）。import 语句的增删仍归 ReactImportManager /
 * utils/import-surgery，本模块不碰。
 */

/**
 * 类组件 HOC 注入时给内部类附加的后缀：`原类名 + WithOutIntl`。
 * inject（ReactComponentInjector）与 restore（unwrapHOC / 预备遍历）必须共用同一约定，
 * 否则两端命名不一致会导致 restore 无法还原类名 + 丢失 export。
 */
export const HOC_CLASS_SUFFIX = 'WithOutIntl';

/**
 * 解除 HOC 的包裹（由 library 适配器驱动）
 */
export function unwrapHOC(
  node: ts.Node,
  context: TransformContext,
  library: ReactI18nLibrary,
): ts.Node {
  // case 1: export default HOC(Component)
  if (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) {
    if (library.isHOCCall(node.expression)) {
      const wrappedComponent = library.getHOCWrappedComponent(node.expression);
      if (wrappedComponent) {
        // 类组件 HOC（内部名 = 原名+WithOutIntl）：原本是 `export default class Foo`，inject 时
        // 拆成「class FooWithOutIntl + export default HOC(FooWithOutIntl)」。还原时删除这条默认导出
        // 语句，由 case 3 把 `export default` 还给改回原名的类——否则会产出引用旧内部名的
        // `export default FooWithOutIntl`。
        if (wrappedComponent.endsWith(HOC_CLASS_SUFFIX)) {
          return ts.factory.createNotEmittedStatement(node);
        }
        // 函数组件 HOC：内部名即原名，直接解包为 `export default Foo`
        const arg = node.expression.arguments[0]!;
        return ts.factory.updateExportAssignment(node, node.modifiers, arg);
      }
    }
  }

  // case 1b: export default Foo（Foo 由 `const Foo = HOC(FooWithOutIntl)` 绑定）
  // 类组件默认导出的注入形态是「const 原名 = HOC(内部名) + export default 原名」，两条语句
  // 都要删除，再由 case 3 把 `export default` 还给改回原名的类。只认工具约定的内部名
  // （原名 + WithOutIntl），用户手写的 `const Injected = injectIntl(Foo); export default Injected;`
  // 内部名不符约定，不受影响。
  //
  // 但源文件原本就同时具名导出与默认导出（`export class Foo` + `export default Foo`）时，
  // 注入产物里的 `export default Foo` 是**用户原有语句**：case 3 会把 `export` 还给类，
  // 该语句随即指向复原后的类，必须保留。故仅当内部名只登记为「默认导出来源」时才删除。
  if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) {
    const publicName = node.expression.text;
    const innerName = publicName + HOC_CLASS_SUFFIX;
    if (
      context.componentNameMap.get(publicName) === innerName &&
      context.defaultExportedHocInnerNames?.has(innerName) &&
      !context.exportedHocInnerNames?.has(innerName)
    ) {
      return ts.factory.createNotEmittedStatement(node);
    }
  }

  // case 2: const Injected = HOC(Component)
  if (ts.isVariableStatement(node)) {
    // 工具自产的 HOC 声明（内部名 = 原名 + WithOutIntl）是注入产物，整条删除、
    // 由 case 3 把 export 还给改回原名的类。
    // 用户手写的 HOC 声明（`export const InjectedFoo = injectIntl(Foo)`，内部名无约定
    // 后缀）不能删语句：删除会让模块公共 API（export）与非 JSX 引用（如路由表里的
    // `component: InjectedFoo`）一并消失，且本文件自身编译通过、错误只在跨文件消费方
    // 暴露。故只把初始化器解包成内部组件标识符（`export const InjectedFoo = Foo`）——
    // formatMessage 已全部还原时二者语义等价，export 与引用完整保留。
    // 代价：非导出且仅被 JSX 引用的局部 HOC（renameComponent 已把 JSX 改成内部名）会
    // 留下一条无人引用的 `const Injected = Foo`（no-unused-vars lint 噪音）。有意取舍：
    // 静态区分「仅 JSX 引用」需要完整引用分析，而删错声明是编译错误、多留是 lint 警告，
    // 按「宁可多留，绝不产坏代码」保留。
    // 只认唯一的自产约定后缀。`_原名` 这类前缀命名一律按用户手写处理：注入器不产出该形态，
    // 而按自产处理会删掉用户的导出语句、并留下引用已改名标识符的悬空引用。
    const isToolConvention = (inner: string): boolean => inner.endsWith(HOC_CLASS_SUFFIX);

    let changed = false;
    const remainingDeclarations: ts.VariableDeclaration[] = [];
    for (const decl of node.declarationList.declarations) {
      const inner = ts.isIdentifier(decl.name)
        ? context.componentNameMap.get(decl.name.text)
        : undefined;
      if (inner === undefined) {
        remainingDeclarations.push(decl);
        continue;
      }
      changed = true;
      if (isToolConvention(inner)) continue; // 自产声明：删除
      remainingDeclarations.push(
        ts.factory.updateVariableDeclaration(
          decl,
          decl.name,
          decl.exclamationToken,
          decl.type,
          ts.factory.createIdentifier(inner),
        ),
      );
    }

    if (changed) {
      if (remainingDeclarations.length === 0) {
        return ts.factory.createNotEmittedStatement(node);
      }
      const newDeclList = ts.factory.updateVariableDeclarationList(
        node.declarationList,
        remainingDeclarations,
      );
      return ts.factory.updateVariableStatement(node, node.modifiers, newDeclList);
    }
  }

  // case 3: 类组件 HOC 把原类改名为 `原名 + WithOutIntl`，还原回原名。
  if (ts.isClassDeclaration(node) && node.name) {
    const innerName = node.name.text;
    const originalName =
      innerName.endsWith(HOC_CLASS_SUFFIX) && innerName.length > HOC_CLASS_SUFFIX.length
        ? innerName.slice(0, -HOC_CLASS_SUFFIX.length)
        : undefined;

    if (originalName) {
      // inject 时把 export 从类移到了 HOC 导出语句（export const X = HOC(XWithOutIntl) 或
      // export default HOC(XWithOutIntl)）。case 1/case 2 删除该导出语句后，若原本带 export，
      // 需把 export 还给类，否则模块对外 API 丢失。
      const reExportDefault = context.defaultExportedHocInnerNames?.has(innerName);
      const reExportNamed = context.exportedHocInnerNames?.has(innerName);
      const hasExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      let modifiers: readonly ts.ModifierLike[] | undefined = node.modifiers;
      if (!hasExport) {
        // 具名导出优先：两者同时登记时源文件原本是「export class Foo + export default Foo」，
        // 那条 `export default Foo` 由 case 1b 保留下来、指向此处复原的类，
        // 类上只需补回 `export`；补成 `export default class` 会与它重复默认导出（TS2528）。
        if (reExportNamed) {
          modifiers = [
            ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
            ...(node.modifiers ?? []),
          ];
        } else if (reExportDefault) {
          // 默认导出：还回 `export default`
          modifiers = [
            ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
            ts.factory.createModifier(ts.SyntaxKind.DefaultKeyword),
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
export function renameComponent(node: ts.Node, context: TransformContext): ts.Node {
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
export function cleanupHOCPropsType(node: ts.Node, library: ReactI18nLibrary): ts.Node {
  const propsType = library.hocPropsType;

  // case 0: `extends React.Component<HOCPropsType>` —— propsType 是唯一类型参数时整条摘除。
  // 注入端对「原本无类型参数」的基类补的正是 `<HOCPropsType>`（见 injectHOC 步骤 1），
  // 这里必须还原成无类型参数；退化到 case 2 会留下 `React.Component<{}>` 这种源码里没有的形态。
  // 必须先于 case 2：visitor 自上而下，父节点先过本函数。
  if (ts.isExpressionWithTypeArguments(node) && node.typeArguments?.length === 1) {
    const soleTypeArg = node.typeArguments[0]!;
    if (
      ts.isTypeReferenceNode(soleTypeArg) &&
      ts.isIdentifier(soleTypeArg.typeName) &&
      soleTypeArg.typeName.text === propsType
    ) {
      return ts.factory.updateExpressionWithTypeArguments(node, node.expression, undefined);
    }
  }

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
 * 判定变量声明的初始化器是否为 `this.props`——HOC 注入 `const { t/intl } = this.props` 的来源。
 * 用于 cleanupVariableStatements 收窄通用解构清理，避免按名误删来源无关的同名解构。
 */
function isThisPropsInitializer(init: ts.Expression | undefined): boolean {
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
 * varName 引用会消失，不计为残留使用；其余任何对 varName 的**值引用**（实参、成员访问的接收者等）
 * 都视为残留使用，需保留依赖项。自顶向下遍历，不依赖 parent 指针做遍历。
 *
 * 必须与 ReactRestoreTransformer 删声明的守卫同口径过 isIdentifierValueReference +
 * 遮蔽判定：那一侧只认「解析到翻译变量的值引用」，本侧若按名硬匹配任意 Identifier，
 * `{ t: Date.now() }` 的对象键、`styles.t` 的成员名、`for (const t of tabs)` 的循环变量
 * 都会被当成使用 —— 于是声明被删、deps 里的 `[t]` 却留着，产出 `Cannot find name 't'`
 * （TS2304）。两侧口径不对称就必然漏出这种半还原产物。
 */
function callbackUsesVarOutsideTranslationCalls(
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
    if (
      ts.isIdentifier(node) &&
      node.text === varName &&
      isIdentifierValueReference(node) &&
      !hasLocalDeclarationWithin(node, varName, callback)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(callback);
  return found;
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
export function cleanupVariableStatements(
  node: ts.VariableStatement,
  library: ReactI18nLibrary,
  keepTranslationVar = false,
): ts.Node {
  // keepTranslationVar：还原后仍有未还原的翻译调用存活（locale 缺 key / 动态 key /
  // t(变量)），翻译变量(t / intl)仍被引用。此时保留其 hook/global 声明与解构绑定，
  // 否则删声明而调用尚存 → 产出 `Cannot find name 't'`（TS2304）。与 Vue 端
  // isTNameUnusedInScript 守卫、ReactRestoreTransformer.finalizeTImport 的
  // isImportedNameUnused 守卫对齐。
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
      isThisPropsInitializer(declaration.initializer)
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
export function cleanupHookDependencies(
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
  if (callbackUsesVarOutsideTranslationCalls(callback, varName, library)) {
    return node;
  }

  const filteredElements = depsArg.elements.filter((element) => {
    if (ts.isIdentifier(element) && element.text === varName) {
      // 依赖项解析到的绑定必须确实是 i18n 来源。同名的业务绑定（`const { t } = useTemperature()`）
      // 其调用不会被还原，剥掉它的依赖项就留下悬空依赖 + 陈旧闭包（exhaustive-deps 违规）。
      // 查不到局部绑定（模块级注入的 t）时按 i18n 来源处理，与还原侧口径一致。
      const declaration = findInnermostBindingDeclaration(element, varName);
      return (
        declaration !== undefined &&
        !ReactASTUtils.isI18nSourceDeclaration(declaration, {
          hookName: library.hookName,
          hocPropsType: library.hocPropsType,
          isHOCCall: (expression) => library.isHOCCall(expression),
          isI18nDeclaration: (decl) =>
            library.isHookDeclaration(decl) || library.isGlobalFunctionDeclaration(decl),
        })
      );
    }
    return true;
  });

  if (filteredElements.length !== depsArg.elements.length) {
    const newDepsArray = ts.factory.createArrayLiteralExpression(filteredElements);
    const newArguments = [...node.arguments];
    newArguments[1] = newDepsArray;

    return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, newArguments);
  }

  return node;
}
