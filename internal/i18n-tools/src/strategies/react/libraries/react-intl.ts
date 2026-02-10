import ts from 'typescript';
import type { ReactI18nLibrary } from './types';

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
      const escaped = JSON.stringify(defaultMessage);
      props += ` defaultMessage=${escaped}`;
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
    if (ts.isPropertyAccessExpression(node.expression)) {
      const propName = node.expression.name;
      if (ts.isIdentifier(propName) && propName.text === 'formatMessage') {
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

  isTranslationAvailableInScope(
    node: ts.Node,
    sourceFile: ts.SourceFile,
  ): boolean {
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
        if (
          ts.isIdentifier(expression) &&
          expression.text === 'defineMessages'
        ) {
          return true;
        }
      }
      // <FormattedMessage id={...} />
      if (ts.isJsxAttribute(parent)) {
        const jsxElement = parent.parent.parent;
        if (
          (ts.isJsxOpeningElement(jsxElement) ||
            ts.isJsxSelfClosingElement(jsxElement)) &&
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
}
