import ts from 'typescript';
import type { ReactI18nLibrary } from './types';
import type { MessageInfo } from '../../../utils/types';
import { ReactASTUtils } from '../react-ast-utils';
import { CommonASTUtils } from '../../../utils/common-ast-utils';

/**
 * react-intl 库适配器实现
 *
 * API 模式:
 * - Hook:     const intl = useIntl()
 * - 函数调用: intl.formatMessage({ id: 'key' }, { name: value })
 * - JSX组件:  <FormattedMessage id="key" values={{ name: value }} />
 * - HOC:      injectIntl(Component)
 * - 类型:     WrappedComponentProps
 */
export class ReactIntlLibrary implements ReactI18nLibrary {
  readonly packageName = 'react-intl';
  readonly hookName = 'useIntl';
  readonly hookDeclaration = 'const intl = useIntl();';
  // react-intl 用 ICU 单花括号 `{name}`
  readonly usesDoubleBracePlaceholders = false;
  readonly translationVarName = 'intl';
  readonly jsxComponentName = 'FormattedMessage';
  readonly jsxIdPropName = 'id';
  readonly hocName = 'injectIntl';
  readonly hocPropsType = 'WrappedComponentProps';
  readonly globalFunctionName = 'getIntl';

  generateFunctionCall(
    id: string,
    values?: Map<string, string>,
    includeDefaultMessage?: boolean,
    defaultMessage?: string,
  ): string {
    const call = 'intl.formatMessage';
    let descriptor = `{ id: '${id}'`;
    if (includeDefaultMessage && defaultMessage) {
      const escaped = JSON.stringify(defaultMessage);
      descriptor += `, defaultMessage: ${escaped}`;
    }
    descriptor += ' }';

    if (values && values.size > 0) {
      const mapping = this.formatValuesMapping(values);
      return `${call}(${descriptor}, ${mapping})`;
    }
    return `${call}(${descriptor})`;
  }

  generateJSXComponent(
    id: string,
    values?: Map<string, string>,
    includeDefaultMessage?: boolean,
    defaultMessage?: string,
  ): string {
    let props = `id="${id}"`;
    if (includeDefaultMessage && defaultMessage) {
      // 经 JSX 表达式容器 `{...}` 注入：JSON.stringify 产出 JS 字符串字面量（内部 " 转义为 \"），
      // 而 JSX 属性值是 HTML 风格、不解析反斜杠转义，直接拼属性遇到 " 会提前闭合 → JSX 语法错误。
      const escaped = JSON.stringify(defaultMessage);
      props += ` defaultMessage={${escaped}}`;
    }
    if (values && values.size > 0) {
      const mapping = this.formatValuesMapping(values);
      props += ` values={${mapping}}`;
    }
    return `<FormattedMessage ${props} />`;
  }

  generateHOCWrapper(componentName: string): string {
    return `injectIntl(${componentName})`;
  }

  getImportSpecifiers(usage: {
    hasJsxComponent: boolean;
    hasHook: boolean;
    hasHOC: boolean;
  }): string[] {
    const specifiers: string[] = [];
    if (usage.hasJsxComponent) specifiers.push('FormattedMessage');
    if (usage.hasHook) specifiers.push('useIntl');
    if (usage.hasHOC) {
      specifiers.push('injectIntl', 'WrappedComponentProps');
    }
    return specifiers;
  }

  generateGlobalDeclaration(): string {
    return 'const intl = getIntl();';
  }

  isTranslationCall(node: ts.CallExpression): boolean {
    // 必须形如 <receiver>.formatMessage(...)，且 receiver 是合法的 intl 持有者：
    //   - intl.formatMessage(...)            // useIntl / getIntl 产物
    //   - props.intl.formatMessage(...)      // injectIntl HOC（函数组件）
    //   - this.props.intl.formatMessage(...) // injectIntl HOC（类组件）
    // Why: 仅按方法名匹配会把任意 obj.formatMessage(...) 误判为翻译调用，
    // 配合参数中带 id 字段的对象，restore 阶段可能静默改写业务代码。
    if (!ts.isPropertyAccessExpression(node.expression)) return false;
    const propName = node.expression.name;
    if (!ts.isIdentifier(propName) || propName.text !== 'formatMessage') return false;

    const receiver = node.expression.expression;
    // intl.formatMessage(...)
    if (ts.isIdentifier(receiver) && receiver.text === this.translationVarName) {
      return true;
    }
    // props.intl.formatMessage(...) / this.props.intl.formatMessage(...)
    if (
      ts.isPropertyAccessExpression(receiver) &&
      ts.isIdentifier(receiver.name) &&
      receiver.name.text === this.translationVarName
    ) {
      const inner = receiver.expression;
      if (ts.isIdentifier(inner) && inner.text === 'props') return true;
      if (
        ts.isPropertyAccessExpression(inner) &&
        inner.expression.kind === ts.SyntaxKind.ThisKeyword &&
        ts.isIdentifier(inner.name) &&
        inner.name.text === 'props'
      ) {
        return true;
      }
    }
    return false;
  }

