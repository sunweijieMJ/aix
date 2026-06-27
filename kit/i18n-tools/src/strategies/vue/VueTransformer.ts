import fs from 'fs';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import type { ExtractedString } from '../../utils/types';
import type {
  IComponentInjector,
  IImportManager,
  ITransformer,
} from '../../adapters/FrameworkAdapter';
import type { VueI18nLibrary } from './libraries';

/**
 * Vue 代码转换器
 * 负责将提取的文本替换为 i18n 调用
 *
 * library / importManager / componentInjector 由 VueAdapter 注入，
 * 转换器自身不再持有 tImport 字符串，避免依赖蔓延。
 */
export class VueTransformer implements ITransformer {
  private library: VueI18nLibrary;
  private importManager: IImportManager;
  private componentInjector: IComponentInjector;

  constructor(
    library: VueI18nLibrary,
    importManager: IImportManager,
    componentInjector: IComponentInjector,
  ) {
    this.library = library;
    this.importManager = importManager;
    this.componentInjector = componentInjector;
  }

  /**
   * 转换文件
   * @param filePath - 文件路径
   * @param extractedStrings - 提取的字符串数组
   * @returns 转换后的代码
   */
  transform(filePath: string, extractedStrings: ExtractedString[], sourceText?: string): string {
    sourceText = sourceText ?? fs.readFileSync(filePath, 'utf-8');
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

      // 处理 script 部分。
      // Vue 3 允许 <script> 与 <script setup> 共存：<script> 用于 Options API
      // 或 inheritAttrs/name 等组件选项，<script setup> 用于 Composition API。
      //   - <script setup> 块：整块走裸 t()（顶层注入 const { t } = useI18n()）
      //   - <script> 块：按节点判定。defineComponent 选项内部的 method/lifecycle
      //     体里走 this.$t；模块顶层（顶层 const、IIFE 等）必须走裸 t() 并 import
      //     —— 顶层不存在 `this`，强行 this.$t 会运行时崩溃。
      // SFC 各 script 块统一用裸 `t` 函数名：
      //   - 仅 <script setup>：t 来自 setup 块顶部注入的 const { t } = useI18n()
      //   - 仅 <script>：t 来自模块顶部注入的 import { t } from tImport
      //     （Options API 选项内部走 this.$t —— 按 isInThisBindableScope 判定）
      //   - 双块共存：t 仅在非-setup 块顶部 import 一次，两个块共享模块作用域
      //     直接复用（Vue 3 SFC 编译模型）。这样避免命名冲突，也匹配本仓库 demo
      //     注释约定的"所有 import 集中到非-setup 块"风格。
      const scriptBlocks: Array<{
        block: typeof descriptor.script | typeof descriptor.scriptSetup;
        allowThisQualifier: boolean;
      }> = [
        { block: descriptor.script, allowThisQualifier: true },
        { block: descriptor.scriptSetup, allowThisQualifier: false },
      ];

      for (const { block, allowThisQualifier } of scriptBlocks) {
        if (!block) continue;
        const blockStartLine = block.loc.start.line;
        const blockEndLine = block.loc.end.line;
        const scriptStrings = fileStrings.filter(
          (s) => s.context === 'script' && s.line >= blockStartLine && s.line <= blockEndLine,
        );
        if (scriptStrings.length === 0) continue;

        const transformedScript = this.processScript(
          block.content,
          block.loc.start.line - 1,
          scriptStrings,
          allowThisQualifier,
        );
        replacements.push({
          start: block.loc.start.offset,
          end: block.loc.end.offset,
          content: transformedScript,
        });
      }

      // 处理 template 部分（后处理，但先替换）
      if (descriptor.template) {
        const templateStrings = fileStrings.filter((s) => s.context === 'template');
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
          false, // 纯 .ts/.js 走 import { t } from '@/plugins/locale' 路径，不用 this.$t
        );
      }
    }

    // 添加必要的导入和声明（使用注入的 importManager 以共享配置）
    transformedCode = this.importManager.handleGlobalImports(
      transformedCode,
      fileStrings,
      filePath,
    );

    // 只对 .vue 文件注入 Hook
    if (ext === 'vue') {
      transformedCode = this.componentInjector.inject(transformedCode);
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
      // @vue/compiler-dom 给的 column 是 1-based，replaceInTemplate 内部所有
      // indexOf / 范围比较都按 0-based 处理，必须减 1。否则文本节点位于行末时，
      // indexOf 会从下一字符起找不到原文，落入"全行重新搜索"的兜底分支，把同行
      // 前面（如 v-tooltip 字符串字面量内部）出现的相同子串误替换。
      const localColumn = extracted.column - 1;

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
   * 构造静态属性匹配正则：匹配整个 `attrName="value"`（含连字符属性名如
   * `confirm-button-text`），并**容忍引号与值之间的首尾空白**。
   *
   * Why 容忍空白：extractFromAttributes 存入的 original 是 attr.value.content.trim()，
   * 而源码里可能是 `title=" 确认"` / `title="\t确认"`。旧正则 `=["']确认["']` 要求引号
   * 紧贴文本，padding 时失配 → chosen 为空 → 旧逻辑 fall through 到裸文本搜索，把
   * `:title="$t(...)"` 插进引号内部，产出引号失衡的非法标记。`\s*` 让 trim 后的 original
   * 仍能整体匹配 padded 属性，locale 值则保持 trim（不把词间距污染进文案）。
   */
  private buildStaticAttrPattern(original: string, flags = ''): RegExp {
    const escaped = CommonASTUtils.escapeRegExp(original);
    return new RegExp(`([\\w-]+)=(["'])\\s*${escaped}\\s*\\2`, flags);
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
      // 同行内出现多个相同文本时（如 <span title="确认"><button title="确认">），
      // 需按 column 选中包含目标位置的那一处，避免 String.replace 总是命中第一处。
      const attrPattern = this.buildStaticAttrPattern(original, 'g');
      let attrMatch: RegExpExecArray | null;
      let chosen: RegExpExecArray | null = null;
      while ((attrMatch = attrPattern.exec(targetLine)) !== null) {
        const start = attrMatch.index;
        const end = start + attrMatch[0].length;
        if (start <= column && end >= column) {
          chosen = attrMatch;
          break;
        }
        if (chosen === null) chosen = attrMatch; // 兜底：保持原行为找第一处
      }

      if (chosen) {
        const start = chosen.index;
        lines[line] =
          targetLine.substring(0, start) +
          replacement +
          targetLine.substring(start + chosen[0].length);
        return lines.join('\n');
      }

      // 静态属性未在目标行命中：**绝不** fall through 到下方的引号/裸文本搜索——
      // 那会把 `:attr="$t(...)"` 插进引号内部，毁掉标记（引号失衡）。只在附近行做
      // 属性感知匹配（tryReplaceOnLine 对 `:` 前缀仅尝试属性正则），仍找不到就原样返回，
      // 宁可漏替换也不破坏源码。
      for (let delta = 1; delta <= 5; delta++) {
        for (const tryIdx of [line + delta, line - delta]) {
          if (tryIdx < 0 || tryIdx >= lines.length) continue;
          const result = this.tryReplaceOnLine(lines[tryIdx]!, original, replacement);
          if (result !== null) {
            lines[tryIdx] = result;
            return lines.join('\n');
          }
        }
      }
      return lines.join('\n');
    }

    // 多行文本节点：condense 解析下，跨行文本的 loc.source（即 original）含 `\n`，
    // 而上方逐行 indexOf 永远无法在单行内命中（±5 行兜底亦逐行）。这里用
    // (line, column) 推出绝对偏移在整段 template 内定位并整体替换；偏移不精确时
    // 退化为全局查找，仍找不到则原样返回（宁可漏替换也不破坏源码）。
    if (original.includes('\n')) {
      let offset = column;
      for (let i = 0; i < line; i++) {
        offset += lines[i]!.length + 1; // +1：补回 split 去掉的换行符
      }
      if (templateContent.startsWith(original, offset)) {
        return (
          templateContent.slice(0, offset) +
          replacement +
          templateContent.slice(offset + original.length)
        );
      }
      const idx = templateContent.indexOf(original);
      if (idx !== -1) {
        return (
          templateContent.slice(0, idx) + replacement + templateContent.slice(idx + original.length)
        );
      }
      return templateContent;
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
      // 从 column 开始查找，同行重复文本时可命中目标位置而非第一处
      index = targetLine.indexOf(original, Math.max(0, column));
      if (index === -1) {
        index = targetLine.indexOf(original);
      }
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
        const result = this.tryReplaceOnLine(lines[tryIdx]!, original, replacement);
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
      const attrPattern = this.buildStaticAttrPattern(original);
      const match = lineContent.match(attrPattern);
      if (match) {
        return lineContent.replace(match[0], replacement);
      }
      // 静态属性未命中：不得 fall through 到下方引号/裸文本搜索（同样会插进引号内部
      // 毁坏标记）。返回 null 表示本行无匹配，交由调用方继续找其他行或原样返回。
      return null;
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
    const { isTemplateString, templateVariables, templateContext, attributeName } = extracted;

    // template 中 $t() 是全局函数，vue-i18next 需要 namespace:key 前缀
    const ns = this.library?.namespace;
    const semanticId = ns ? `${ns}:${extracted.semanticId}` : extracted.semanticId;

    // 过滤掉字面量，只保留真正的变量表达式
    const actualVariables = templateVariables
      ? CommonASTUtils.filterLiterals(templateVariables)
      : undefined;

    // 处理模板字符串（带变量插值）
    if (isTemplateString && actualVariables && actualVariables.length > 0) {
      // mixed-content（HTML 文本节点+插值复合句）的 `original` 是源码层形式（含 `{{ }}`），
      // createMessageWithOptions 只识别 `${expr}` 形式，需要拿 processedMessage（合成的
      // backtick template）作为输入；其余路径（dynamic-attribute、interpolation
      // 中的 JS 模板字符串）的 `original` 已含 `${expr}`，保持现状。
      const messageInput =
        templateContext === 'mixed-content' && extracted.processedMessage
          ? extracted.processedMessage
          : extracted.original;
      const { placeholderMap } = CommonASTUtils.createMessageWithOptions(
        messageInput,
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
        case 'mixed-content':
        case 'text-node':
        default:
          // 文本节点 / 复合句：使用 {{ }} 包裹。mixed-content 的 original 已涵盖
          // 多个源码节点（如 `全部({{ totalCount }})`），整体被一次 indexOf 替换。
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
    allowThisQualifier: boolean,
  ): string {
    const sourceFile = CommonASTUtils.parseSourceFile(scriptContent, 'temp.ts');

    // 按位置倒序排列，从后往前替换
    const sortedStrings = strings.sort((a, b) => {
      const aLine = a.line - lineOffset - 1;
      const bLine = b.line - lineOffset - 1;
      const aPos = ts.getPositionOfLineAndCharacter(sourceFile, aLine, a.column - 1);
      const bPos = ts.getPositionOfLineAndCharacter(sourceFile, bLine, b.column - 1);
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
      const position = ts.getPositionOfLineAndCharacter(sourceFile, localLine, localColumn);
      const node = CommonASTUtils.findExactStringNode(sourceFile, position, extracted.original);

      if (node) {
        // 仅当所在块允许 this.$t（普通 <script> 块），且当前节点位于可绑定 this
        // 的词法作用域（method / lifecycle / 普通函数体内部，箭头函数透明）时，
        // 才使用 this.$t；模块顶层 / 选项对象的属性初始化器外层 → 裸 t()。
        const useThis = allowThisQualifier && CommonASTUtils.isInThisBindableScope(node);
        const replacement = this.generateScriptReplacement(extracted, useThis);
        const start = node.getStart(sourceFile);
        const end = node.getEnd();

        // 验证节点文本
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

    // 返回转换后的 script 内容
    return CommonASTUtils.applyReplacements(scriptContent, replacements);
  }

  /**
   * 生成 script 替换内容
   * @param extracted - 提取的字符串信息
   * @returns 替换字符串
   */
  private generateScriptReplacement(extracted: ExtractedString, useThisQualifier: boolean): string {
    const { isTemplateString, templateVariables } = extracted;

    // 与 generateTemplateReplacement 对称：vue-i18next 配置 namespace 时，script 里的 t()/this.$t()
    // 同样需要 `namespace:key` 前缀，否则当 namespace ≠ i18next defaultNS 时运行时解析失败（显示
    // 原始 key/fallback），而等价的 template $t() 因已加前缀解析正常。vue-i18n（无 namespace）不受影响。
    const ns = this.library?.namespace;
    const semanticId = ns ? `${ns}:${extracted.semanticId}` : extracted.semanticId;

    // SFC Options API 走 this.$t（vue-i18n 全局注册的实例属性，data/methods/
    // computed/lifecycle 的 this 都指向组件实例）；其它情况（script setup、纯
    // .ts/.js、SFC <script> 模块顶层）一律走裸 t —— 由 ImportManager 配套注入：
    //  - <script setup> 单存：const { t } = useI18n()
    //  - <script> 单存（含 Options API）：import { t } from tImport（仅当模块顶层有调用）
    //  - 双块共存：import { t } from tImport 注入到非-setup 块；setup 块共享模块作用域
    const tFunc = useThisQualifier ? 'this.$t' : 't';

    // 过滤掉字面量，只保留真正的变量表达式
    const actualVariables = templateVariables
      ? CommonASTUtils.filterLiterals(templateVariables)
      : undefined;

    if (isTemplateString && actualVariables && actualVariables.length > 0) {
      // 对于模板字符串，使用变量插值
      const { placeholderMap } = CommonASTUtils.createMessageWithOptions(
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
  private generateVariablesMapping(placeholderMap: Map<string, string>): string {
    return CommonASTUtils.formatValuesMapping(placeholderMap);
  }
}
