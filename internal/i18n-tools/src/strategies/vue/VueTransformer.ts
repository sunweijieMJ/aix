import fs from 'fs';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import { CommonASTUtils } from '../../utils/ast/CommonASTUtils';
import { ReactASTUtils } from '../../utils/ast/ReactASTUtils';
import type { ExtractedString } from '../../utils/types';
import type { ITransformer } from '../../adapters/FrameworkAdapter';
import { VueImportManager } from './VueImportManager';
import { VueComponentInjector } from './VueComponentInjector';
import type { VueI18nLibrary } from './libraries';

/**
 * Vue 代码转换器
 * 负责将提取的文本替换为 i18n 调用
 */
export class VueTransformer implements ITransformer {
  private tImport: string;
  private library?: VueI18nLibrary;

  constructor(tImport: string = '@/plugins/locale', library?: VueI18nLibrary) {
    this.tImport = tImport;
    this.library = library;
  }

  /**
   * 转换文件
   * @param filePath - 文件路径
   * @param extractedStrings - 提取的字符串数组
   * @returns 转换后的代码
   */
  transform(filePath: string, extractedStrings: ExtractedString[]): string {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const fileStrings = extractedStrings.filter((s) => s.filePath === filePath);

    if (fileStrings.length === 0) {
      return sourceText;
    }

    const ext = filePath.split('.').pop()?.toLowerCase();
    let transformedCode = sourceText;

    // 处理 .vue 文件
    if (ext === 'vue') {
      const { descriptor } = parseSFC(sourceText, { filename: filePath });

      // 收集所有需要替换的部分（从后往前，这样offset不会受影响）
      const replacements: Array<{
        start: number;
        end: number;
        content: string;
      }> = [];

      // 处理 script 部分（先处理，因为在文件后面）
      const script = descriptor.scriptSetup || descriptor.script;
      if (script) {
        const scriptStrings = fileStrings.filter((s) => s.context === 'script');
        if (scriptStrings.length > 0) {
          const transformedScript = this.processScript(
            script.content,
            script.loc.start.line - 1,
            scriptStrings,
          );
          replacements.push({
            start: script.loc.start.offset,
            end: script.loc.end.offset,
            content: transformedScript,
          });
        }
      }

      // 处理 template 部分（后处理，但先替换）
      if (descriptor.template) {
        const templateStrings = fileStrings.filter(
          (s) => s.context === 'template',
        );
        if (templateStrings.length > 0) {
          const transformedTemplate = this.processTemplate(
            descriptor.template.content,
            descriptor.template.loc.start.line - 1,
            templateStrings,
          );
          replacements.push({
            start: descriptor.template.loc.start.offset,
            end: descriptor.template.loc.end.offset,
            content: transformedTemplate,
          });
        }
      }

      // 从后往前应用替换（这样offset不会受影响）
      replacements.sort((a, b) => b.start - a.start); // 按起始位置倒序

      for (const replacement of replacements) {
        transformedCode =
          transformedCode.substring(0, replacement.start) +
          replacement.content +
          transformedCode.substring(replacement.end);
      }
    }
    // 处理纯 .ts 或 .js 文件
    else if (ext === 'ts' || ext === 'js') {
      const scriptStrings = fileStrings.filter((s) => s.context === 'script');
      if (scriptStrings.length > 0) {
        transformedCode = this.processScript(
          sourceText,
          0, // 没有 template，从第 0 行开始
          scriptStrings,
        );
      }
    }

    // 添加必要的导入和声明
    const importManager = new VueImportManager(this.tImport, this.library);
    transformedCode = importManager.handleGlobalImports(
      transformedCode,
      fileStrings,
      filePath,
    );

    // 只对 .vue 文件注入 Hook
    if (ext === 'vue') {
      const componentInjector = new VueComponentInjector(this.library);
      transformedCode = componentInjector.inject(transformedCode);
    }

    return transformedCode;
  }

