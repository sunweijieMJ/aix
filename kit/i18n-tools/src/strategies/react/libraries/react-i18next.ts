import ts from 'typescript';
import type { ReactI18nLibrary } from './types';
import type { MessageInfo } from '../../../utils/types';
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
        const escaped = JSON.stringify(defaultMessage);
        return `${fn}('${key}', { defaultValue: ${escaped}, ${this.formatValuesMappingInline(values)} })`;
      }
      return `${fn}('${key}', ${mapping})`;
    }

    if (includeDefaultMessage && defaultMessage) {
      const escaped = JSON.stringify(defaultMessage);
      return `${fn}('${key}', { defaultValue: ${escaped} })`;
    }

    return `${fn}('${key}')`;
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
      const escaped = JSON.stringify(defaultMessage);
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
    let uses = false;
    const visitor = (child: ts.Node) => {
      if (ts.isCallExpression(child)) {
        // t('key')
        if (ts.isIdentifier(child.expression) && child.expression.text === 't') {
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
    return /const\s+\{\s*t\s*[,}]/.test(text) && text.includes('useTranslation');
  }

  isAlreadyInternationalized(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent) {
      if (ts.isCallExpression(parent)) {
        const expression = parent.expression;
        // t('key')
        if (ts.isIdentifier(expression) && expression.text === 't') {
          return true;
        }
        // i18next.t('key')
        if (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.name) &&
          expression.name.text === 't'
        ) {
          return true;
        }
      }
      // <Trans i18nKey={...} />
      if (ts.isJsxAttribute(parent)) {
        const jsxElement = parent.parent.parent;
        if (
          (ts.isJsxOpeningElement(jsxElement) || ts.isJsxSelfClosingElement(jsxElement)) &&
          ts.isIdentifier(jsxElement.tagName) &&
          jsxElement.tagName.text === 'Trans'
        ) {
          return true;
        }
      }
      if (ts.isJsxElement(parent)) {
        const openingElement = parent.openingElement;
        if (ts.isIdentifier(openingElement.tagName) && openingElement.tagName.text === 'Trans') {
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
