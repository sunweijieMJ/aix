import fs from 'fs';
import ts from 'typescript';
import { ASTUtils } from '../../utils/ast/ASTUtils';
import { HooksUtils } from '../../utils/hooks-utils';
import type { ExtractedString } from '../../utils/types';
import type { ITransformer } from '../../adapters/FrameworkAdapter';
import { ReactComponentInjector } from './ReactComponentInjector';
import { ReactImportManager } from './ReactImportManager';

/**
 * React 代码转换器
 * 负责将提取的文本替换为国际化调用
 */
export class ReactTransformer implements ITransformer {
  /**
   * 转换文件
   * @param filePath - 文件路径
   * @param extractedStrings - 提取的字符串数组
   * @param includeDefaultMessage - 是否包含defaultMessage
   * @returns 转换后的代码
   */
  transform(
    filePath: string,
    extractedStrings: ExtractedString[],
    includeDefaultMessage: boolean,
  ): string {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const fileStrings = extractedStrings.filter((s) => s.filePath === filePath);

    if (fileStrings.length === 0) {
      return sourceText;
    }

    // 替换字符串
    let transformedCode = this.replaceStrings(
      sourceText,
      fileStrings,
      includeDefaultMessage,
    );

    // 检查是否有jsx-text上下文的字符串，如果有，添加FormattedMessage导入
    const hasJsxText = fileStrings.some((s) => s.context === 'jsx-text');
    const importManager = new ReactImportManager();
    if (hasJsxText) {
      transformedCode = importManager.addI18nImports(transformedCode, [
        'FormattedMessage',
      ]);
    }

    // 添加全局 getIntl 导入和声明 (如果需要)
    transformedCode = importManager.handleGlobalImports(
      transformedCode,
      fileStrings,
    );

    // 注入 useIntl / injectIntl (如果需要)
    const componentInjector = new ReactComponentInjector();
    transformedCode = componentInjector.inject(transformedCode);

    // 为使用intl的hooks添加intl到依赖项
    transformedCode = HooksUtils.addIntlToHooksDependencies(transformedCode);

    return transformedCode;
  }

  /**
   * 替换字符串
   * @param sourceText - 源代码
   * @param fileStrings - 文件中的字符串数组
   * @param includeDefaultMessage - 是否包含defaultMessage
   * @returns 替换后的代码
   */
  private replaceStrings(
    sourceText: string,
    fileStrings: ExtractedString[],
    includeDefaultMessage: boolean,
  ): string {
    const filePath = fileStrings[0]!.filePath;
    const sourceFile = ASTUtils.parseSourceFile(sourceText, filePath);

    // 按位置倒序排列，从后往前替换以避免位置偏移
    const sortedStrings = fileStrings.sort((a, b) => {
      const aPos = ts.getPositionOfLineAndCharacter(
        sourceFile,
        a.line - 1,
        a.column - 1,
      );
      const bPos = ts.getPositionOfLineAndCharacter(
        sourceFile,
        b.line - 1,
        b.column - 1,
      );
      return bPos - aPos;
    });

    // 收集所有有效的替换操作
    const replacements: Array<{
      start: number;
      end: number;
      replacement: string;
    }> = [];

    for (const extracted of sortedStrings) {
      const position = ts.getPositionOfLineAndCharacter(
        sourceFile,
        extracted.line - 1,
        extracted.column - 1,
      );
      const node = ASTUtils.findExactStringNode(
        sourceFile,
        position,
        extracted.original,
      );

      if (node) {
        const replacement = this.generateReplacement(
          extracted,
          node,
          includeDefaultMessage,
        );

        // 对于JSX元素，我们需要替换其children部分
        if (ts.isJsxElement(node)) {
          const start = node.openingElement.getEnd();
          const end = node.closingElement.getStart();
          replacements.push({ start, end, replacement });
        } else {
          const start = node.getStart(sourceFile);
          const end = node.getEnd();

          // 获取原始的节点文本用于验证
          const originalNodeText = ASTUtils.nodeToText(node, sourceFile);

          // 使用shouldReplaceNode进行比较，而不是直接比较文本
          const isTemplateString =
            extracted.original.startsWith('`') &&
            extracted.original.endsWith('`');
          if (
            ASTUtils.shouldReplaceNode(
              originalNodeText,
              extracted.original,
              isTemplateString,
            )
          ) {
            replacements.push({ start, end, replacement });
          }
        }
      }
    }
    return ASTUtils.applyReplacements(sourceText, replacements);
  }