  isTranslationComponent(tagName: string): boolean {
    return tagName === 'FormattedMessage';
  }

  isHookDeclaration(declaration: ts.VariableDeclaration): boolean {
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.initializer &&
      ts.isCallExpression(declaration.initializer)
    ) {
      const expression = declaration.initializer.expression;
      return ts.isIdentifier(expression) && expression.text === 'useIntl';
    }
    return false;
  }

  isGlobalFunctionDeclaration(declaration: ts.VariableDeclaration): boolean {
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.initializer &&
      ts.isCallExpression(declaration.initializer)
    ) {
      const expression = declaration.initializer.expression;
      return ts.isIdentifier(expression) && expression.text === 'getIntl';
    }
    return false;
  }

  isHOCCall(expression: ts.Expression): boolean {
    return (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'injectIntl'
    );
  }

  getHOCWrappedComponent(expression: ts.Expression): string | undefined {
    if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'injectIntl' &&
      expression.arguments.length > 0 &&
      ts.isIdentifier(expression.arguments[0]!)
    ) {
      return (expression.arguments[0] as ts.Identifier).text;
    }
    return undefined;
  }

  componentUsesTranslation(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    let uses = false;
    const visitor = (child: ts.Node) => {
      if (ts.isCallExpression(child)) {
        const exprText = child.expression.getText(sourceFile);
        if (exprText.endsWith('.formatMessage')) {
          uses = true;
        }
      }
      if (!uses) {
        ts.forEachChild(child, visitor);
      }
    };
    visitor(node);
    return uses;
  }

  isTranslationAvailableInScope(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    const text = node.getText(sourceFile);
    return (
      /const\s+intl\s*=\s*useIntl/.test(text) ||
      /props\.intl/.test(text) ||
      /this\.props\.intl/.test(text)
    );
  }

  isAlreadyInternationalized(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent) {
      if (ts.isCallExpression(parent)) {
        const expression = parent.expression;
        // intl.formatMessage(...)
        if (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.name) &&
          expression.name.text === 'formatMessage'
        ) {
          return true;
        }
        // defineMessages(...)
        if (ts.isIdentifier(expression) && expression.text === 'defineMessages') {
          return true;
        }
      }
      // <FormattedMessage id={...} />
      if (ts.isJsxAttribute(parent)) {
        const jsxElement = parent.parent.parent;
        if (
          (ts.isJsxOpeningElement(jsxElement) || ts.isJsxSelfClosingElement(jsxElement)) &&
          ts.isIdentifier(jsxElement.tagName) &&
          jsxElement.tagName.text === 'FormattedMessage'
        ) {
          return true;
        }
      }
      if (ts.isJsxElement(parent)) {
        const openingElement = parent.openingElement;
        if (
          ts.isIdentifier(openingElement.tagName) &&
          openingElement.tagName.text === 'FormattedMessage'
        ) {
          return true;
        }
      }
      // 类型字面量与枚举成员值在编译期就被消费，不参与运行时本地化，应跳过提取。
      if (ts.isLiteralTypeNode(parent) || ts.isEnumMember(parent)) {
        return true;
      }
      if (ts.isBlock(parent) || ts.isFunctionLike(parent) || ts.isClassLike(parent)) {
        return false;
      }
      parent = parent.parent;
    }
    return false;
  }

  extractCallInfo(
    node: ts.CallExpression,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo {
    return ReactASTUtils.extractFormatMessageInfo(node, definedMessages, sourceFile);
  }

  extractJSXInfo(
    openingElement: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo {
    return ReactASTUtils.extractFormattedMessageInfo(openingElement, definedMessages, sourceFile);
  }

  private formatValuesMapping(values: Map<string, string>): string {
    return CommonASTUtils.formatValuesMapping(values);
  }

  // react-intl 用 ICU，单 `{` 是插值/语法字符。ICU 以单引号转义：`'{'` / `'}'`，
  // 字面量单引号写成 `''`。（相邻字面量花括号属 ICU 引号的极端边界，不在此覆盖。）
  escapeLiteralText(text: string): string {
    return text.replace(/'/g, "''").replace(/[{}]/g, (c) => `'${c}'`);
  }

  unescapeLiteralText(text: string): string {
    return text.replace(/'\{'/g, '{').replace(/'\}'/g, '}').replace(/''/g, "'");
  }
}
