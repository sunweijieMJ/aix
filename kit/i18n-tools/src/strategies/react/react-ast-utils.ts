import ts from 'typescript';
import { MessageInfo } from '../../utils/types';
import { CommonASTUtils } from '../../utils/common-ast-utils';

/**
 * React 特定的 AST 工具类
 * 提供 React/JSX 相关的 AST 操作功能
 */
export class ReactASTUtils {
  /**
   * 判定一个标识符是否像 react-intl `defineMessages({ KEY: ... })` 的容器变量名。
   *
   * 此前用 `name.includes('MESSAGE')` 大小写敏感的子串匹配，对常见命名
   * （`messages` / `intlMessages` / `i18nMessages`）静默失效，导致 restore 时
   * 丢失消息容器定义。改为大小写无关，集中在此处方便后续替换为 library 注入。
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
        //   避免产出引用未声明 t() 的代码（Bug B4）。
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
    // forwardRef/memo(() => …) → 取调用表达式的父级作为绑定宿主
    if (
      host &&
      ts.isCallExpression(host) &&
      ts.isIdentifier(host.expression) &&
      ['forwardRef', 'memo'].includes(host.expression.text)
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
    if (ts.isClassDeclaration(n) && !!n.name && ReactASTUtils.isClassComponent(n)) {
      return true;
    }
    return false;
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

  static isFunctionComponent(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): boolean {
    if (
      node.parent &&
      ts.isCallExpression(node.parent) &&
      ts.isIdentifier(node.parent.expression) &&
      ['forwardRef', 'memo'].includes(node.parent.expression.text)
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

      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        if (reactHooks.has(n.expression.text)) {
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
          | ts.ClassDeclaration
          | ts.FunctionDeclaration
          | ts.ArrowFunction
          | ts.FunctionExpression;
      }
    | undefined {
    if (ts.isClassDeclaration(node) && node.name && ReactASTUtils.isClassComponent(node)) {
      if (ReactASTUtils.isComponentName(node.name.text)) {
        return { name: node.name.text, type: 'class', node };
      }
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
    if (
      ts.isCallExpression(initializer) &&
      ts.isIdentifier(initializer.expression) &&
      ['forwardRef', 'memo'].includes(initializer.expression.text)
    ) {
      const arg = initializer.arguments[0];
      if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
        return arg;
      }
    }
    return undefined;
  }

  static isFormatMessageCall(node: ts.CallExpression): boolean {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const propName = node.expression.name;
      if (ts.isIdentifier(propName) && propName.text === 'formatMessage') {
        return true;
      }
    }

    return false;
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
      const props = CommonASTUtils.extractObjectLiteralProperties(arg, sourceFile);
      messageInfo = {
        id: props.id,
        defaultMessage: props.defaultMessage,
      };

      const valuesArg = node.arguments[1];
      if (valuesArg && ts.isObjectLiteralExpression(valuesArg)) {
        messageInfo.values = CommonASTUtils.extractObjectLiteralProperties(valuesArg, sourceFile);
      }
    } else if (ReactASTUtils.isMessageReference(arg)) {
      messageInfo = ReactASTUtils.resolveMessageReference(
        arg as ts.PropertyAccessExpression,
        definedMessages,
      );

      const valuesArg = node.arguments[1];
      if (valuesArg && ts.isObjectLiteralExpression(valuesArg)) {
        messageInfo.values = CommonASTUtils.extractObjectLiteralProperties(valuesArg, sourceFile);
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
          messageInfo.values = CommonASTUtils.extractObjectLiteralProperties(
            attribute.initializer.expression,
            sourceFile,
          );
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