  /**
   * 根据提取的字符串信息，生成用于替换的i18n代码
   * @param extracted - 提取的字符串信息
   * @param node - 原始AST节点
   * @param includeDefaultMessage - 是否包含defaultMessage
   * @returns 生成的替换代码字符串
   */
  private generateReplacement(
    extracted: ExtractedString,
    node?: ts.Node,
    includeDefaultMessage: boolean = false,
  ): string {
    const { semanticId, context, isTemplateString, templateVariables } =
      extracted;

    // 对于jsx-text使用FormattedMessage组件
    if (context === 'jsx-text') {
      return this.generateFormattedMessageReplacement(
        extracted,
        includeDefaultMessage,
      );
    }

    // 对于jsx-attribute和js-code继续使用intl.formatMessage
    const formatMessageCall = 'intl.formatMessage';

    // React 只有 jsx-text, jsx-attribute, js-code 三种上下文
    const reactContext = context as 'jsx-text' | 'jsx-attribute' | 'js-code';
    const needsWrapper = node
      ? ASTUtils.needsJsxWrapper(node, reactContext)
      : context === 'jsx-attribute';

    let baseCall;

    if (isTemplateString && templateVariables && templateVariables.length > 0) {
      // 对于带变量的模板字符串
      const { message, placeholderMap } = ASTUtils.createMessageWithOptions(
        extracted.original,
        templateVariables,
      );
      const variablesMapping = this.generateVariablesMapping(placeholderMap);
      if (includeDefaultMessage) {
        const escapedMessage = JSON.stringify(message);
        baseCall = `${formatMessageCall}({ id: '${semanticId}', defaultMessage: ${escapedMessage} }, ${variablesMapping})`;
      } else {
        baseCall = `${formatMessageCall}({ id: '${semanticId}' }, ${variablesMapping})`;
      }
    } else {
      // 对于普通字符串或不带变量的模板字符串
      if (includeDefaultMessage) {
        const { message } = ASTUtils.createMessageWithOptions(
          extracted.original,
        );
        const escapedMessage = JSON.stringify(message);
        baseCall = `${formatMessageCall}({ id: '${semanticId}', defaultMessage: ${escapedMessage} })`;
      } else {
        baseCall = `${formatMessageCall}({ id: '${semanticId}' })`;
      }
    }

    // 根据上下文和是否需要包裹来决定返回格式
    if (needsWrapper) {
      return `{${baseCall}}`;
    }
    return baseCall;
  }

  /**
   * 生成FormattedMessage组件的替换代码
   * @param extracted - 提取的字符串信息
   * @param includeDefaultMessage - 是否包含defaultMessage
   * @returns FormattedMessage组件代码
   */
  private generateFormattedMessageReplacement(
    extracted: ExtractedString,
    includeDefaultMessage: boolean,
  ): string {
    const { semanticId, isTemplateString, templateVariables } = extracted;

    let props = `id="${semanticId}"`;

    if (includeDefaultMessage) {
      const { message } = ASTUtils.createMessageWithOptions(
        extracted.original,
        templateVariables,
      );
      const escapedMessage = JSON.stringify(message);
      props += ` defaultMessage=${escapedMessage}`;
    }

    if (isTemplateString && templateVariables && templateVariables.length > 0) {
      const { placeholderMap } = ASTUtils.createMessageWithOptions(
        extracted.original,
        templateVariables,
      );
      const variablesMapping = this.generateVariablesMapping(placeholderMap);
      props += ` values={${variablesMapping}}`;
    }

    return `<FormattedMessage ${props} />`;
  }

  /**
   * 为formatMessage的第二个参数（values）生成变量映射对象字符串
   * @param placeholderMap - 从表达式到占位符名称的映射 (e.g., Map { 'user.name' => 'name' })
   * @returns 格式化后的变量映射字符串 (e.g., "{ name: user.name }")
   */
  private generateVariablesMapping(
    placeholderMap: Map<string, string>,
  ): string {
    const mappings: string[] = [];
    placeholderMap.forEach((placeholder, expression) => {
      mappings.push(`${placeholder}: ${expression}`);
    });
    return `{ ${mappings.join(', ')} }`;
  }
}
