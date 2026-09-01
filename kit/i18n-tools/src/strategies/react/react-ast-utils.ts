import ts from 'typescript';
import { MessageInfo } from '../../utils/types';
import { extractObjectLiteralProperties, objectLiteralHasSpread } from '../../utils/ast-core';

/**
 * React 特定的 AST 工具类
 * 提供 React/JSX 相关的 AST 操作功能
 */
export class ReactASTUtils {
  /**
   * 判定一个标识符是否像 react-intl `defineMessages({ KEY: ... })` 的容器变量名。
   *
   * 大小写无关匹配，覆盖 `messages` / `intlMessages` / `i18nMessages` 等命名，
   * 避免漏匹配导致 restore 时丢失消息容器定义。
   */
  static isMessageContainerName(name: string): boolean {
    return /messages?/i.test(name);
  }

  static getNodeContext(node: ts.Node): 'jsx-text' | 'jsx-attribute' | 'js-code' {
    if (ts.isJsxText(node)) {
      return 'jsx-text';
    }

    let parent = node.parent;
    while (parent) {
      if (ts.isJsxAttribute(parent)) {
        return 'jsx-attribute';
      }
      if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
        return 'jsx-attribute';
      }
      parent = parent.parent;
    }

    return 'js-code';
  }

  static needsJsxWrapper(
    node: ts.Node,
    context: 'jsx-text' | 'jsx-attribute' | 'js-code',
  ): boolean {
    if (context === 'jsx-text') {
      return true;
    }

    if (context === 'jsx-attribute') {
      let parent = node.parent;
      while (parent) {
        if (ts.isJsxExpression(parent)) {
          return false;
        }
        if (ts.isJsxAttribute(parent)) {
          return true;
        }
        parent = parent.parent;
      }
      return true;
    }

    let parent = node.parent;
    while (parent) {
      if (ts.isJsxExpression(parent)) {
        return false;
      }
      if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        return false;
      }
      if (ts.isCallExpression(parent) && parent.arguments.includes(node as ts.Expression)) {
        return false;
      }
      if (ts.isArrayLiteralExpression(parent) && parent.elements.includes(node as ts.Expression)) {
        return false;
      }
      if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
        return false;
      }
      parent = parent.parent;
    }

    return false;
  }

  static getComponentType(node: ts.Node): 'function' | 'class' | 'other' {
    let current: ts.Node | undefined = node;
    while (current) {
      if (ts.isClassDeclaration(current)) {
        if (ReactASTUtils.isClassComponent(current)) {
          return 'class';
        }
      }
      if (
        ts.isFunctionDeclaration(current) ||
        ts.isArrowFunction(current) ||
        ts.isFunctionExpression(current)
      ) {
        // 仅当该函数是注入器（getComponentInfo）真正会注入 hook 的组件时才判 'function'。
        // 否则（如模块顶层小写 renderXxx 这类返回 JSX 的工具函数）继续向上walk：
        // - 若被某个真组件包裹 → 命中外层组件返回 'function'，裸 t() 经闭包可用；
        // - 若一路到顶都不是组件 → 落到 'other'，由 import 管理器注入全局 import { t }，
        //   避免产出引用未声明 t() 的代码。
        if (
          ReactASTUtils.isFunctionComponent(current) &&
          ReactASTUtils.isInjectableComponentFunction(current)
        ) {
          return 'function';
        }
      }
      current = current.parent;
    }
    return 'other';
  }

  /**
   * 字符串是否位于类的「非箭头函数属性初始化器」中（Bug 2）。
   *
   * 注入器（ReactComponentInjector.injectClassMethodDestructure）只为方法体 / 构造器 /
   * 访问器 / 直接箭头函数属性注入 `const { t } = this.props`。普通属性初始化器
   * （`label = t('k')`、`label = cond ? '' : ''`、`label = arr.map(x => t('k'))` 等）
   * 在类字段求值时没有 t/intl 绑定，直接替换成裸调用会产出未定义标识符（TS2304）。
   *
   * 判定：自 node 向上找最近的「注入边界」祖先——
   *  - 方法 / getter / setter / 构造器 → 注入器会在其体内注入绑定 → 返回 false（有绑定）；
   *  - 类属性声明 PropertyDeclaration：
   *      · 初始化器是直接箭头函数（`foo = () => …`）→ 注入器会注入到箭头体 → false；
   *      · 否则（普通值初始化器 / 嵌套函数调用等）→ 无绑定 → 返回 true（应跳过提取）；
   *  - 到达类声明或源文件仍未命中属性 → false（保守，不影响非属性场景）。
   */
  static isInClassNonArrowPropertyInitializer(node: ts.Node): boolean {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (
        ts.isMethodDeclaration(current) ||
        ts.isGetAccessorDeclaration(current) ||
        ts.isSetAccessorDeclaration(current) ||
        ts.isConstructorDeclaration(current)
      ) {
        return false;
      }
      if (ts.isPropertyDeclaration(current)) {
        // 初始化器是直接箭头函数 → 注入器会为其注入 this.props 解构，有绑定，不跳过。
        return !(current.initializer !== undefined && ts.isArrowFunction(current.initializer));
      }
      if (ts.isClassLike(current) || ts.isSourceFile(current)) {
        return false;
      }
      current = current.parent;
    }
    return false;
  }

  /** 类成员（含 static 块）是否带 static 修饰符。 */
  static hasStaticModifier(member: ts.Node): boolean {
    return (
      ts.canHaveModifiers(member) &&
      (ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false)
    );
  }

  /**
   * 字符串是否位于类的 **static 成员**内（static 属性 / static 箭头属性 / static 方法 /
   * static 访问器 / static 初始化块）。
   *
   * 与 isInClassNonArrowPropertyInitializer 同一类问题、同一处置：注入器只会注入
   * `const { t } = this.props`，而 static 成员求值时 `this` 是**类构造函数本身**、没有
   * props —— 注入进去是运行时 `Cannot read properties of undefined`，不注入则裸 t() 未定义。
   * 两条路都产坏代码，故按全库「宁可漏提取，绝不产出坏代码」原则在提取端就跳过并留痕。
   *
   * 判定沿父链找最近的类成员：命中即返回其 static 性；先遇到类体 / 源文件说明不在类成员内。
   * 嵌套类的成员会先命中内层成员，与就近词法作用域语义一致。
   */
  static isInClassStaticMember(node: ts.Node): boolean {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (ts.isClassStaticBlockDeclaration(current)) return true;
      if (
        ts.isPropertyDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isGetAccessorDeclaration(current) ||
        ts.isSetAccessorDeclaration(current)
      ) {
        return ReactASTUtils.hasStaticModifier(current);
      }
      if (ts.isConstructorDeclaration(current)) return false;
      if (ts.isClassLike(current) || ts.isSourceFile(current)) return false;
      current = current.parent;
    }
    return false;
  }

  /**
   * JSX 标签名是否指向内建元素（HTML 原生标签）而非组件引用。
   * JSX 规范以首字母大小写区分：小写开头编译成字符串标签名，大写开头编译成标识符引用。
   * `<cOde>` 仍是内建元素（DOM 标签名大小写不敏感），故判定只看首字母、不看整体。
   */
  static isIntrinsicJsxTag(tagName: string): boolean {
    return /^[a-z]/.test(tagName);
  }

  /**
   * 字符串是否位于「函数 / 方法 / 构造器的形参默认值」中
   * （`function App({ label = '默认标签' })`、`m(msg = '提示')`）。
   *
   * 形参默认值在参数作用域求值，而注入器把 `const { t } = useTranslation()` /
   * `const { t } = this.props` 放在函数体内，参数作用域看不见它 —— 替换成裸 t() 即未定义
   * 标识符（TS2304 / 省略实参时 ReferenceError）。与 isInClassNonArrowPropertyInitializer、
   * isInClassStaticMember 同族，供提取端跳过。
   *
   * 判定不在函数边界处停：默认值里嵌套的函数（`({ render = () => '中文' })`）闭包的仍是
   * 参数作用域；默认值里的 JSX 子树（`({ icon = <span>中文</span> })`）同理。
   */
  static isInFunctionParameterDefault(node: ts.Node): boolean {
    let current: ts.Node = node;
    // 解构默认值（`{ label = '默认标签' }`）挂在 BindingElement 而非 Parameter 上，故先记标记、
    // 再沿绑定模式上溯确认归属：落在 VariableDeclaration 上的同形态（函数体内的
    // `const { label = '默认标签' } = props`）在函数体作用域求值，必须照常提取。
    let inBindingDefault = false;
    while (current.parent) {
      const parent: ts.Node = current.parent;
      if (ts.isParameter(parent)) {
        if (parent.initializer === current) return true;
        return inBindingDefault && parent.name === current;
      }
      if (ts.isVariableDeclaration(parent) && parent.name === current) return false;
      if (ts.isBindingElement(parent) && parent.initializer === current) inBindingDefault = true;
      current = parent;
    }
    return false;
  }

  /**
   * 从 node 向上找最近的「会被注入器注入 hook 的函数组件」节点；先遇到类组件则返回
   * undefined（该位置由类组件的 this.props 路径负责，与 getComponentType 的判定顺序一致）。
   */
  static findEnclosingInjectableFunctionComponent(
    node: ts.Node,
  ): ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | undefined {
    let current: ts.Node | undefined = node;
    while (current) {
      if (ts.isClassDeclaration(current) && ReactASTUtils.isClassComponent(current)) {
        return undefined;
      }
      if (
        (ts.isFunctionDeclaration(current) ||
          ts.isArrowFunction(current) ||
          ts.isFunctionExpression(current)) &&
        ReactASTUtils.isFunctionComponent(current) &&
        ReactASTUtils.isInjectableComponentFunction(current)
      ) {
        return current;
      }
      current = current.parent;
    }
    return undefined;
  }

  /**
   * 组件函数体**顶层块**内是否存在与 varName 同名、但初始化器**不是** i18n hook 的本地
   * 变量声明（`const { t } = useTemperature()` / `const t = fmt` / `const intl =
   * createIntl(...)`）。这类绑定说明裸 `t(...)`/`intl.formatMessage(...)` 另有出处。
   *
   * 提取端（跳过该组件的候选）与注入端（跳过 hook 注入）必须共用这一份判定：两端口径一旦
   * 分叉，就会出现「文案已被替换成裸 t()、注入却被跳过」的静默错误产物——新 t() 解析到那个
   * 同名的非 i18n 函数上。
   *
   * 只查顶层块、不下钻：TS2451 只发生在同一个块内——嵌套回调里的同名声明
   * （`useEffect(() => { const t = setTimeout(...) })` 极常见）只是无害的内层遮蔽，
   * 若也算冲突会误跳，触发面比要防的双声明大得多。形参绑定不在此判（componentParamBindsVar
   * 已把它算作「已有绑定」）；表达式体箭头函数无块，不可能同块冲突。
   */
  static hasConflictingTranslationBinding(
    node: ts.Node,
    varName: string,
    hookName: string,
  ): boolean {
    const body = (node as ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration).body;
    if (!body || !ts.isBlock(body)) return false;
    for (const stmt of body.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        let bindsVar = false;
        if (ts.isIdentifier(decl.name)) {
          bindsVar = decl.name.text === varName;
        } else if (ts.isObjectBindingPattern(decl.name) || ts.isArrayBindingPattern(decl.name)) {
          bindsVar = decl.name.elements.some(
            (el) => ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === varName,
          );
        }
        if (!bindsVar) continue;
        const init = decl.initializer;
        const isHookInit =
          !!init &&
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          init.expression.text === hookName;
        if (!isHookInit) return true;
      }
    }
    return false;
  }

  /**
   * 判断一个函数是否会被 ReactComponentInjector 当作组件注入 hook。
   * 必须与 getComponentInfo 的接受条件保持一致：
   * - 命名函数声明：PascalCase 名
   * - 箭头/函数表达式：绑定到 PascalCase 变量（含 forwardRef/memo 包裹），或匿名默认导出
   */
  static isInjectableComponentFunction(
    func: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): boolean {
    if (ts.isFunctionDeclaration(func)) {
      return !!func.name && ReactASTUtils.isComponentName(func.name.text);
    }

    let host: ts.Node | undefined = func.parent;
    // forwardRef/memo(() => …) → 取调用表达式的父级作为绑定宿主。
    // 循环而非只跳一层：memo(forwardRef(…)) 双包裹很常见，只解一层会停在外层 CallExpression 上，
    // 宿主变量名拿不到 → 组件不被识别为可注入 → 内层组件的 t() 无 hook 注入（未定义标识符）。
    while (
      host &&
      ts.isCallExpression(host) &&
      ReactASTUtils.isForwardRefOrMemoCallee(host.expression)
    ) {
      host = host.parent;
    }
    if (host) {
      if (ts.isVariableDeclaration(host) && ts.isIdentifier(host.name)) {
        return ReactASTUtils.isComponentName(host.name.text);
      }
      // export default (() => …)：injector 作为 DefaultExportedComponent 注入
      if (ts.isExportAssignment(host)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 嵌套组件作用域边界：一个（非根的）函数 / 类节点本身就是 ReactComponentInjector 会
   * 独立注入 hook/HOC 的组件。其内部的 hook 声明与 t/intl 用法属于该组件自身作用域，不能
   * 算到外层组件头上：否则外层会因内层已有 t 被误判「已可用」而漏注入（→ 外层自身 t() 引用
   * 未声明标识符），或因内层用了 t 被误判「需要」而多注入一个未用 hook。
   *
   * 普通回调（useEffect / onClick / map 等非组件函数）**不是**边界——注入到外层组件的 hook
   * 在这些闭包内经词法作用域可用，故仍需继续下钻统计其中的 t 用法。
   */
  static isNestedComponentBoundary(n: ts.Node): boolean {
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) &&
      ReactASTUtils.isInjectableComponentFunction(n)
    ) {
      return true;
    }
    if (ts.isClassDeclaration(n) && ReactASTUtils.isClassComponent(n)) {
      // 具名类组件，或匿名默认导出类组件（getComponentInfo 同样会为其注入 HOC）均算边界。
      if (n.name || n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 组件函数是否通过解构形参绑定了名为 varName 的本地变量，如
   * `({ t }: WithTranslation) => …`（withTranslation HOC 把 t 作为 prop 传入）、
   * `({ intl }: WrappedComponentProps) => …`（injectIntl）。用于在注入
   * useTranslation()/useIntl() 前规避「形参 t/intl + hook 解构」同作用域双声明。
   * 仅认本地绑定名（el.name 恒为本地名）：`{ t }` → true；`{ t: localT }`（t 改名）→ false；
   * `{ x: t }` → true。
   */
  static componentParamBindsVar(node: ts.Node, varName: string): boolean {
    if (
      !ts.isArrowFunction(node) &&
      !ts.isFunctionExpression(node) &&
      !ts.isFunctionDeclaration(node)
    ) {
      return false;
    }
    return node.parameters.some(
      (param) =>
        ts.isObjectBindingPattern(param.name) &&
        param.name.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === varName),
    );
  }

  /**
   * 在「单个组件自身的词法作用域」内查找：从 root 向下遍历，命中 predicate 即返回 true；
   * 遇到嵌套组件边界（isNestedComponentBoundary）则不进入其子树。root 自身永不视为边界。
   */
  static someWithinComponentScope(root: ts.Node, predicate: (n: ts.Node) => boolean): boolean {
    let found = false;
    const walk = (n: ts.Node, isRoot: boolean): void => {
      if (found) return;
      if (!isRoot && ReactASTUtils.isNestedComponentBoundary(n)) return;
      if (predicate(n)) {
        found = true;
        return;
      }
      ts.forEachChild(n, (c) => walk(c, false));
    };
    walk(root, true);
    return found;
  }

  static isClassComponent(node: ts.ClassDeclaration): boolean {
    if (!node.heritageClauses) {
      return false;
    }

    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const type of clause.types) {
          const expression = type.expression;

          if (
            ts.isIdentifier(expression) &&
            ['Component', 'PureComponent'].includes(expression.text)
          ) {
            return true;
          }

          if (
            ts.isPropertyAccessExpression(expression) &&
            ts.isIdentifier(expression.expression) &&
            expression.expression.text === 'React' &&
            ts.isIdentifier(expression.name) &&
            ['Component', 'PureComponent'].includes(expression.name.text)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 判断一个调用表达式的被调用者是否是 forwardRef/memo：兼容具名导入的裸标识符
   * 调用（`memo(...)`）与命名空间访问调用（`React.memo(...)`）两种写法。
   * 与 isClassComponent 对 `React.Component`/`React.PureComponent` 的判定方式对齐。
   */
  static isForwardRefOrMemoCallee(expression: ts.Expression): boolean {
    if (ts.isIdentifier(expression)) {
      return ['forwardRef', 'memo'].includes(expression.text);
    }
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'React' &&
      ts.isIdentifier(expression.name)
    ) {
      return ['forwardRef', 'memo'].includes(expression.name.text);
    }
    return false;
  }

  static isFunctionComponent(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): boolean {
    if (
      node.parent &&
      ts.isCallExpression(node.parent) &&
      ReactASTUtils.isForwardRefOrMemoCallee(node.parent.expression)
    ) {
      return true;
    }

    let isReactFunction = false;

    const reactHooks = new Set([
      'useState',
      'useEffect',
      'useContext',
      'useReducer',
      'useCallback',
      'useMemo',
      'useRef',
      'useImperativeHandle',
      'useLayoutEffect',
      'useDebugValue',
      'useIntl',
      'useTranslation',
    ]);

    const visit = (n: ts.Node) => {
      if (isReactFunction) return;

      if (ts.isCallExpression(n)) {
        // 裸 Identifier（`useState()`）与 `React.useXxx()` 命名空间形式都识别，
        // 与 resolveHookName / isClassComponent 对 React. 前缀的处理保持一致。
        const hookName = ts.isIdentifier(n.expression)
          ? n.expression.text
          : ts.isPropertyAccessExpression(n.expression) &&
              ts.isIdentifier(n.expression.expression) &&
              n.expression.expression.text === 'React' &&
              ts.isIdentifier(n.expression.name)
            ? n.expression.name.text
            : undefined;
        if (hookName && reactHooks.has(hookName)) {
          isReactFunction = true;
          return;
        }
      }

      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
        isReactFunction = true;
        return;
      }

      ts.forEachChild(n, visit);
    };

    if (node.body) {
      visit(node.body);
    }

    if (!isReactFunction && node.type) {
      const typeText = node.type.getText();
      if (
        typeText.includes('React.ReactElement') ||
        typeText.includes('React.ReactNode') ||
        typeText.includes('JSX.Element')
      ) {
        isReactFunction = true;
      }
    }

    return isReactFunction;
  }

  static isComponentName(name: string): boolean {
    return /^[A-Z]/.test(name);
  }

  static getComponentInfo(node: ts.Node):
    | {
        name: string;
        type: 'class' | 'function';
        node:
          ts.ClassDeclaration | ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
      }
    | undefined {
    if (ts.isClassDeclaration(node) && node.name && ReactASTUtils.isClassComponent(node)) {
      if (ReactASTUtils.isComponentName(node.name.text)) {
        return { name: node.name.text, type: 'class', node };
      }
    }

    // 匿名默认导出类组件：`export default class extends React.Component {…}` 无 name token，
    // 命名分支漏判 → 不注入 HOC，但 getComponentType 仍判 'class' 产出裸 t()/intl（未定义）。
    // 赋合成名 DefaultExportedComponent（与默认导出函数组件分支对齐），由 injectHOC 命名后包裹。
    if (
      ts.isClassDeclaration(node) &&
      !node.name &&
      ReactASTUtils.isClassComponent(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      return { name: 'DefaultExportedComponent', type: 'class', node };
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ReactASTUtils.isComponentName(node.name.text)
    ) {
      if (node.initializer) {
        const funcNode = ReactASTUtils.getFunctionNodeFromInitializer(node.initializer);
        if (funcNode && ReactASTUtils.isFunctionComponent(funcNode)) {
          return { name: node.name.text, type: 'function', node: funcNode };
        }
      }
    }

    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      ReactASTUtils.isComponentName(node.name.text)
    ) {
      if (ReactASTUtils.isFunctionComponent(node)) {
        return { name: node.name.text, type: 'function', node };
      }
    }

    if (ts.isExportAssignment(node) && !node.isExportEquals && node.expression) {
      const funcNode = ReactASTUtils.getFunctionNodeFromInitializer(node.expression);
      if (funcNode && ReactASTUtils.isFunctionComponent(funcNode)) {
        const name = 'DefaultExportedComponent';
        return { name, type: 'function', node: funcNode };
      }
    }

    return undefined;
  }

  private static getFunctionNodeFromInitializer(
    initializer: ts.Expression,
  ): ts.ArrowFunction | ts.FunctionExpression | undefined {
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
      return initializer;
    }
    // 循环解包：memo(forwardRef(…)) 双包裹只解一层会返回 undefined，组件识别失败
    // → getComponentInfo 拿不到组件、注入器不注入 hook，而提取端仍会替换出裸 t()。
    let current: ts.Expression = initializer;
    while (
      ts.isCallExpression(current) &&
      ReactASTUtils.isForwardRefOrMemoCallee(current.expression)
    ) {
      const arg = current.arguments[0];
      if (!arg) return undefined;
      if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
        return arg;
      }
      current = arg;
    }
    return undefined;
  }

  /** 表达式内部（含任意深度）是否出现 JSX 元素 / 自闭合元素 / Fragment。 */
  static containsJsxNode(node: ts.Node): boolean {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      return true;
    }
    let found = false;
    node.forEachChild((child) => {
      if (found) return;
      if (ReactASTUtils.containsJsxNode(child)) found = true;
    });
    return found;
  }

  static extractFormatMessageInfo(
    node: ts.CallExpression,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo {
    const arg = node.arguments[0];
    if (!arg) return {};

    let messageInfo: MessageInfo = {};

    if (ts.isObjectLiteralExpression(arg)) {
      const props = extractObjectLiteralProperties(arg, sourceFile);
      // 只接受字符串字面量：简写变量（`{ id, defaultMessage }`）经 shorthand 分支会变成
      // {node,text} 对象，属动态描述符、无法静态还原——置 undefined 让 isValidMessage
      // 拦下保留原调用，否则对象流入 normalizeRestoreMessage 对非字符串调 .replace 抛
      // TypeError 中断整文件 restore。
      messageInfo = {
        id: typeof props.id === 'string' ? props.id : undefined,
        defaultMessage: typeof props.defaultMessage === 'string' ? props.defaultMessage : undefined,
      };

      const valuesArg = node.arguments[1];
      if (valuesArg && ts.isObjectLiteralExpression(valuesArg)) {
        if (objectLiteralHasSpread(valuesArg)) {
          messageInfo.hasUnresolvableValues = true;
        }
        messageInfo.values = extractObjectLiteralProperties(valuesArg, sourceFile);
      } else if (valuesArg) {
        // 标识符 / 调用等非对象字面量 values（`formatMessage({id}, values)`）：无法静态
        // 解析，置位保留原调用，避免占位符字面化、运行时变量静默丢失。
        messageInfo.hasUnresolvableValues = true;
      }
    } else if (ReactASTUtils.isMessageReference(arg)) {
      messageInfo = ReactASTUtils.resolveMessageReference(
        arg as ts.PropertyAccessExpression,
        definedMessages,
      );

      const valuesArg = node.arguments[1];
      if (valuesArg && ts.isObjectLiteralExpression(valuesArg)) {
        if (objectLiteralHasSpread(valuesArg)) {
          messageInfo.hasUnresolvableValues = true;
        }
        messageInfo.values = extractObjectLiteralProperties(valuesArg, sourceFile);
      } else if (valuesArg) {
        // 同上：非对象字面量 values 无法静态解析，置位保留原调用。
        messageInfo.hasUnresolvableValues = true;
      }
    }

    return messageInfo;
  }

  static extractFormattedMessageInfo(
    openingElement: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo {
    let messageInfo: MessageInfo = {};

    for (const attribute of openingElement.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const spreadMessage = ReactASTUtils.handleSpreadAttribute(attribute, definedMessages);
        if (spreadMessage) {
          messageInfo = { ...messageInfo, ...spreadMessage };
        }
      } else if (ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name)) {
        ReactASTUtils.handleJsxAttribute(attribute, messageInfo, definedMessages, sourceFile);
      }
    }

    return messageInfo;
  }

  private static handleSpreadAttribute(
    attribute: ts.JsxSpreadAttribute,
    definedMessages: Map<string, MessageInfo>,
  ): MessageInfo | null {
    if (
      ts.isPropertyAccessExpression(attribute.expression) &&
      ts.isIdentifier(attribute.expression.expression) &&
      ReactASTUtils.isMessageContainerName(attribute.expression.expression.text) &&
      ts.isIdentifier(attribute.expression.name)
    ) {
      const messageKey = attribute.expression.name.text;
      return definedMessages.get(messageKey) || null;
    }
    return null;
  }

  private static handleJsxAttribute(
    attribute: ts.JsxAttribute,
    messageInfo: MessageInfo,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): void {
    const attrName = (attribute.name as ts.Identifier).text;

    switch (attrName) {
      case 'id':
        messageInfo.id = ReactASTUtils.extractJsxAttributeValue(attribute, definedMessages);
        break;
      case 'defaultMessage':
        messageInfo.defaultMessage = ReactASTUtils.extractJsxAttributeValue(
          attribute,
          definedMessages,
        );
        break;
      case 'values':
        if (
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression &&
          ts.isObjectLiteralExpression(attribute.initializer.expression)
        ) {
          if (objectLiteralHasSpread(attribute.initializer.expression)) {
            messageInfo.hasUnresolvableValues = true;
          }
          messageInfo.values = extractObjectLiteralProperties(
            attribute.initializer.expression,
            sourceFile,
          );
        } else {
          // values={sharedValues} 等非对象字面量形态：无法静态解析，置位保留原组件。
          messageInfo.hasUnresolvableValues = true;
        }
        break;
    }
  }

  private static extractJsxAttributeValue(
    attribute: ts.JsxAttribute,
    definedMessages: Map<string, MessageInfo>,
  ): string | undefined {
    if (!attribute.initializer) return undefined;

    if (ts.isStringLiteral(attribute.initializer)) {
      return attribute.initializer.text;
    } else if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      return ReactASTUtils.extractExpressionValue(
        attribute.initializer.expression,
        definedMessages,
      );
    }

    return undefined;
  }

  private static extractExpressionValue(
    expression: ts.Expression,
    definedMessages: Map<string, MessageInfo>,
  ): string | undefined {
    // 生成端把 defaultMessage 经 JSX 表达式容器注入：`defaultMessage={"你好"}`
    // （JSON.stringify 产出的 JS 字符串字面量，见 react-intl 适配器）。此时 expression 是
    // StringLiteral 而非属性访问，需直接取字面量文本，否则 locale 缺 key 时兜底还原会丢失。
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }

    if (ts.isPropertyAccessExpression(expression)) {
      if (
        ts.isIdentifier(expression.expression) &&
        ReactASTUtils.isMessageContainerName(expression.expression.text) &&
        ts.isIdentifier(expression.name)
      ) {
        const messageKey = expression.name.text;
        const definedMessage = definedMessages.get(messageKey);
        return definedMessage?.id || definedMessage?.defaultMessage;
      }

      if (
        ts.isPropertyAccessExpression(expression.expression) &&
        ts.isIdentifier(expression.expression.expression) &&
        ReactASTUtils.isMessageContainerName(expression.expression.expression.text) &&
        ts.isIdentifier(expression.expression.name) &&
        ts.isIdentifier(expression.name)
      ) {
        const messageKey = expression.expression.name.text;
        const propertyName = expression.name.text;
        const definedMessage = definedMessages.get(messageKey);

        if (propertyName === 'id') {
          return definedMessage?.id;
        } else if (propertyName === 'defaultMessage') {
          return definedMessage?.defaultMessage;
        }
      }
    }

    return undefined;
  }

  private static isMessageReference(arg: ts.Expression): boolean {
    return (
      ts.isPropertyAccessExpression(arg) &&
      ts.isIdentifier(arg.expression) &&
      ReactASTUtils.isMessageContainerName(arg.expression.text) &&
      ts.isIdentifier(arg.name)
    );
  }

  private static resolveMessageReference(
    arg: ts.PropertyAccessExpression,
    definedMessages: Map<string, MessageInfo>,
  ): MessageInfo {
    const messageKey = arg.name.text;
    return definedMessages.get(messageKey) || {};
  }
}
