import ts from 'typescript';
import type { ReactI18nLibrary } from './types';
import type { MessageInfo } from '../../../utils/types';
import { ReactASTUtils } from '../react-ast-utils';
import { CommonASTUtils } from '../../../utils/common-ast-utils';

/**
 * react-i18next 库适配器实现
 *
 * API 模式:
 * - Hook:     const { t } = useTranslation()
 * - 函数调用: t('key', { name: value })
 * - JSX组件:  <Trans i18nKey="key" values={{ name: value }} />
 * - HOC:      withTranslation()(Component)
 * - 类型:     WithTranslation
 */
export class ReactI18nextLibrary implements ReactI18nLibrary {
  readonly packageName = 'react-i18next';
  readonly hookName = 'useTranslation';
  readonly hookDeclaration = 'const { t } = useTranslation();';
  // react-i18next 默认插值语法是双花括号 `{{name}}`
  readonly usesDoubleBracePlaceholders = true;
  readonly translationVarName = 't';
  readonly jsxComponentName = 'Trans';
  readonly jsxIdPropName = 'i18nKey';
  readonly hocName = 'withTranslation';
  readonly hocPropsType = 'WithTranslation';
  // 非组件（模块顶层）作用域使用从 tImport 注入的 t（import { t }），
  // 与组件内 useTranslation 的 t 形态一致。
  readonly globalFunctionName = 't';

  private namespace?: string;

  constructor(options?: { namespace?: string }) {
    this.namespace = options?.namespace;
  }

  generateFunctionCall(
    id: string,
    values?: Map<string, string>,
    includeDefaultMessage?: boolean,
    defaultMessage?: string,
    isGlobalScope?: boolean,
  ): string {
    const key = this.namespace ? `${this.namespace}:${id}` : id;
    // 组件内 t 来自 useTranslation hook，非组件 t 来自 import { t }；两种形态都是裸 t()。
    const fn = isGlobalScope ? this.globalFunctionName : this.translationVarName;

    if (values && values.size > 0) {
      const mapping = this.formatValuesMapping(values);
      if (includeDefaultMessage && defaultMessage) {
        const escaped = JSON.stringify(this.localizeDefaultMessage(defaultMessage, values));
        return `${fn}('${key}', { defaultValue: ${escaped}, ${this.formatValuesMappingInline(values)} })`;
      }
      return `${fn}('${key}', ${mapping})`;
    }

    if (includeDefaultMessage && defaultMessage) {
      const escaped = JSON.stringify(this.localizeDefaultMessage(defaultMessage, values));
      return `${fn}('${key}', { defaultValue: ${escaped} })`;
    }

    return `${fn}('${key}')`;
  }

  /**
   * 把规范化的单花括号默认文案（`你好 {name}`）转成 i18next 运行时可插值的形态。
   *
   * Why：i18next 默认插值语法是双花括号 `{{name}}`，单花括号被当作字面量。defaultValue /
   * defaults 仅在 locale 缺 key 时兜底渲染，若沿用单花括号占位符，缺 key 时会原样显示
   * `你好 {name}` 而非替换变量。复用 finalizeLocaleMessage：只把真占位符转双花括号，
   * 正文里的字面 `{x}` 保持不动——与写入 locale 的值口径一致。
   *
   * 注意：values 的方向是 Map<表达式, 占位符名>（createMessageWithOptions 的 placeholderMap），
   * finalizeLocaleMessage 需要的是消息里以 {x} 出现的「占位符名」，故必须传 values.values()
   * 而非 keys()——成员访问 ${data.count}（名 count != 表达式 data.count）下传 keys() 会让真
   * 占位符被当字面花括号，缺 key 时不插值。
   */
  private localizeDefaultMessage(defaultMessage: string, values?: Map<string, string>): string {
    return CommonASTUtils.finalizeLocaleMessage(defaultMessage, values?.values() ?? [], this);
  }

