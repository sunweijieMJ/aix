import ts from 'typescript';
import { LoggerUtils } from '../logger';
import { MessageInfo } from '../types';
import { CommonASTUtils } from './CommonASTUtils';

/**
 * React 特定的 AST 工具类
 * 提供 React/JSX 相关的 AST 操作功能
 */
export class ReactASTUtils {
  static getNodeContext(
    node: ts.Node,
  ): 'jsx-text' | 'jsx-attribute' | 'js-code' {
    if (ts.isJsxText(node)) {
      return 'jsx-text';
    }

    let parent = node.parent;
    while (parent) {
      if (ts.isJsxAttribute(parent)) {
        return 'jsx-attribute';
      }
      if (
        ts.isJsxExpression(parent) &&
        parent.parent &&
        ts.isJsxAttribute(parent.parent)
      ) {
        return 'jsx-attribute';
      }
      if (ts.isJsxAttribute(parent) && parent.initializer === node) {
        return 'jsx-attribute';
      }
      if (
        ts.isStringLiteral(node) &&
        ts.isJsxAttribute(parent) &&
        parent.initializer === node
      ) {
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
      if (
        ts.isCallExpression(parent) &&
        parent.arguments.includes(node as ts.Expression)
      ) {
        return false;
      }
      if (
        ts.isArrayLiteralExpression(parent) &&
        parent.elements.includes(node as ts.Expression)
      ) {
        return false;
      }
      if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
        return false;
      }
      parent = parent.parent;
    }

    return false;
  }

  static createMessageWithOptions(
    originalText: string,
    templateVariables?: string[],
  ): { message: string; placeholderMap: Map<string, string> } {
    const placeholderMap = new Map<string, string>();
    let message = originalText.replace(/^['"`]|['"`]$/g, '');

    if (templateVariables && templateVariables.length > 0) {
      const usedNames = new Set<string>();

      templateVariables.forEach((variableExpr) => {
        let key = CommonASTUtils.getVariableNameFromExpression(variableExpr);

        if (!key || key.trim() === '') {
          LoggerUtils.warn(
            `[i18n] Generated empty placeholder key for expression: ${variableExpr}, using 'val'`,
          );
          key = 'val';
        }

        const originalKey = key;
        let count = 1;

        while (usedNames.has(key)) {
          key = `${originalKey}${count++}`;
        }

        usedNames.add(key);
        placeholderMap.set(variableExpr, key);
      });

      placeholderMap.forEach((placeholder, expression) => {
        const searchPattern = `\${${expression}}`;
        message = message.split(searchPattern).join(`{${placeholder}}`);
      });
    }

    return { message, placeholderMap };
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
        if (ReactASTUtils.isFunctionComponent(current)) {
          return 'function';
        }
      }
      current = current.parent;
    }
    return 'other';
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
    ]);

    const visit = (n: ts.Node) => {
      if (isReactFunction) return;

      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        if (reactHooks.has(n.expression.text)) {
          isReactFunction = true;
          return;
        }
      }

      if (
        ts.isJsxElement(n) ||
        ts.isJsxSelfClosingElement(n) ||
        ts.isJsxFragment(n)
      ) {
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
    if (
      ts.isClassDeclaration(node) &&
      node.name &&
      ReactASTUtils.isClassComponent(node)
    ) {
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
        const funcNode = ReactASTUtils.getFunctionNodeFromInitializer(
          node.initializer,
        );
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

    if (
      ts.isExportAssignment(node) &&
      !node.isExportEquals &&
      node.expression
    ) {
      const funcNode = ReactASTUtils.getFunctionNodeFromInitializer(
        node.expression,
      );
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
    if (
      ts.isArrowFunction(initializer) ||
      ts.isFunctionExpression(initializer)
    ) {
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
      const props = CommonASTUtils.extractObjectLiteralProperties(
        arg,
        sourceFile,
      );
      messageInfo = {
        id: props.id,
        defaultMessage: props.defaultMessage,
      };

      const valuesArg = node.arguments[1];
      if (valuesArg && ts.isObjectLiteralExpression(valuesArg)) {
        messageInfo.values = CommonASTUtils.extractObjectLiteralProperties(
          valuesArg,
          sourceFile,
        );
      }
    } else if (ReactASTUtils.isMessageReference(arg)) {
      messageInfo = ReactASTUtils.resolveMessageReference(
        arg as ts.PropertyAccessExpression,
        definedMessages,
      );

      const valuesArg = node.arguments[1];
      if (valuesArg && ts.isObjectLiteralExpression(valuesArg)) {
        messageInfo.values = CommonASTUtils.extractObjectLiteralProperties(
          valuesArg,
          sourceFile,
        );
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
        const spreadMessage = ReactASTUtils.handleSpreadAttribute(
          attribute,
          definedMessages,
        );
        if (spreadMessage) {
          messageInfo = { ...messageInfo, ...spreadMessage };
        }
      } else if (
        ts.isJsxAttribute(attribute) &&
        ts.isIdentifier(attribute.name)
      ) {
        ReactASTUtils.handleJsxAttribute(
          attribute,
          messageInfo,
          definedMessages,
          sourceFile,
        );
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
      attribute.expression.expression.text.includes('MESSAGE') &&
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
        messageInfo.id = ReactASTUtils.extractJsxAttributeValue(
          attribute,
          definedMessages,
        );
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
    } else if (
      ts.isJsxExpression(attribute.initializer) &&
      attribute.initializer.expression
    ) {
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
    if (ts.isPropertyAccessExpression(expression)) {
      if (
        ts.isIdentifier(expression.expression) &&
        expression.expression.text.includes('MESSAGE') &&
        ts.isIdentifier(expression.name)
      ) {
        const messageKey = expression.name.text;
        const definedMessage = definedMessages.get(messageKey);
        return definedMessage?.id || definedMessage?.defaultMessage;
      }

      if (
        ts.isPropertyAccessExpression(expression.expression) &&
        ts.isIdentifier(expression.expression.expression) &&
        expression.expression.expression.text.includes('MESSAGE') &&
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
      arg.expression.text.includes('MESSAGE') &&
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
