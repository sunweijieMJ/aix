import ts from 'typescript';
import type { ReactI18nLibrary } from './types';

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
  readonly translationVarName = 't';
  readonly jsxComponentName = 'Trans';
  readonly jsxIdPropName = 'i18nKey';
  readonly hocName = 'withTranslation';
  readonly hocPropsType = 'WithTranslation';
  readonly globalFunctionName = 'i18next.t';

  private namespace?: string;

  constructor(options?: { namespace?: string }) {
    this.namespace = options?.namespace;
  }

  generateFunctionCall(
    id: string,
    values?: Map<string, string>,
    includeDefaultMessage?: boolean,
    defaultMessage?: string,
  ): string {
    const key = this.namespace ? `${this.namespace}:${id}` : id;

    if (values && values.size > 0) {
      const mapping = this.formatValuesMapping(values);
      if (includeDefaultMessage && defaultMessage) {
        const escaped = JSON.stringify(defaultMessage);
        return `t('${key}', { defaultValue: ${escaped}, ${this.formatValuesMappingInline(values)} })`;
      }
      return `t('${key}', ${mapping})`;
    }

    if (includeDefaultMessage && defaultMessage) {
      const escaped = JSON.stringify(defaultMessage);
      return `t('${key}', { defaultValue: ${escaped} })`;
    }

    return `t('${key}')`;
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
      const escaped = JSON.stringify(defaultMessage);
      props += ` defaults=${escaped}`;
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
    // t('key') 或 i18next.t('key')
    if (ts.isIdentifier(node.expression) && node.expression.text === 't') {
      return true;
    }
    if (
      ts.isPropertyAccessExpression(node.expression) &&
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
      return (
        ts.isIdentifier(expression) && expression.text === 'useTranslation'
      );
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
        if (
          ts.isIdentifier(child.expression) &&
          child.expression.text === 't'
        ) {
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

  isTranslationAvailableInScope(
    node: ts.Node,
    sourceFile: ts.SourceFile,
  ): boolean {
    const text = node.getText(sourceFile);
    return (
      /const\s+\{\s*t\s*[,}]/.test(text) && text.includes('useTranslation')
    );
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
          (ts.isJsxOpeningElement(jsxElement) ||
            ts.isJsxSelfClosingElement(jsxElement)) &&
          ts.isIdentifier(jsxElement.tagName) &&
          jsxElement.tagName.text === 'Trans'
        ) {
          return true;
        }
      }
      if (ts.isJsxElement(parent)) {
        const openingElement = parent.openingElement;
        if (
          ts.isIdentifier(openingElement.tagName) &&
          openingElement.tagName.text === 'Trans'
        ) {
          return true;
        }
      }
      if (
        ts.isBlock(parent) ||
        ts.isFunctionLike(parent) ||
        ts.isClassLike(parent)
      ) {
        return false;
      }
      parent = parent.parent;
    }
    return false;
  }

  private formatValuesMapping(values: Map<string, string>): string {
    const mappings: string[] = [];
    values.forEach((placeholder, expression) => {
      mappings.push(`${placeholder}: ${expression}`);
    });
    return `{ ${mappings.join(', ')} }`;
  }

  private formatValuesMappingInline(values: Map<string, string>): string {
    const mappings: string[] = [];
    values.forEach((placeholder, expression) => {
      mappings.push(`${placeholder}: ${expression}`);
    });
    return mappings.join(', ');
  }
}
