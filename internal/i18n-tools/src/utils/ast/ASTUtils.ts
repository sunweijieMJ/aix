import ts from 'typescript';
import { CommonASTUtils } from './CommonASTUtils';
import { ReactASTUtils } from './ReactASTUtils';

/**
 * AST工具类 - 主入口
 *
 * 统一的入口点，导出所有 AST 相关的工具方法。
 * 内部实现已拆分为：
 * - CommonASTUtils: 通用的 AST 工具（框架无关）
 * - ReactASTUtils: React 特定的 AST 工具
 */
export class ASTUtils {
  // ==================== 框架检测方法 ====================

  static isAlreadyInternationalized(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent) {
      if (ts.isCallExpression(parent)) {
        const expression = parent.expression;

        if (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.name) &&
          expression.name.text === 'formatMessage'
        ) {
          return true;
        }

        if (
          ts.isIdentifier(expression) &&
          expression.text === 'defineMessages'
        ) {
          return true;
        }

        if (
          ts.isIdentifier(expression) &&
          (expression.text === 't' || expression.text === '$t')
        ) {
          return true;
        }

        if (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.name) &&
          (expression.name.text === 't' || expression.name.text === '$t')
        ) {
          return true;
        }
      }

      if (ts.isJsxAttribute(parent)) {
        const jsxElement = parent.parent.parent;
        if (
          ts.isJsxOpeningElement(jsxElement) ||
          ts.isJsxSelfClosingElement(jsxElement)
        ) {
          if (
            ts.isIdentifier(jsxElement.tagName) &&
            (jsxElement.tagName.text === 'FormattedMessage' ||
              jsxElement.tagName.text === 'Trans')
          ) {
            return true;
          }
        }
      }
      if (ts.isJsxElement(parent)) {
        const openingElement = parent.openingElement;
        if (
          ts.isIdentifier(openingElement.tagName) &&
          (openingElement.tagName.text === 'FormattedMessage' ||
            openingElement.tagName.text === 'Trans')
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

  // ==================== 重新导出 CommonASTUtils 的方法 ====================

  static getStringLiteralValue = CommonASTUtils.getStringLiteralValue;
  static nodeToText = CommonASTUtils.nodeToText;
  static findNodeAtPosition = CommonASTUtils.findNodeAtPosition;
  static extractObjectLiteralProperties =
    CommonASTUtils.extractObjectLiteralProperties;
  static isInConsoleCall = CommonASTUtils.isInConsoleCall;
  static getScriptKind = CommonASTUtils.getScriptKind;
  static getVariableNameFromExpression =
    CommonASTUtils.getVariableNameFromExpression;
  static createStringOrTemplateNode = CommonASTUtils.createStringOrTemplateNode;
  static parseSourceFile = CommonASTUtils.parseSourceFile;
  static applyReplacements = CommonASTUtils.applyReplacements;
  static findExactStringNode = CommonASTUtils.findExactStringNode;
  static shouldReplaceNode = CommonASTUtils.shouldReplaceNode;

  // ==================== 重新导出 ReactASTUtils 的方法 ====================

  static getNodeContext = ReactASTUtils.getNodeContext;
  static needsJsxWrapper = ReactASTUtils.needsJsxWrapper;
  static createMessageWithOptions = ReactASTUtils.createMessageWithOptions;
  static getComponentType = ReactASTUtils.getComponentType;
  static isClassComponent = ReactASTUtils.isClassComponent;
  static isFunctionComponent = ReactASTUtils.isFunctionComponent;
  static isComponentName = ReactASTUtils.isComponentName;
  static getComponentInfo = ReactASTUtils.getComponentInfo;
  static isFormatMessageCall = ReactASTUtils.isFormatMessageCall;
  static extractFormatMessageInfo = ReactASTUtils.extractFormatMessageInfo;
  static extractFormattedMessageInfo =
    ReactASTUtils.extractFormattedMessageInfo;
}

export { CommonASTUtils, ReactASTUtils };