  /**
   * 处理 template 内容
   * @param templateContent - template 内容
   * @param lineOffset - template 起始行偏移
   * @param strings - template 中的字符串数组
   * @returns 转换后的 template 内容
   */
  private processTemplate(
    templateContent: string,
    lineOffset: number,
    strings: ExtractedString[],
  ): string {
    // 按位置倒序排列，从后往前替换
    const sortedStrings = strings.sort((a, b) => {
      const aLine = a.line - lineOffset - 1;
      const bLine = b.line - lineOffset - 1;
      if (aLine !== bLine) return bLine - aLine;
      return b.column - a.column;
    });

    let transformedTemplate = templateContent;

    for (const extracted of sortedStrings) {
      const replacement = this.generateTemplateReplacement(extracted);
      const localLine = extracted.line - lineOffset - 1;
      const localColumn = extracted.column;

      // 在 template 内容中查找并替换
      transformedTemplate = this.replaceInTemplate(
        transformedTemplate,
        extracted.original,
        replacement,
        localLine,
        localColumn,
      );
    }

    // 返回转换后的 template 内容
    return transformedTemplate;
  }

  /**
   * 在 template 中替换字符串
   * @param templateContent - template 内容
   * @param original - 原始字符串
   * @param replacement - 替换字符串
   * @param line - 行号（template 内的相对行号）
   * @param column - 列号
   * @returns 替换后的 template 内容
   */
  private replaceInTemplate(
    templateContent: string,
    original: string,
    replacement: string,
    line: number,
    column: number,
  ): string {
    const lines = templateContent.split('\n');

    if (line < 0 || line >= lines.length) {
      return templateContent;
    }

    const targetLine = lines[line]!;

    // 检查是否是静态属性转换（replacement 以 : 开头）
    if (replacement.startsWith(':')) {
      // 静态属性转换：需要替换整个属性 attr="value" -> :attr="$t(...)"
      // 查找属性模式：attrName="original"
      // 使用 [\\w-]+ 来匹配包含连字符的属性名（如 confirm-button-text）
      const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const attrPattern = new RegExp(`([\\w-]+)=["']${escapedOriginal}["']`);
      const match = targetLine.match(attrPattern);

      if (match) {
        const fullAttrText = match[0]; // 例如：title="测试" 或 confirm-button-text="确定"
        lines[line] = targetLine.replace(fullAttrText, replacement);
        return lines.join('\n');
      }
    }

    // 检查 original 是否已经带引号（模板字符串、字符串字面量）
    const hasQuotes =
      (original.startsWith("'") && original.endsWith("'")) ||
      (original.startsWith('"') && original.endsWith('"')) ||
      (original.startsWith('`') && original.endsWith('`'));

    let index: number;

    if (hasQuotes) {
      // 如果 original 已经带引号（如模板字符串 `text` 或已转义的字符串），直接查找
      index = targetLine.indexOf(original, column);
      if (index !== -1) {
        lines[line] =
          targetLine.substring(0, index) +
          replacement +
          targetLine.substring(index + original.length);
        return lines.join('\n');
      }
    } else {
      // original 不带引号，需要在外面加引号查找（处理三元运算符场景）
      // 优先查找单引号版本
      const singleQuotePattern = `'${original}'`;
      index = targetLine.indexOf(singleQuotePattern, column);
      if (index !== -1) {
        // 在引号内的字符串（三元运算符内），替换整个 'text' 为 $t(...)
        // 注意：replacement 已经是 $t(...) 格式，不包含外层引号
        lines[line] =
          targetLine.substring(0, index) +
          replacement +
          targetLine.substring(index + singleQuotePattern.length);
        return lines.join('\n');
      }

      // 查找双引号版本
      const doubleQuotePattern = `"${original}"`;
      index = targetLine.indexOf(doubleQuotePattern, column);
      if (index !== -1) {
        lines[line] =
          targetLine.substring(0, index) +
          replacement +
          targetLine.substring(index + doubleQuotePattern.length);
        return lines.join('\n');
      }

      // 查找反引号版本（处理无变量模板字符串场景）
      const backtickPattern = `\`${original}\``;
      index = targetLine.indexOf(backtickPattern, column);
      if (index !== -1) {
        lines[line] =
          targetLine.substring(0, index) +
          replacement +
          targetLine.substring(index + backtickPattern.length);
        return lines.join('\n');
      }

      // 如果没有找到带引号的版本，查找原始字符串（处理文本节点场景）
      index = targetLine.indexOf(original);
      if (index !== -1) {
        lines[line] =
          targetLine.substring(0, index) +
          replacement +
          targetLine.substring(index + original.length);
        return lines.join('\n');
      }
    }

    // Fallback: 在附近行搜索（处理多行文本节点和跨行插值表达式）
    for (let delta = 1; delta <= 5; delta++) {
      for (const tryIdx of [line + delta, line - delta]) {
        if (tryIdx < 0 || tryIdx >= lines.length) continue;
        const result = this.tryReplaceOnLine(
          lines[tryIdx]!,
          original,
          replacement,
        );
        if (result !== null) {
          lines[tryIdx] = result;
          return lines.join('\n');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 在单行中尝试替换文本（用于 fallback 搜索附近行）
   * @param lineContent - 行内容
   * @param original - 原始字符串
   * @param replacement - 替换字符串
   * @returns 替换后的行内容，如果未找到匹配则返回 null
   */
  private tryReplaceOnLine(
    lineContent: string,
    original: string,
    replacement: string,
  ): string | null {
    // 静态属性转换
    if (replacement.startsWith(':')) {
      const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const attrPattern = new RegExp(`([\\w-]+)=["']${escapedOriginal}["']`);
      const match = lineContent.match(attrPattern);
      if (match) {
        return lineContent.replace(match[0], replacement);
      }
    }

    const hasQuotes =
      (original.startsWith("'") && original.endsWith("'")) ||
      (original.startsWith('"') && original.endsWith('"')) ||
      (original.startsWith('`') && original.endsWith('`'));

    if (hasQuotes) {
      const index = lineContent.indexOf(original);
      if (index !== -1) {
        return (
          lineContent.substring(0, index) +
          replacement +
          lineContent.substring(index + original.length)
        );
      }
      return null;
    }

    // 尝试各种引号包裹
    for (const quote of ["'", '"', '`']) {
      const quoted = `${quote}${original}${quote}`;
      const index = lineContent.indexOf(quoted);
      if (index !== -1) {
        return (
          lineContent.substring(0, index) +
          replacement +
          lineContent.substring(index + quoted.length)
        );
      }
    }

    // 尝试裸文本
    const index = lineContent.indexOf(original);
    if (index !== -1) {
      return (
        lineContent.substring(0, index) +
        replacement +
        lineContent.substring(index + original.length)
      );
    }

    return null;
  }

  /**
   * 生成 template 替换内容
   * @param extracted - 提取的字符串信息
   * @returns 替换字符串
   */
  private generateTemplateReplacement(extracted: ExtractedString): string {
    const {
      isTemplateString,
      templateVariables,
      templateContext,
      attributeName,
    } = extracted;

    // template 中 $t() 是全局函数，vue-i18next 需要 namespace:key 前缀
    const ns = this.library?.namespace;
    const semanticId = ns
      ? `${ns}:${extracted.semanticId}`
      : extracted.semanticId;

    // 过滤掉字面量，只保留真正的变量表达式
    const actualVariables = templateVariables
      ? this.filterLiterals(templateVariables)
      : undefined;

    // 处理模板字符串（带变量插值）
    if (isTemplateString && actualVariables && actualVariables.length > 0) {
      const { placeholderMap } = ReactASTUtils.createMessageWithOptions(
        extracted.original,
        actualVariables,
      );
      const variablesMapping = this.generateVariablesMapping(placeholderMap);

      // 根据上下文生成不同格式
      switch (templateContext) {
        case 'static-attribute':
          // 静态属性转动态绑定：title="文本" -> :title="$t('...')"
          return `:${attributeName}="$t('${semanticId}', ${variablesMapping})"`;
        case 'interpolation':
        case 'dynamic-attribute':
          // 插值表达式和动态属性中：不需要额外的 {{ }}（已在表达式上下文中）
          return `$t('${semanticId}', ${variablesMapping})`;
        case 'text-node':
        default:
          // 文本节点：使用 {{ }} 包裹
          return `{{ $t('${semanticId}', ${variablesMapping}) }}`;
      }
    } else {
      // 处理普通字符串
      switch (templateContext) {
        case 'static-attribute':
          // 静态属性转动态绑定：title="文本" -> :title="$t('...')"
          return `:${attributeName}="$t('${semanticId}')"`;
        case 'interpolation':
        case 'dynamic-attribute':
          // 插值表达式和动态属性中：不需要额外的 {{ }}（已在表达式上下文中）
          return `$t('${semanticId}')`;
        case 'text-node':
        default:
          // 文本节点：使用 {{ }} 包裹
          return `{{ $t('${semanticId}') }}`;
      }
    }
  }

  /**
   * 处理 script 内容
   * @param scriptContent - script 内容
   * @param lineOffset - script 起始行偏移
   * @param strings - script 中的字符串数组
   * @returns 转换后的 script 内容
   */
  private processScript(
    scriptContent: string,
    lineOffset: number,
    strings: ExtractedString[],
  ): string {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      scriptContent,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    // 按位置倒序排列，从后往前替换
    const sortedStrings = strings.sort((a, b) => {
      const aLine = a.line - lineOffset - 1;
      const bLine = b.line - lineOffset - 1;
      const aPos = ts.getPositionOfLineAndCharacter(
        sourceFile,
        aLine,
        a.column - 1,
      );
      const bPos = ts.getPositionOfLineAndCharacter(
        sourceFile,
        bLine,
        b.column - 1,
      );
      return bPos - aPos;
    });

    const replacements: Array<{
      start: number;
      end: number;
      replacement: string;
    }> = [];

    for (const extracted of sortedStrings) {
      const localLine = extracted.line - lineOffset - 1;
      const localColumn = extracted.column - 1;
      const position = ts.getPositionOfLineAndCharacter(
        sourceFile,
        localLine,
        localColumn,
      );
      const node = CommonASTUtils.findExactStringNode(
        sourceFile,
        position,
        extracted.original,
      );

      if (node) {
        const replacement = this.generateScriptReplacement(extracted);
        const start = node.getStart(sourceFile);
        const end = node.getEnd();

        // 验证节点文本
        const originalNodeText = CommonASTUtils.nodeToText(node, sourceFile);
        const isTemplateString =
          extracted.original.startsWith('`') &&
          extracted.original.endsWith('`');

        if (
          CommonASTUtils.shouldReplaceNode(
            originalNodeText,
            extracted.original,
            isTemplateString,
          )
        ) {
          replacements.push({ start, end, replacement });
        }
      }
    }

    // 返回转换后的 script 内容
    return CommonASTUtils.applyReplacements(scriptContent, replacements);
  }

  /**
   * 生成 script 替换内容
   * @param extracted - 提取的字符串信息
   * @returns 替换字符串
   */
  private generateScriptReplacement(extracted: ExtractedString): string {
    const { semanticId, isTemplateString, templateVariables } = extracted;

    // 检查是否在 Composition API 中（使用 t）还是 Options API 中（使用 this.$t）
    // 默认使用 t()，因为 VueComponentInjector 会确保声明存在
    const tFunc = 't';

    // 过滤掉字面量，只保留真正的变量表达式
    const actualVariables = templateVariables
      ? this.filterLiterals(templateVariables)
      : undefined;

    if (isTemplateString && actualVariables && actualVariables.length > 0) {
      // 对于模板字符串，使用变量插值
      const { placeholderMap } = ReactASTUtils.createMessageWithOptions(
        extracted.original,
        actualVariables,
      );
      const variablesMapping = this.generateVariablesMapping(placeholderMap);
      return `${tFunc}('${semanticId}', ${variablesMapping})`;
    } else {
      // 对于普通字符串（或所有变量都是字面量）
      return `${tFunc}('${semanticId}')`;
    }
  }

  /**
   * 生成变量映射对象字符串
   * @param placeholderMap - 从表达式到占位符名称的映射
   * @returns 格式化后的变量映射字符串
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

  /**
   * 过滤掉templateVariables中的字面量值
   * @param templateVariables - 模板变量数组
   * @returns 过滤后只包含真实变量的数组
   */
  private filterLiterals(templateVariables: string[]): string[] {
    return templateVariables.filter((varExpr) => {
      const trimmed = varExpr.trim();

      // 检查是否是字符串字面量（单引号、双引号、反引号）
      if (/^['"`].*['"`]$/.test(trimmed)) {
        return false;
      }

      // 检查是否是数字字面量
      if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return false;
      }

      // 检查是否是布尔值
      if (trimmed === 'true' || trimmed === 'false') {
        return false;
      }

      // 检查是否是null或undefined
      if (trimmed === 'null' || trimmed === 'undefined') {
        return false;
      }

      // 其他情况视为变量表达式
      return true;
    });
  }
}
