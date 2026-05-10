import fs from 'fs';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { ReactASTUtils } from './react-ast-utils';
import { FileUtils } from '../../utils/file-utils';
import type { ExtractedString, MessageInfo } from '../../utils/types';
import { BaseTextExtractor } from '../base';
import type { ReactI18nLibrary } from './libraries';

/**
 * React 文本提取器
 * 负责从 React 文件中提取需要国际化的文本
 */
export class ReactTextExtractor extends BaseTextExtractor {
  private library?: ReactI18nLibrary;

  constructor(library?: ReactI18nLibrary) {
    super();
    this.library = library;
  }
  /**
   * 从单个文件中提取字符串
   * @param filePath - 文件路径
   * @returns 提取的字符串数组
   */
  async extractFromFile(filePath: string): Promise<ExtractedString[]> {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = CommonASTUtils.parseSourceFile(sourceText, filePath);

    const extractedStrings: ExtractedString[] = [];
    await this.visitNode(sourceFile, sourceFile, extractedStrings);
    return extractedStrings.filter((s) => s.filePath === filePath);
  }

  // extractFromFiles 由 BaseTextExtractor 提供默认串行实现

  /**
   * 提取defineMessages中的消息定义
   * @param node - 调用表达式节点
   * @param definedMessages - 定义的消息映射
   * @param sourceFile - 源文件
   */
  static extractDefineMessages(
    node: ts.CallExpression,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): void {
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'defineMessages') {
      return;
    }

    const arg = node.arguments[0]!;
    if (!ts.isObjectLiteralExpression(arg)) {
      return;
    }

