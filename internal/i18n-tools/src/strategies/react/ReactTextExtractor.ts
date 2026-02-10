import fs from 'fs';
import ts from 'typescript';
import { ASTUtils } from '../../utils/ast/ASTUtils';
import { FileUtils } from '../../utils/file-utils';
import type { ExtractedString, MessageInfo } from '../../utils/types';
import type { ITextExtractor } from '../../adapters/FrameworkAdapter';
import type { ReactI18nLibrary } from './libraries';

/**
 * React 文本提取器
 * 负责从 React 文件中提取需要国际化的文本
 */
export class ReactTextExtractor implements ITextExtractor {
  private library?: ReactI18nLibrary;

  constructor(library?: ReactI18nLibrary) {
    this.library = library;
  }
  /**
   * 从单个文件中提取字符串
   * @param filePath - 文件路径
   * @returns 提取的字符串数组
   */
  async extractFromFile(filePath: string): Promise<ExtractedString[]> {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const scriptKind = ASTUtils.getScriptKind(filePath);
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const extractedStrings: ExtractedString[] = [];
    await this.visitNode(sourceFile, sourceFile, extractedStrings);
    return extractedStrings.filter((s) => s.filePath === filePath);
  }

  /**
   * 从多个文件中提取字符串
   * @param filePaths - 文件路径数组
   * @returns 提取的字符串数组
   */
  async extractFromFiles(filePaths: string[]): Promise<ExtractedString[]> {
    const allExtractedStrings: ExtractedString[] = [];

    for (const filePath of filePaths) {
      const extracted = await this.extractFromFile(filePath);
      allExtractedStrings.push(...extracted);
    }

    return allExtractedStrings;
  }

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
    if (
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== 'defineMessages'
    ) {
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
          const messageProps = ASTUtils.extractObjectLiteralProperties(
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
        : ASTUtils.isAlreadyInternationalized(node);
      if (alreadyI18n) {
        return false;
      }
      // 如果字符串在console调用中，不提取
      if (ASTUtils.isInConsoleCall(node)) {
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
        const componentType = ASTUtils.getComponentType(node);
        const position = ts.getLineAndCharacterOfPosition(
          sourceFile,
          node.getStart(sourceFile),
        );

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
            mixedContent.templateVariables.length > 0
              ? mixedContent.templateVariables
              : undefined,
        });
        // 处理了混合内容后，跳过子节点的单独处理
        return;
      }
    }

    let text = '';
    let isTemplateString = false;
    const templateVariables: string[] = [];

    // 处理字符串字面量
    if (ts.isStringLiteral(node)) {
      text = node.text;
    }
    // 处理模板字符串
    else if (ts.isTemplateExpression(node)) {
      // 首先检查是否有中文文本片段
      const chineseTextParts: string[] = [];

      // 检查头部文本
      if (node.head.text && FileUtils.containsChinese(node.head.text)) {
        chineseTextParts.push(node.head.text);
      }

      // 检查各个span的文本部分
      for (const span of node.templateSpans) {
        if (span.literal.text && FileUtils.containsChinese(span.literal.text)) {
          chineseTextParts.push(span.literal.text);
        }
      }

      // 如果有中文片段，则处理整个模板字符串
      if (chineseTextParts.length > 0) {
        isTemplateString = true;
        text = '`' + node.head.text;

        for (const span of node.templateSpans) {
          const expressionText = ASTUtils.nodeToText(
            span.expression,
            sourceFile,
          );
          templateVariables.push(expressionText);
          text += '${' + expressionText + '}' + span.literal.text;
        }
        text += '`';
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
    if (text && this.shouldExtract(text, ASTUtils.getNodeContext(node), node)) {
      const componentType = ASTUtils.getComponentType(node);
      const context = ASTUtils.getNodeContext(node);
      const position = ts.getLineAndCharacterOfPosition(
        sourceFile,
        node.getStart(sourceFile),
      );

      extractedStrings.push({
        original: text,
        semanticId: '', // 稍后生成
        filePath: sourceFile.fileName,
        line: position.line + 1,
        column: position.character + 1,
        context,
        componentType,
        isTemplateString,
        templateVariables:
          templateVariables.length > 0 ? templateVariables : undefined,
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
        const expressionText = ASTUtils.nodeToText(
          child.expression!,
          sourceFile,
        );
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