  generateJSXComponent(
    id: string,
    values?: Map<string, string>,
    includeDefaultMessage?: boolean,
    defaultMessage?: string,
  ): string {
    const key = this.namespace ? `${this.namespace}:${id}` : id;
    let props = `i18nKey="${key}"`;

    if (includeDefaultMessage && defaultMessage) {
      // 经 JSX 表达式容器 `{...}` 注入：JSON.stringify 产出的是 JS 字符串字面量（内部 " 转义为
      // \"、换行为 \n），而 JSX 属性值是 HTML 风格、不解析反斜杠转义。若直接 `defaults="..\".."`
      // 拼成属性，文本含 " 会提前闭合属性 → 整文件 JSX 语法错误。用 {} 让其按 JS 字面量解析。
      const escaped = JSON.stringify(this.localizeDefaultMessage(defaultMessage, values));
      props += ` defaults={${escaped}}`;
    }
    if (values && values.size > 0) {
      const mapping = this.formatValuesMapping(values);
      props += ` values={${mapping}}`;
    }
    return `<Trans ${props} />`;
  }

  generateHOCWrapper(componentName: string): string {
    if (this.namespace) {
      return `withTranslation('${this.namespace}')(${componentName})`;
    }
    return `withTranslation()(${componentName})`;
  }

  getImportSpecifiers(usage: {
    hasJsxComponent: boolean;
    hasHook: boolean;
    hasHOC: boolean;
  }): string[] {
    const specifiers: string[] = [];
    if (usage.hasJsxComponent) specifiers.push('Trans');
    if (usage.hasHook) specifiers.push('useTranslation');
    if (usage.hasHOC) {
      specifiers.push('withTranslation', 'WithTranslation');
    }
    return specifiers;
  }

  generateGlobalDeclaration(): string {
    // react-i18next 非组件上下文直接使用 i18next 实例
    return '';
  }