    for (const property of arg.properties) {
      if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
        const messageKey = property.name.text;

        if (ts.isObjectLiteralExpression(property.initializer)) {
          const messageProps = CommonASTUtils.extractObjectLiteralProperties(
            property.initializer,
            sourceFile,
          );
          const messageInfo: MessageInfo = {
            id: messageProps.id,
            defaultMessage: messageProps.defaultMessage,
          };

          definedMessages.set(messageKey, messageInfo);
        }
      }
    }
  }

  /**
   * 判断字符串是否应该被提取进行国际化
   * @param str - 待检查的字符串
   * @param context - 上下文信息
   * @param node - AST节点，用于检查上下文环境
   * @returns 是否应该提取
   */
  private shouldExtract(
    str: string,
    context?: 'jsx-text' | 'jsx-attribute' | 'js-code',
    node?: ts.Node,
  ): boolean {
    // 基本过滤条件
    if (!str.trim()) return false;

    if (node) {
      // 如果节点已经被国际化结构包裹，则不提取
      const alreadyI18n = this.library
        ? this.library.isAlreadyInternationalized(node)
        : CommonASTUtils.isAlreadyInternationalized(node);
      if (alreadyI18n) {
        return false;
      }
      // 如果字符串在console调用中，不提取
      if (CommonASTUtils.isInConsoleCall(node)) {
        return false;
      }
    }

    // 如果字符串包含中文，则提取
    if (FileUtils.containsChinese(str)) {
      return true;
    }

    // 英文字符串的判断逻辑
    if (/[a-zA-Z]/.test(str)) {
      // 如果是JSX文本，直接提取
      if (context === 'jsx-text') {
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * 访问AST节点
   * @param node - AST节点
   * @param sourceFile - 源文件
   */
  private async visitNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    extractedStrings: ExtractedString[],
  ): Promise<void> {
    // 优先处理JSX元素的混合内容
    if (ts.isJsxElement(node)) {
      const mixedContent = this.extractJsxMixedContent(node, sourceFile);
      if (mixedContent) {
        const componentType = ReactASTUtils.getComponentType(node);
        const position = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));

        extractedStrings.push({
          original: mixedContent.text,
          semanticId: '', // 稍后生成
          filePath: sourceFile.fileName,
          line: position.line + 1,
          column: position.character + 1,
          context: 'jsx-text',
          componentType,
          isTemplateString: mixedContent.isTemplateString,
          templateVariables:
            mixedContent.templateVariables.length > 0 ? mixedContent.templateVariables : undefined,
        });
        // 处理了混合内容后，跳过子节点的单独处理
        return;
      }
    }

    let text = '';
    let processedMessage: string | undefined;
    let isTemplateString = false;
    const templateVariables: string[] = [];

    // 处理字符串字面量
    if (ts.isStringLiteral(node)) {
      // 跳过对象属性 key、模块导入路径、比较运算符/case 操作数
      if (CommonASTUtils.isExtractableStringLiteral(node)) {
        text = node.text;
      }
    }
    // 处理模板字符串：复用 CommonASTUtils.processTemplateExpression，
    // 该方法会把字面量插值（'literal'/123/true 等）内联进文本，
    // 仅保留真正的变量表达式作为占位符——与 Vue 端对齐，避免
    // `${'literal'}` 被误当作占位符变量。
    //
    // 重要：text 必须保留源代码形式的 ${...} 占位符，因为后续 ReactTransformer
    // 通过 extracted.original 在源代码中匹配并替换；processedMessage 走 ID
    // 生成与 locale 写入路径，承载字面量内联后的真实文案。
    else if (ts.isTemplateExpression(node)) {
      if (CommonASTUtils.templateLiteralsContainChinese(node)) {
        const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
        text = result.originalText;
        if (result.processedText !== result.originalText) {
          processedMessage = result.processedText;
        }
        templateVariables.push(...result.templateVariables);
        isTemplateString = true;
      }
    }
    // 处理无替换模板字符串
    else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      text = node.text;
    }
    // 处理JSX文本
    else if (ts.isJsxText(node)) {
      text = node.text.trim();
    }

    // 检查是否需要提取
    if (text && this.shouldExtract(text, ReactASTUtils.getNodeContext(node), node)) {
      const componentType = ReactASTUtils.getComponentType(node);
      const context = ReactASTUtils.getNodeContext(node);
      const position = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));

      extractedStrings.push({
        original: text,
        processedMessage,
        semanticId: '', // 稍后生成
        filePath: sourceFile.fileName,
        line: position.line + 1,
        column: position.character + 1,
        context,
        componentType,
        isTemplateString,
        templateVariables: templateVariables.length > 0 ? templateVariables : undefined,
      });
      // 提取成功后，不再需要深入访问该节点的子节点
      return;
    }

    // 递归处理子节点 - 修复异步问题
    const children = node.getChildren();
    for (const child of children) {
      await this.visitNode(child, sourceFile, extractedStrings);
    }
  }

  /**
   * 提取JSX元素的混合内容（文本+表达式）
   * @param node - JSX元素节点
   * @param sourceFile - 源文件
   * @returns 混合内容信息，如果不包含中文则返回null
   */
  private extractJsxMixedContent(
    node: ts.JsxElement,
    sourceFile: ts.SourceFile,
  ): {
    text: string;
    isTemplateString: boolean;
    templateVariables: string[];
  } | null {
    const children = node.children;
    if (!children || children.length === 0) {
      return null;
    }

    // 检查是否包含中文文本和表达式的混合内容
    let hasChineseText = false;
    let hasExpression = false;

    for (const child of children) {
      if (ts.isJsxText(child)) {
        const text = child.text.trim();
        if (text && FileUtils.containsChinese(text)) {
          hasChineseText = true;
        }
      } else if (ts.isJsxExpression(child) && child.expression) {
        hasExpression = true;
      }
    }

    // 只有当包含中文文本且有表达式时，才进行混合内容处理
    if (!hasChineseText || !hasExpression) {
      return null;
    }

    // 构建模板字符串格式的文本（使用${expression}格式）
    let templateText = '`';
    const templateVariables: string[] = [];

    for (const child of children) {
      if (ts.isJsxText(child)) {
        const text = child.text.trim();
        if (text) {
          templateText += text;
        }
      } else if (ts.isJsxExpression(child) && child.expression) {
        const expressionText = CommonASTUtils.nodeToText(child.expression!, sourceFile);
        templateVariables.push(expressionText);
        templateText += `\${${expressionText}}`;
      }
    }

    templateText += '`';

    return {
      text: templateText,
      isTemplateString: true,
      templateVariables,
    };
  }
}
