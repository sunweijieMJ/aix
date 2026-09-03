import ts from 'typescript';
import { MessageInfo } from '../../utils/types';
import { extractObjectLiteralProperties, objectLiteralHasSpread } from '../../utils/ast-core';
import { findInnermostBindingDeclaration } from '../../utils/scope-analysis';

/** hasConflictingTranslationBinding 的「哪些同名绑定属于 i18n 来源」豁免口径。 */
export interface ConflictingBindingOptions {
  /** 具名导入来自这些模块时不算冲突（工具注入的全局 t 导入路径、i18n 库包名）。 */
  i18nModules?: readonly string[];
  /** 变量声明是 i18n 来源（如 react-intl 的 `const intl = getIntl()`）时不算冲突。 */
  isI18nDeclaration?: (declaration: ts.VariableDeclaration) => boolean;
  /** i18n hook 名：`const { t } = useTranslation()` 形态的初始化器算 i18n 来源。 */
  hookName?: string;
  /** HOC 注入的 props 类型名（WithTranslation / WrappedComponentProps）。 */
  hocPropsType?: string;
  /** 表达式是否为该库的 HOC 调用（`withTranslation()(X)` / `injectIntl(X)`）。 */
  isHOCCall?: (expression: ts.Expression) => boolean;
}

/** plainlyCalledNames 的按文件缓存（见其注释：逐节点重扫是 O(n²)）。 */
const PLAINLY_CALLED_NAMES = new WeakMap<ts.SourceFile, Set<string>>();

/**
 * 「把回调**当普通函数逐项调用**」的数组方法：其实参位上的 PascalCase 标识符
 * （`rows.map(Row)`）与 `Row(...)` 同性质，见 plainlyCalledNames。
 */
