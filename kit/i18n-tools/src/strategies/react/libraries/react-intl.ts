import ts from 'typescript';
import type { ReactI18nLibrary } from './types';
import type { MessageInfo } from '../../../utils/types';
import { ReactASTUtils } from '../react-ast-utils';
import { isAlreadyInternationalizedByScaffold } from '../../../utils/ast-guards';
import { finalizeLocaleMessage } from '../../../utils/message-shape';
import { formatValuesMapping } from '../../../utils/string-escape';

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
  // ICU 消息 id 里的冒号是 id 自身的一部分。
  readonly supportsNamespace = false;
  readonly translationVarName = 'intl';
  readonly jsxComponentName = 'FormattedMessage';
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
      const escaped = JSON.stringify(this.finalizeDefaultMessage(defaultMessage, values));
      descriptor += `, defaultMessage: ${escaped}`;
    }
    descriptor += ' }';

    if (values && values.size > 0) {
      const mapping = formatValuesMapping(values);
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
      const escaped = JSON.stringify(this.finalizeDefaultMessage(defaultMessage, values));
      props += ` defaultMessage={${escaped}}`;
    }
    if (values && values.size > 0) {
      const mapping = formatValuesMapping(values);
      props += ` values={${mapping}}`;
    }
    return `<FormattedMessage ${props} />`;
  }

  generateHOCWrapper(componentName: string): string {
    return `injectIntl(${componentName})`;
  }

  getImportSpecifiers(usage: { hasJsxComponent: boolean; hasHook: boolean; hasHOC: boolean }): {
    values: string[];
    types: string[];
  } {
    const values: string[] = [];
    const types: string[] = [];
    if (usage.hasJsxComponent) values.push('FormattedMessage');
    if (usage.hasHook) values.push('useIntl');
    if (usage.hasHOC) {
      values.push('injectIntl');
      types.push('WrappedComponentProps');
    }
    return { values, types };
  }

  generateGlobalDeclaration(): string {
    return 'const intl = getIntl();';
  }

  private isTranslationExpression(expression: ts.Expression): boolean {
    // 必须形如 <receiver>.formatMessage(...)，且 receiver 是合法的 intl 持有者：
    //   - intl.formatMessage(...)            // useIntl / getIntl 产物
    //   - props.intl.formatMessage(...)      // injectIntl HOC（函数组件）
    //   - this.props.intl.formatMessage(...) // injectIntl HOC（类组件）
    // Why: 仅按方法名匹配会把任意 obj.formatMessage(...) 误判为翻译调用，
    // 配合参数中带 id 字段的对象，restore 阶段可能静默改写业务代码。
    if (!ts.isPropertyAccessExpression(expression)) return false;
    const propName = expression.name;
    if (!ts.isIdentifier(propName) || propName.text !== 'formatMessage') return false;

    const receiver = expression.expression;
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

  isTranslationCall(node: ts.CallExpression): boolean {
    return this.isTranslationExpression(node.expression);
  }

  isTranslationComponent(tagName: string): boolean {
    return tagName === 'FormattedMessage';
  }

  isHookDeclaration(declaration: ts.VariableDeclaration): boolean {
    // 必须是 `const intl = useIntl()`——绑定名收窄为 translationVarName（intl），与
    // isTranslationCall 只认 receiver 为 intl 对齐。否则改名声明 `const myIntl = useIntl()`
    // 会被删除侧（cleanupVariableStatements）当作可删 hook 整条移除，而 myIntl.formatMessage(...)
    // 不被还原（receiver 非 intl）→ 残留调用引用未定义的 myIntl（TS2304 / ReferenceError）。
    // 保守保留改名声明，与 react-i18next 端 `const { t: tr } = useTranslation()` 被保留一致。
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === this.translationVarName &&
      declaration.initializer &&
      ts.isCallExpression(declaration.initializer)
    ) {
      const expression = declaration.initializer.expression;
      return ts.isIdentifier(expression) && expression.text === 'useIntl';
    }
    return false;
  }

  isGlobalFunctionDeclaration(declaration: ts.VariableDeclaration): boolean {
    // 同 isHookDeclaration：仅认标准 `const intl = getIntl()`（绑定名为 intl），
    // 改名声明保守保留，避免删声明后残留 <name>.formatMessage 引用未定义标识符。
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === this.translationVarName &&
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

  componentUsesTranslation(node: ts.Node, _sourceFile: ts.SourceFile): boolean {
    // 统计本组件自身作用域内（含普通回调闭包，但不含嵌套组件）的 <receiver>.formatMessage(...)。
    return ReactASTUtils.someWithinComponentScope(
      node,
      (child) =>
        ts.isCallExpression(child) &&
        ts.isPropertyAccessExpression(child.expression) &&
        ts.isIdentifier(child.expression.name) &&
        child.expression.name.text === 'formatMessage',
    );
  }

  isTranslationAvailableInScope(node: ts.Node, _sourceFile: ts.SourceFile): boolean {
    // 基于 AST、限定在本组件自身作用域内（不跨嵌套组件边界）：避免命中注释 / 字符串里的伪
    // 匹配，并防止「嵌套组件已有 intl → 外层被误判已可用而漏注入」。
    return ReactASTUtils.someWithinComponentScope(node, (n) => {
      // const intl = useIntl()
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === this.translationVarName &&
        n.initializer &&
        ts.isCallExpression(n.initializer) &&
        ts.isIdentifier(n.initializer.expression) &&
        n.initializer.expression.text === 'useIntl'
      ) {
        return true;
      }
      // props.intl / this.props.intl（injectIntl HOC 注入的 intl）
      if (
        ts.isPropertyAccessExpression(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === this.translationVarName
      ) {
        const obj = n.expression;
        if (ts.isIdentifier(obj) && obj.text === 'props') return true;
        if (
          ts.isPropertyAccessExpression(obj) &&
          ts.isIdentifier(obj.name) &&
          obj.name.text === 'props'
        ) {
          return true;
        }
      }
      return false;
    });
  }

  hasLocalTranslationBinding(node: ts.Node, _sourceFile: ts.SourceFile): boolean {
    // 函数组件经 injectIntl 把 intl 作为 prop 解构传入（`({ intl }: WrappedComponentProps) => …`）
    // 时，intl 已是本地形参绑定；若漏判会再注入 `const intl = useIntl()` 与形参同作用域双声明。
    if (ReactASTUtils.componentParamBindsVar(node, this.translationVarName)) {
      return true;
    }
    // 仅认本地 `const intl = useIntl()` 绑定（不含 props.intl/this.props.intl 成员访问）。
    // generator 发出的裸 `intl.formatMessage` 需要这样一个本地绑定才不会未定义；函数组件
    // 仅有 props.intl 时据此判定仍需注入 useIntl（注入 useIntl 在 IntlProvider 下始终安全，
    // 且不涉及类组件的 injectIntl 二次包裹问题）。
    return ReactASTUtils.someWithinComponentScope(node, (n) => {
      return (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === this.translationVarName &&
        !!n.initializer &&
        ts.isCallExpression(n.initializer) &&
        ts.isIdentifier(n.initializer.expression) &&
        n.initializer.expression.text === 'useIntl'
      );
    });
  }

  isAlreadyInternationalized(node: ts.Node): boolean {
    return isAlreadyInternationalizedByScaffold(node, {
      isI18nCall: (expression) =>
        this.isTranslationExpression(expression) ||
        // defineMessages(...)
        (ts.isIdentifier(expression) && expression.text === 'defineMessages'),
      componentTags: ['FormattedMessage'],
    });
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

  /**
   * in-code defaultMessage 与 locale 落盘值口径对齐：用 finalizeLocaleMessage 对非占位符的
   * 字面量花括号做 ICU 转义（`{`→`'{'`），避免文案含字面量大括号时 react-intl 运行时把它当
   * 占位符起始而解析报错 / 与 locale 值不一致。真占位符保持单花括号不变。
   *
   * 注意：values 的方向是 Map<表达式, 占位符名>，finalizeLocaleMessage 需要「占位符名」，故传
   * values.values() 而非 keys()——否则成员访问 ${data.count} 的真占位符 {count} 会被当字面量
   * ICU 转义成 '{'count'}'，defaultMessage 不再插值。
   */
  private finalizeDefaultMessage(defaultMessage: string, values?: Map<string, string>): string {
    return finalizeLocaleMessage(defaultMessage, values ? values.values() : [], this);
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
