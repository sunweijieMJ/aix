import fs from 'fs';
import ts from 'typescript';
import { ASTUtils } from '../../utils/ast/ASTUtils';
import { HooksUtils } from '../../utils/hooks-utils';
import type { ExtractedString } from '../../utils/types';
import type { ITransformer } from '../../adapters/FrameworkAdapter';
import { ReactComponentInjector } from './ReactComponentInjector';
import { ReactImportManager } from './ReactImportManager';
import type { ReactI18nLibrary } from './libraries';

/**
 * React 代码转换器
 * 负责将提取的文本替换为国际化调用
 */
export class ReactTransformer implements ITransformer {
  private tImport: string;
  private library: ReactI18nLibrary;

  constructor(tImport: string = '@/plugins/locale', library: ReactI18nLibrary) {
    this.tImport = tImport;
    this.library = library;
  }

  /**
   * 转换文件
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

    // 检查是否有jsx-text上下文的字符串，如果有，添加 JSX 组件导入
    const hasJsxText = fileStrings.some((s) => s.context === 'jsx-text');
    const importManager = new ReactImportManager(this.tImport, this.library);
    if (hasJsxText) {
      transformedCode = importManager.addI18nImports(transformedCode, [
        this.library.jsxComponentName,
      ]);
    }

    // 添加全局函数导入和声明 (如果需要)
    transformedCode = importManager.handleGlobalImports(
      transformedCode,
      fileStrings,
    );

    // 注入 Hook / HOC (如果需要)
    const componentInjector = new ReactComponentInjector(
      this.tImport,
      this.library,
    );
    transformedCode = componentInjector.inject(transformedCode);

    // 为使用翻译变量的hooks添加到依赖项
    transformedCode = HooksUtils.addTranslationVarToHooksDependencies(
      transformedCode,
      this.library,
    );

    return transformedCode;
  }

  /**
   * 替换字符串
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

          const originalNodeText = ASTUtils.nodeToText(node, sourceFile);
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
   */
  private generateReplacement(
    extracted: ExtractedString,
    node?: ts.Node,
    includeDefaultMessage: boolean = false,
  ): string {
    const { semanticId, context, isTemplateString, templateVariables } =
      extracted;

    // 获取 defaultMessage 内容
    const { message, placeholderMap } = ASTUtils.createMessageWithOptions(
      extracted.original,
      templateVariables,
    );
    const defaultMsg = includeDefaultMessage ? message : undefined;

    // 构建 values Map
    const hasValues =
      isTemplateString && templateVariables && templateVariables.length > 0;
    const valuesMap = hasValues ? placeholderMap : undefined;

    // 对于jsx-text使用JSX组件
    if (context === 'jsx-text') {
      return this.library.generateJSXComponent(
        semanticId,
        valuesMap,
        includeDefaultMessage,
        defaultMsg,
      );
    }

    // 对于jsx-attribute和js-code使用函数调用
    const reactContext = context as 'jsx-text' | 'jsx-attribute' | 'js-code';
    const needsWrapper = node
      ? ASTUtils.needsJsxWrapper(node, reactContext)
      : context === 'jsx-attribute';

    const baseCall = this.library.generateFunctionCall(
      semanticId,
      valuesMap,
      includeDefaultMessage,
      defaultMsg,
    );

    if (needsWrapper) {
      return `{${baseCall}}`;
    }
    return baseCall;
  }
}