const ITERATION_CALLBACK_METHODS = new Set([
  'map',
  'forEach',
  'flatMap',
  'filter',
  'find',
  'findLast',
  'findIndex',
  'findLastIndex',
  'some',
  'every',
  'sort',
]);

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

    // js-code：替换体是纯表达式，任何宿主位置（对象属性值 / 实参 / 数组元素 / 变量初始化器
    // 以及已有的 JSX 表达式容器）都直接接受表达式，无需再包一层 `{}`。
    return false;
  }

  static getComponentType(node: ts.Node): 'function' | 'class' | 'other' {
    let current: ts.Node | undefined = node;
    while (current) {
      if (ts.isClassDeclaration(current)) {
        // 与函数组件侧同理：只有注入器（getComponentInfo）真正会注入 HOC 的类组件才判
        // 'class'。小写名的类组件（`class panel extends React.Component`）注入器不认，
        // 判 'class' 会产出无 this.props 解构、无导入的裸 t()（TS2304）；继续上溯落
        // 'other' 则由 import 管理器注入模块级 t/getIntl。
        if (
          ReactASTUtils.isClassComponent(current) &&
          ReactASTUtils.isInjectableClassName(current)
        ) {
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
   * 组件函数体顶层块、以及**其外层各级词法作用域直至源文件**内，是否存在与 varName 同名、
   * 但来源**不是** i18n hook 的绑定（`const { t } = useTemperature()` / `const t = fmt` /
   * 模块级 `import { t } from '@/utils/tiny-template'` / `function t() {}`）。这类绑定说明裸
   * `t(...)`/`intl.formatMessage(...)` 另有出处。
   *
   * 提取端（跳过该组件的候选）与注入端（跳过 hook 注入）必须共用这一份判定：两端口径一旦
   * 分叉，就会出现「文案已被替换成裸 t()、注入却被跳过」的静默错误产物——新 t() 解析到那个
   * 同名的非 i18n 函数上。
   *
   * 上溯外层作用域是因为注入的 `const { t } = useTranslation()` 会**遮蔽**外层同名绑定：
   * 同块双声明（TS2451）只是其中一种表现，模块级同名绑定被遮蔽则是「能编译、行为错」。
   *
   * 每一级只看该作用域的直接语句、不下钻：嵌套回调里的同名声明
   * （`useEffect(() => { const t = setTimeout(...) })` 极常见）只是无害的内层遮蔽，
   * 若也算冲突会误跳，触发面比要防的问题大得多；「这一个替换点看到的 varName 是谁」由
   * referenceBindsConflictingVar 按引用点单独判定。
   *
   * node 可以是函数（检查其形参与函数体顶层）、块、或 SourceFile（模块顶层，供模块级文案
   * 与注入名可用性判定复用）。形参只在**不是 HOC 注入形态**时算冲突：`({ t }: WithTranslation)`
   * 是 withTranslation 传入的合法 t，与 componentParamBindsVar 同口径。
   *
   * @param options.i18nModules 视为 i18n 来源、其具名导入不算冲突的模块（工具自身注入的
   *        全局 t 导入路径与 i18n 库包名）。缺省则任意同名具名导入都算冲突。
   * @param options.isI18nDeclaration 额外判定「该变量声明是 i18n 来源」的谓词（如 react-intl
   *        模块级注入的 `const intl = getIntl()`），命中同样不算冲突。
   */
  static hasConflictingTranslationBinding(
    node: ts.Node,
    varName: string,
    hookName: string,
    options?: ConflictingBindingOptions,
  ): boolean {
    const opts = options ?? {};
    if (ReactASTUtils.functionScopeBindsConflictingVar(node, varName, hookName, opts)) {
      return true;
    }

    // 自 node 自身起步（而非 node.parent）：node 为块 / SourceFile 时，该层的直接语句
    // 正是要检查的作用域；node 为函数时本层不匹配任何分支，与从 parent 起步等价。
    let current: ts.Node | undefined = node;
    while (current) {
      if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isModuleBlock(current)) {
        if (
          ReactASTUtils.statementsBindConflictingVar(current.statements, varName, hookName, opts)
        ) {
          return true;
        }
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * 函数 / 类成员**自身作用域**（形参 + 函数体直属语句）里是否有同名非 i18n 绑定，不上溯外层。
   * 注入点落在该作用域内时（类成员的 `const { t } = this.props`）用这一格判定即可；
   * 函数组件的 hook 注入还要看外层，走 hasConflictingTranslationBinding。
   */
  static functionScopeBindsConflictingVar(
    node: ts.Node,
    varName: string,
    hookName: string,
    options: ConflictingBindingOptions = {},
  ): boolean {
    if (ReactASTUtils.functionParamsBindConflictingVar(node, varName, options)) return true;
    const body = (node as ts.FunctionLikeDeclaration).body;
    return (
      !!body &&
      ts.isBlock(body) &&
      ReactASTUtils.statementsBindConflictingVar(body.statements, varName, hookName, options)
    );
  }

  /** 单个作用域的直接语句里是否有与 varName 同名的非 i18n 绑定（见 hasConflictingTranslationBinding）。 */
  private static statementsBindConflictingVar(
    statements: readonly ts.Statement[],
    varName: string,
    hookName: string,
    options: ConflictingBindingOptions,
  ): boolean {
    for (const stmt of statements) {
      if (ts.isFunctionDeclaration(stmt)) {
        if (stmt.name?.text === varName) return true;
        continue;
      }
      if (ts.isImportDeclaration(stmt)) {
        if (ReactASTUtils.importBindsName(stmt, varName, options.i18nModules ?? [])) return true;
        continue;
      }
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
        if (isHookInit) continue;
        if (options.isI18nDeclaration?.(decl)) continue;
        return true;
      }
    }
    return false;
  }

  /**
   * import 语句是否把 varName 引入本作用域（默认导入 / 命名空间导入 / 具名导入的本地名）。
   * i18nModules 内的模块除外：工具自身注入的全局 t 导入与 i18n 库导出的同名成员本就是 i18n
   * 来源，被 hook 遮蔽语义不变，算作冲突会让增量重跑对整文件停摆。
   */
  private static importBindsName(
    node: ts.ImportDeclaration,
    varName: string,
    i18nModules: readonly string[],
  ): boolean {
    if (
      ts.isStringLiteral(node.moduleSpecifier) &&
      i18nModules.includes(node.moduleSpecifier.text)
    ) {
      return false;
    }
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.name?.text === varName) return true;
    const named = clause.namedBindings;
    if (!named) return false;
    if (ts.isNamespaceImport(named)) return named.name.text === varName;
    return named.elements.some((el) => el.name.text === varName);
  }

  /**
   * 类型节点是否**直接**引用名为 name 的类型（含交叉 / 联合 / 括号成员，按 TypeReference
   * 的末段名精确比对）。
   *
   * 不能退化成 `getText().includes(name)`：`PanelWithTranslationToggleProps` 含
   * `WithTranslation` 子串却与 HOC 注入的类型无关，子串匹配会把未包裹的类误判为已包裹 ——
   * 不注入 HOC / 不加宽类型，产出 `this.props.t` 不存在的代码。
   * 不下钻泛型实参：`Props<WithTranslation>` 的外层类型不是 WithTranslation。
   */
  static typeReferencesName(node: ts.TypeNode | undefined, name: string): boolean {
    if (!node) return false;
    if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
      return node.types.some((t) => ReactASTUtils.typeReferencesName(t, name));
    }
    if (ts.isParenthesizedTypeNode(node)) {
      return ReactASTUtils.typeReferencesName(node.type, name);
    }
    if (ts.isTypeReferenceNode(node)) {
      const typeName = node.typeName;
      const last = ts.isQualifiedName(typeName) ? typeName.right.text : typeName.text;
      return last === name;
    }
    return false;
  }

  /**
   * 形参绑定的 varName 是否由 i18n HOC 注入（`({ t }: WithTranslation)` /
   * `withTranslation()(({ t }) => …)`），而非业务自己的同名形参（`(t: Tab) => …`）。
   *
   * 两条信号：形参类型引用 hocPropsType；或该函数被库 HOC 包裹（直接包裹，或文件内
   * 有 `HOC(组件名)` 形态的包裹语句）。都不满足时形参 t 与工具注入的 t 语义无关。
   */
  private static isHocInjectedParameter(
    param: ts.ParameterDeclaration,
    options: ConflictingBindingOptions,
  ): boolean {
    if (
      options.hocPropsType &&
      ReactASTUtils.typeReferencesName(param.type, options.hocPropsType)
    ) {
      return true;
    }
    const isHOCCall = options.isHOCCall;
    if (!isHOCCall) return false;

    const func = param.parent;
    // HOC(( { t } ) => …)：形参所属函数本身就是 HOC 调用的实参（memo/forwardRef 先解包）
    let host: ts.Node | undefined = func.parent;
    while (
      host &&
      ts.isCallExpression(host) &&
      ReactASTUtils.isForwardRefOrMemoCallee(host.expression)
    ) {
      host = host.parent;
    }
    if (host && ts.isCallExpression(host) && isHOCCall(host)) return true;

    // `const Foo = ({ t }) => …; export default withTranslation()(Foo);`：按组件名回查包裹语句
    const componentName = ReactASTUtils.declaredFunctionName(func);
    const sourceFile = ReactASTUtils.sourceFileOf(param);
    if (!componentName || !sourceFile) return false;
    let wrapped = false;
    const visit = (n: ts.Node): void => {
      if (wrapped) return;
      if (
        ts.isCallExpression(n) &&
        isHOCCall(n) &&
        n.arguments.some((arg) => ts.isIdentifier(arg) && arg.text === componentName)
      ) {
        wrapped = true;
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(sourceFile);
    return wrapped;
  }

  /** 函数声明自身的名字，或其绑定到的变量名（`const Foo = () => …`）。 */
  private static declaredFunctionName(func: ts.Node): string | undefined {
    if (ts.isFunctionDeclaration(func) && func.name) return func.name.text;
    let host: ts.Node | undefined = func.parent;
    while (
      host &&
      ts.isCallExpression(host) &&
      ReactASTUtils.isForwardRefOrMemoCallee(host.expression)
    ) {
      host = host.parent;
    }
    if (host && ts.isVariableDeclaration(host) && ts.isIdentifier(host.name)) return host.name.text;
    return undefined;
  }

  /** 函数（若 node 是函数）的形参里是否有绑定 varName 的**非 i18n** 形参。 */
  static functionParamsBindConflictingVar(
    node: ts.Node,
    varName: string,
    options: ConflictingBindingOptions = {},
  ): boolean {
    if (
      !ts.isArrowFunction(node) &&
      !ts.isFunctionExpression(node) &&
      !ts.isFunctionDeclaration(node) &&
      !ts.isMethodDeclaration(node) &&
      !ts.isConstructorDeclaration(node) &&
      !ts.isGetAccessorDeclaration(node) &&
      !ts.isSetAccessorDeclaration(node)
    ) {
      return false;
    }
    return node.parameters.some(
      (param) =>
        ReactASTUtils.parameterBindsName(param, varName) &&
        !ReactASTUtils.isHocInjectedParameter(param, options),
    );
  }

  /** 形参（标识符 / 对象解构 / 数组解构，含嵌套）是否绑定了名为 name 的本地变量。 */
  private static parameterBindsName(param: ts.ParameterDeclaration, name: string): boolean {
    const bindsName = (binding: ts.BindingName): boolean => {
      if (ts.isIdentifier(binding)) return binding.text === name;
      if (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding)) {
        return binding.elements.some((el) => ts.isBindingElement(el) && bindsName(el.name));
      }
      return false;
    };
    return bindsName(param.name);
  }

  /**
   * 声明是否属于 i18n 来源：hook 解构（`const { t } = useTranslation()`）、类组件的
   * `const { t } = this.props`、库自定义的全局声明（`const intl = getIntl()`），
   * 以及 HOC 注入的形参。其余（业务变量 / 回调形参 / 循环变量 / catch 参数 / 同名函数）
   * 都不是 i18n 来源。
   */
  static isI18nSourceDeclaration(
    declaration: ts.Node,
    options: ConflictingBindingOptions = {},
  ): boolean {
    if (ts.isParameter(declaration)) {
      return ReactASTUtils.isHocInjectedParameter(declaration, options);
    }
    if (!ts.isVariableDeclaration(declaration)) return false;
    const initializer = declaration.initializer;
    if (
      initializer &&
      options.hookName &&
      ts.isCallExpression(initializer) &&
      ts.isIdentifier(initializer.expression) &&
      initializer.expression.text === options.hookName
    ) {
      return true;
    }
    // 类组件注入形态：`const { t } = this.props`
    if (
      initializer &&
      ts.isPropertyAccessExpression(initializer) &&
      initializer.expression.kind === ts.SyntaxKind.ThisKeyword &&
      initializer.name.text === 'props'
    ) {
      return true;
    }
    return options.isI18nDeclaration?.(declaration) === true;
  }

  /**
   * 「这一个替换点看到的 varName 是谁」——从引用点 ref 逐层向上找最内层同名绑定，
   * 该绑定不是 i18n 来源即返回 true（替换成裸 varName(...) 会调到用户自己的变量上）。
   *
   * 与 hasConflictingTranslationBinding 的分工：后者回答「能否向这个作用域注入一个新的
   * varName」（外层同名绑定会被遮蔽也算冲突），本方法回答「这一处引用解析到哪个绑定」。
   * 提取端两者都要过：注入不安全、或本处引用被非 i18n 绑定遮蔽，都必须跳过该候选。
   *
   * boundary 限定上溯范围：函数组件传组件函数节点（含其形参），类成员传该成员函数节点，
   * 模块级候选不传（一路查到 SourceFile）。
   */
  static referenceBindsConflictingVar(
    ref: ts.Node,
    varName: string,
    boundary: ts.Node | undefined,
    options: ConflictingBindingOptions = {},
  ): boolean {
    const declaration = findInnermostBindingDeclaration(ref, varName, boundary);
    if (!declaration) return false;
    return !ReactASTUtils.isI18nSourceDeclaration(declaration, options);
  }

  /**
   * 向作用域 scope 注入名为 name 的绑定是否安全 —— 四类注入名（翻译变量 / hook /
   * JSX 组件 / 全局函数 / HOC props 类型）与三类作用域（函数组件、类方法、模块顶层）
   * 的统一入口，提取端跳过与注入端跳过共用其结论。
   *
   * kind='type' 时额外看同名的 interface / type / enum 声明：`import type { WithTranslation }`
   * 与本地同名类型声明同样是重复标识符。
   */
  static canBindName(
    scope: ts.Node,
    name: string,
    options: ConflictingBindingOptions & { kind?: 'value' | 'type' } = {},
  ): boolean {
    if (
      ReactASTUtils.hasConflictingTranslationBinding(scope, name, options.hookName ?? '', options)
    ) {
      return false;
    }
    if (options.kind === 'type') {
      const statements = (scope as ts.BlockLike).statements;
      if (
        statements?.some(
          (stmt) =>
            (ts.isInterfaceDeclaration(stmt) ||
              ts.isTypeAliasDeclaration(stmt) ||
              ts.isEnumDeclaration(stmt)) &&
            stmt.name.text === name,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * 从 node 向上找最近的「注入器会为其注入 `const { t } = this.props` 的类成员函数」
   * （方法 / 构造器 / 访问器 / 箭头属性初始化器）；先遇到类体或源文件则返回 undefined。
   */
  static findEnclosingClassMemberFunction(node: ts.Node): ts.Node | undefined {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (
        ts.isMethodDeclaration(current) ||
        ts.isConstructorDeclaration(current) ||
        ts.isGetAccessorDeclaration(current) ||
        ts.isSetAccessorDeclaration(current)
      ) {
        return current;
      }
      if (ts.isPropertyDeclaration(current)) {
        return current.initializer && ts.isArrowFunction(current.initializer)
          ? current.initializer
          : undefined;
      }
      if (ts.isClassLike(current) || ts.isSourceFile(current)) return undefined;
      current = current.parent;
    }
    return undefined;
  }

  /**
   * 判断一个函数是否会被 ReactComponentInjector 当作组件注入 hook。
   * 必须与 getComponentInfo 的接受条件保持一致：
   * - 命名函数声明：PascalCase 名
   * - 箭头/函数表达式：绑定到 PascalCase 变量（含 forwardRef/memo 包裹），或匿名默认导出
   * - 名字在文件内被当普通函数调用（`Tip()`）的一律排除，见 plainlyCalledNames
   */
  static isInjectableComponentFunction(
    func: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): boolean {
    if (ts.isFunctionDeclaration(func)) {
      if (!func.name || !ReactASTUtils.isComponentName(func.name.text)) return false;
      return !ReactASTUtils.isPlainlyCalled(func, func.name.text);
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
        if (!ReactASTUtils.isComponentName(host.name.text)) return false;
        return !ReactASTUtils.isPlainlyCalled(host, host.name.text);
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
      // PascalCase 具名类组件，或匿名默认导出类组件（getComponentInfo 同样会为其注入 HOC）均算边界。
      if (ReactASTUtils.isInjectableClassName(n)) {
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
   *
   * 传入 options（hocPropsType / isHOCCall）时进一步要求该形参**确实来自 i18n HOC**：形参类型
   * 引用 hocPropsType，或该组件被库 HOC 包裹。业务自己的同名解构形参（`({ t }: { t: Tab })`）
   * 不提供翻译函数，当成「已有 i18n 绑定」会让替换出的 `t('k')` 调到业务对象上（TS2349）。
   * 不传 options 时维持"任意同名解构形参即算绑定"的宽口径（restore 侧据此识别 HOC 组件形态）。
   */
  static componentParamBindsVar(
    node: ts.Node,
    varName: string,
    options?: ConflictingBindingOptions,
  ): boolean {
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
        param.name.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === varName) &&
        (!options || ReactASTUtils.isHocInjectedParameter(param, options)),
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

  /**
   * 类组件的名字形态是否落在注入器的受理范围内（与 getComponentInfo 的两条类分支一致）：
   * PascalCase 具名类，或匿名默认导出类（由 injectHOC 命名后包裹）。
   */
  static isInjectableClassName(node: ts.ClassDeclaration): boolean {
    if (node.name) {
      return ReactASTUtils.isComponentName(node.name.text);
    }
    return node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
  }

  /**
   * 文件内被当作**普通函数**调用（`Foo(...)`）的标识符名集合。
   *
   * PascalCase 的渲染助手常见两种用法：`<Tip />`（渲染成组件，有自己的 Hooks 上下文）与
   * `Tip()`（在调用方的渲染过程中就地展开）。后者若被注入 `useTranslation()`，hook 便在
   * 调用方的组件里被条件/循环地执行（`dense ? Cell(r) : <Cell/>`），违反 Hooks 规则。
   * 故这类标识符整体不视为可注入组件：文案改由模块级全局 t/getIntl 承载，两种用法都安全。
   *
   * 同样计入「作为迭代回调按引用传入」的形态（`rows.map(Row)`）：Row 会被逐行当普通函数
   * 调用，注入 hook 后行数一变就是 "Rendered more hooks than during the previous render"。
   * 只认 ITERATION_CALLBACK_METHODS 这几个数组方法的实参位，不泛化到任意调用实参 ——
   * `memo(Foo)` / `observer(Foo)` / `connect(…)(Foo)` 等 HOC 同样是按引用传递，
   * 但它们返回的仍是组件、渲染时才执行，算进来会让大量正常组件被降级成模块级 t。
   *
   * 按 SourceFile 缓存：getComponentInfo 会对每个节点调用，逐次全文件扫描是 O(n²)。
   */
  static plainlyCalledNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
    const cached = PLAINLY_CALLED_NAMES.get(sourceFile);
    if (cached) return cached;
    const names = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        if (ts.isIdentifier(n.expression)) {
          names.add(n.expression.text);
        } else if (
          ts.isPropertyAccessExpression(n.expression) &&
          ts.isIdentifier(n.expression.name) &&
          ITERATION_CALLBACK_METHODS.has(n.expression.name.text)
        ) {
          for (const arg of n.arguments) {
            if (ts.isIdentifier(arg) && ReactASTUtils.isComponentName(arg.text)) {
              names.add(arg.text);
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sourceFile);
    PLAINLY_CALLED_NAMES.set(sourceFile, names);
    return names;
  }

  /** 取 node 所属的源文件；合成节点（无 parent 链）返回 undefined。 */
  private static sourceFileOf(node: ts.Node): ts.SourceFile | undefined {
    let current: ts.Node | undefined = node;
    while (current) {
      if (ts.isSourceFile(current)) return current;
      current = current.parent;
    }
    return undefined;
  }

  /** name 在 node 所属文件里是否存在 `name(...)` 普通调用（见 plainlyCalledNames）。 */
  static isPlainlyCalled(node: ts.Node, name: string): boolean {
    const sourceFile = ReactASTUtils.sourceFileOf(node);
    if (!sourceFile) return false;
    return ReactASTUtils.plainlyCalledNames(sourceFile).has(name);
  }

  /**
   * node 若是「形态上够格当组件、但因被普通调用而不注入」的声明，返回其名字，否则 undefined。
   * 供注入器就这一类跳过打一条告警（判定本身收口在 getComponentInfo / isInjectableComponentFunction）。
   */
  static getPlainlyCalledComponentName(node: ts.Node): string | undefined {
    let name: string | undefined;
    let func: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | undefined;

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ReactASTUtils.isComponentName(node.name.text) &&
      node.initializer
    ) {
      name = node.name.text;
      func = ReactASTUtils.getFunctionNodeFromInitializer(node.initializer);
    } else if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      ReactASTUtils.isComponentName(node.name.text)
    ) {
      name = node.name.text;
      func = node;
    }

    if (!name || !func || !ReactASTUtils.isFunctionComponent(func)) return undefined;
    return ReactASTUtils.isPlainlyCalled(node, name) ? name : undefined;
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

    // 名字被当普通函数调用（`Tip()`）的渲染助手不注入 hook（违反 Hooks 规则），
    // 其文案改由模块级全局 t/getIntl 承载 —— 见 plainlyCalledNames。
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ReactASTUtils.isComponentName(node.name.text) &&
      !ReactASTUtils.isPlainlyCalled(node, node.name.text)
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
      ReactASTUtils.isComponentName(node.name.text) &&
      !ReactASTUtils.isPlainlyCalled(node, node.name.text)
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
      default:
        // id / defaultMessage / values 之外的属性（tagName / description / children 函数…）
        // 都参与运行时渲染，整节点替换会把它们连同其引用的变量一并丢弃。置位保留原组件，
        // 与调用形态 `formatMessage(desc, values)` 的 hasUnresolvableValues 同口径。
        messageInfo.hasUnresolvableValues = true;
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