  isTranslationCall(node: ts.CallExpression): boolean {
    // t('key')
    if (ts.isIdentifier(node.expression) && node.expression.text === 't') {
      return true;
    }
    // 仅 i18next.t('key') —— 不能放宽到所有 obj.t() 形态，否则 router.t()、
    // store.t() 等同名方法会被 RestoreTransformer 当作 i18n 调用替换为
    // locale 文案，破坏业务代码（且静默无报错）。
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'i18next' &&
      ts.isIdentifier(node.expression.name) &&
      node.expression.name.text === 't'
    ) {
      return true;
    }
    return false;
  }

  isTranslationComponent(tagName: string): boolean {
    return tagName === 'Trans';
  }

  isHookDeclaration(declaration: ts.VariableDeclaration): boolean {
    // const { t } = useTranslation()
    if (
      ts.isObjectBindingPattern(declaration.name) &&
      declaration.initializer &&
      ts.isCallExpression(declaration.initializer)
    ) {
      const expression = declaration.initializer.expression;
      return ts.isIdentifier(expression) && expression.text === 'useTranslation';
    }
    return false;
  }

  isGlobalFunctionDeclaration(_declaration: ts.VariableDeclaration): boolean {
    // react-i18next 非组件上下文通过 import i18next 直接使用，不需要变量声明
    return false;
  }

  isHOCCall(expression: ts.Expression): boolean {
    // withTranslation()(Component) - 这是一个柯里化调用
    if (
      ts.isCallExpression(expression) &&
      ts.isCallExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === 'withTranslation'
    ) {
      return true;
    }
    return false;
  }

  getHOCWrappedComponent(expression: ts.Expression): string | undefined {
    // withTranslation()(Component)
    if (
      ts.isCallExpression(expression) &&
      ts.isCallExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === 'withTranslation' &&
      expression.arguments.length > 0 &&
      ts.isIdentifier(expression.arguments[0]!)
    ) {
      return (expression.arguments[0] as ts.Identifier).text;
    }
    return undefined;
  }

  componentUsesTranslation(node: ts.Node, _sourceFile: ts.SourceFile): boolean {
    // 统计本组件自身作用域内（含普通回调闭包，但不含嵌套组件）的 t('key') 调用。
    return ReactASTUtils.someWithinComponentScope(
      node,
      (child) =>
        ts.isCallExpression(child) &&
        ts.isIdentifier(child.expression) &&
        child.expression.text === 't',
    );
  }

  isTranslationAvailableInScope(node: ts.Node): boolean {
    // 用 AST 判断「本组件自身作用域内」是否已通过 useTranslation() 解构出本地变量 `t`。
    // 只认本地绑定名为 t 的元素，因此与解构位置无关（`const { i18n, t } = useTranslation()`
    // 也命中），且对 `const { t: x }`（t 被改名、本地无 t）正确返回 false。
    //
    // 关键：经 someWithinComponentScope 在嵌套组件边界停止下钻——嵌套组件各自的
    // `const { t } = useTranslation()` 不算外层「已有 t」，否则外层会漏注入、其自身 t() 引用
    // 未声明标识符。
    return ReactASTUtils.someWithinComponentScope(node, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        ts.isCallExpression(n.initializer) &&
        ts.isIdentifier(n.initializer.expression) &&
        n.initializer.expression.text === this.hookName &&
        ts.isObjectBindingPattern(n.name)
      ) {
        return n.name.elements.some(
          (el) => ts.isIdentifier(el.name) && el.name.text === this.translationVarName,
        );
      }
      return false;
    });
  }

  isAlreadyInternationalized(node: ts.Node): boolean {
    return CommonASTUtils.isAlreadyInternationalizedByScaffold(node, {
      isI18nCall: (expression) =>
        // t('key')
        (ts.isIdentifier(expression) && expression.text === 't') ||
        // i18next.t('key')
        (ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.name) &&
          expression.name.text === 't'),
      componentTags: ['Trans'],
    });
  }

  extractCallInfo(
    node: ts.CallExpression,
    _definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo {
    const arg = node.arguments[0];
    if (!arg) return {};

    const messageInfo: MessageInfo = {};

    if (ts.isStringLiteral(arg)) {
      messageInfo.id = ReactI18nextLibrary.stripNamespacePrefix(arg.text);
    }

    const valuesArg = node.arguments[1];
    if (valuesArg && ts.isObjectLiteralExpression(valuesArg)) {
      const props = CommonASTUtils.extractObjectLiteralProperties(valuesArg, sourceFile);
      // react-i18next 约定：values.defaultValue 实为默认翻译文本，上提到 defaultMessage，
      // 不参与占位符替换。仅在为字符串时上提，其他形态保持 undefined。
      if (typeof props.defaultValue === 'string') {
        messageInfo.defaultMessage = props.defaultValue;
      }
      delete props.defaultValue;
      if (Object.keys(props).length > 0) {
        messageInfo.values = props;
      }
    }

    return messageInfo;
  }

  extractJSXInfo(
    openingElement: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    _definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo {
    const messageInfo: MessageInfo = {};
    for (const attribute of openingElement.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;

      const attrName = attribute.name.text;
      const initializer = attribute.initializer;
      if (!initializer) continue;

      if (attrName === 'i18nKey' && ts.isStringLiteral(initializer)) {
        messageInfo.id = ReactI18nextLibrary.stripNamespacePrefix(initializer.text);
      } else if (attrName === 'defaults') {
        // 生成端经 JSX 表达式容器注入 `defaults={"你好"}`（见本类 generateComponent 的
        // `defaults={${JSON.stringify(...)}}`），initializer 是 JsxExpression 而非裸 StringLiteral。
        // 仅匹配 ts.isStringLiteral 会永远取不到 defaultMessage，导致 locale 缺 key 时兜底还原失效。
        if (ts.isStringLiteral(initializer)) {
          messageInfo.defaultMessage = initializer.text;
        } else if (
          ts.isJsxExpression(initializer) &&
          initializer.expression &&
          (ts.isStringLiteral(initializer.expression) ||
            ts.isNoSubstitutionTemplateLiteral(initializer.expression))
        ) {
          messageInfo.defaultMessage = initializer.expression.text;
        }
      } else if (
        attrName === 'values' &&
        ts.isJsxExpression(initializer) &&
        initializer.expression &&
        ts.isObjectLiteralExpression(initializer.expression)
      ) {
        messageInfo.values = CommonASTUtils.extractObjectLiteralProperties(
          initializer.expression,
          sourceFile,
        );
      }
    }
    return messageInfo;
  }

  /** 剥离 namespace 前缀：`common:button.submit` → `button.submit` */
  private static stripNamespacePrefix(id: string): string {
    const colonIndex = id.indexOf(':');
    return colonIndex === -1 ? id : id.substring(colonIndex + 1);
  }

  private formatValuesMapping(values: Map<string, string>): string {
    return CommonASTUtils.formatValuesMapping(values);
  }

  private formatValuesMappingInline(values: Map<string, string>): string {
    return CommonASTUtils.formatValuesMapping(values, { wrap: false });
  }

  // i18next 单 `{` 本就是字面量（插值是双花括号 `{{name}}`），无需转义。
  escapeLiteralText(text: string): string {
    return text;
  }

  unescapeLiteralText(text: string): string {
    return text;
  }
}
