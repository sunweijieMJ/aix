import fs from 'fs';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { ReactASTUtils } from './react-ast-utils';
import { HooksUtils } from './hooks-utils';
import type { ExtractedString } from '../../utils/types';
import type {
  IComponentInjector,
  IImportManager,
  ITransformer,
} from '../../adapters/FrameworkAdapter';
import type { ReactI18nLibrary } from './libraries';

/**
 * React 代码转换器
 * 负责将提取的文本替换为国际化调用
 *
 * library / importManager / componentInjector 由 ReactAdapter 注入，
 * includeDefaultMessage 通过构造选项传入，避免污染 ITransformer 抽象接口。
 */
export class ReactTransformer implements ITransformer {
  private library: ReactI18nLibrary;
  private importManager: IImportManager;
  private componentInjector: IComponentInjector;
  private includeDefaultMessage: boolean;

  constructor(
    library: ReactI18nLibrary,
    importManager: IImportManager,
    componentInjector: IComponentInjector,
    options: { includeDefaultMessage?: boolean } = {},
  ) {
    this.library = library;
    this.importManager = importManager;
    this.componentInjector = componentInjector;
    this.includeDefaultMessage = options.includeDefaultMessage ?? false;
  }

  /**
   * 转换文件
   */
  transform(filePath: string, extractedStrings: ExtractedString[], sourceText?: string): string {
    const text = sourceText ?? fs.readFileSync(filePath, 'utf-8');
    return this.transformText(filePath, extractedStrings, text);
  }

  private transformText(
    filePath: string,
    extractedStrings: ExtractedString[],
    sourceText: string,
  ): string {
    const fileStrings = extractedStrings.filter((s) => s.filePath === filePath);

    if (fileStrings.length === 0) {
      return sourceText;
    }

    // 替换字符串
    let transformedCode = this.replaceStrings(sourceText, fileStrings);

    // 检查是否有jsx-text上下文的字符串，如果有，添加 JSX 组件导入
    const hasJsxText = fileStrings.some((s) => s.context === 'jsx-text');
    if (hasJsxText) {
      transformedCode = this.importManager.addI18nImports(transformedCode, [
        this.library.jsxComponentName,
      ]);
    }

    // 添加全局函数导入和声明 (如果需要)
    transformedCode = this.importManager.handleGlobalImports(transformedCode, fileStrings);

    // 注入 Hook / HOC (如果需要)
    transformedCode = this.componentInjector.inject(transformedCode);

    // 为使用翻译变量的hooks添加到依赖项
    transformedCode = HooksUtils.addTranslationVarToHooksDependencies(
      transformedCode,
      this.library,
    );

    // 注入收尾：清理被注入的 useTranslation t 遮蔽后变成未使用的 tImport `t` 死导入
    // （必须在 inject 之后；遮蔽由注入产生）。Vue 端无此步——其 <script setup> 走模块
    // import 而非注入 hook，不产生同名遮蔽。
    if (this.importManager.finalizeImports) {
      transformedCode = this.importManager.finalizeImports(transformedCode, filePath);
    }

    return transformedCode;
  }

  /**
   * 替换字符串
   */
  private replaceStrings(sourceText: string, fileStrings: ExtractedString[]): string {
    const filePath = fileStrings[0]!.filePath;
    const sourceFile = CommonASTUtils.parseSourceFile(sourceText, filePath);

    // 按位置倒序排列，从后往前替换以避免位置偏移
    const sortedStrings = fileStrings.sort((a, b) => {
      const aPos = ts.getPositionOfLineAndCharacter(sourceFile, a.line - 1, a.column - 1);
      const bPos = ts.getPositionOfLineAndCharacter(sourceFile, b.line - 1, b.column - 1);
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
      const node = CommonASTUtils.findExactStringNode(sourceFile, position, extracted.original);

      if (node) {
        const replacement = this.generateReplacement(extracted, node);

        // 对于JSX元素，我们需要替换其children部分
        if (ts.isJsxElement(node)) {
          const start = node.openingElement.getEnd();
          const end = node.closingElement.getStart();
          replacements.push({ start, end, replacement });
        } else {
          const start = node.getStart(sourceFile);
          const end = node.getEnd();

          const originalNodeText = CommonASTUtils.nodeToText(node, sourceFile);
          const isTemplateString =
            extracted.original.startsWith('`') && extracted.original.endsWith('`');
          if (
            CommonASTUtils.shouldReplaceNode(originalNodeText, extracted.original, isTemplateString)
          ) {
            replacements.push({ start, end, replacement });
          }
        }
      }
    }
    return CommonASTUtils.applyReplacements(sourceText, replacements);
  }

  /**
   * 根据提取的字符串信息，生成用于替换的i18n代码
   */
  private generateReplacement(extracted: ExtractedString, node?: ts.Node): string {
    const { semanticId, context, isTemplateString, templateVariables } = extracted;
    const includeDefaultMessage = this.includeDefaultMessage;

    // 获取 defaultMessage 内容
    const { message, placeholderMap } = CommonASTUtils.createMessageWithOptions(
      extracted.original,
      templateVariables,
    );
    const defaultMsg = includeDefaultMessage ? message : undefined;

    // 构建 values Map
    const hasValues = isTemplateString && templateVariables && templateVariables.length > 0;
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
      ? ReactASTUtils.needsJsxWrapper(node, reactContext)
      : context === 'jsx-attribute';

    // 非组件（模块顶层）作用域用 i18next.t；与 ReactImportManager.needsGlobalFunction
    // 同样依据 componentType==='other'，保证「调用形态」与「注入的 import」一致。
    const isGlobalScope = extracted.componentType === 'other';
    const baseCall = this.library.generateFunctionCall(
      semanticId,
      valuesMap,
      includeDefaultMessage,
      defaultMsg,
      isGlobalScope,
    );

    if (needsWrapper) {
      return `{${baseCall}}`;
    }
    return baseCall;
  }
}
