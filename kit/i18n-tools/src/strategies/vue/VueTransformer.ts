import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import {
  applyReplacements,
  findExactStringNode,
  nodeToText,
  parseSourceFile,
  shouldReplaceNode,
} from '../../utils/ast-core';
import { isInThisBindableScope } from '../../utils/ast-guards';
import { createMessageWithOptions, filterLiterals } from '../../utils/message-shape';
import { formatValuesMapping } from '../../utils/string-escape';
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
 * 转换器自身不持有 tImport 字符串，避免依赖蔓延。
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
    // 归一两侧路径再比较（详见 ReactTransformer.transformText 的同款说明）：
    // 避免 transformToMemory 规范化后的 filePath 与原样透传的 s.filePath 不等，
    // 致单文件模式命中 0 条、源码未改却已写 locale。
    const normalizedTarget = path.normalize(filePath);
    const fileStrings = extractedStrings.filter(
      (s) => path.normalize(s.filePath) === normalizedTarget,
    );

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
   * 处理 template 内容：按提取端给出的绝对偏移做精确区间替换。
   *
   * Why 绝对偏移而非「行列 + indexOf」：旧实现按 (line, column) 定位到行、再在行内
   * indexOf 原文，配套了一整套启发式来打补丁——引号感知搜索、比较操作数跳过、
   * 属性正则、±5 行邻行兜底、跨行整段兜底。这些补丁互相之间还有优先级，实际出过两类
   * 严重问题：同行出现第二个相同字面量时替换到错误的那一处（产出坏代码），以及指令内
   * 的字面量距节点起始行超过 5 行时直接抛错、整个文件不再转换。改成 compiler-dom
   * 的精确 loc 后这些补丁全部不需要了。
   *
   * @param templateContent - template 内容（偏移的基准，必须与提取时同一份）
   * @param strings - template 中的字符串数组
   * @returns 转换后的 template 内容
   */
  private processTemplate(templateContent: string, strings: ExtractedString[]): string {
    const replacements: Array<{ start: number; end: number; replacement: string }> = [];

    for (const extracted of strings) {
      const where = `${extracted.filePath}:${extracted.line}:${extracted.column}「${extracted.original}」`;

      // 提取端必须给出精确区间。缺失说明有提取路径漏填 startOffset/sourceSlice——
      // 此时既不能猜也不能跳过（跳过 = locale 已写 key 而源码残留中文的孤儿键），中止。
      if (extracted.startOffset === undefined || extracted.sourceSlice === undefined) {
        throw new Error(`已提取文本缺少精确源码区间，已中止转换: ${where}`);
      }

      const start = extracted.startOffset;
      const end = start + extracted.sourceSlice.length;
      // 核对偏移仍指向提取时看到的原文。对不上意味着「提取与转换看到的不是同一份
      // template」（源码被并发改动、或某条提取路径的偏移换算有 bug），此时任何替换
      // 都会砍在半截语法上，故中止而不是退化搜索。这一道校验取代了旧实现里全部
      // 防误替换机制（比较操作数守卫、引号感知搜索、±5 行兜底）：区间精确到字符，
      // 不可能命中"同行另一处相同字面量"或"比较运算符的操作数"。
      const actual = templateContent.slice(start, end);
      if (actual !== extracted.sourceSlice) {
        throw new Error(
          `已提取文本的源码区间与原文不符，已中止转换: ${where}\n` +
            `  期望 [${start},${end}) = ${JSON.stringify(extracted.sourceSlice)}\n` +
            `  实际 = ${JSON.stringify(actual)}`,
        );
      }

      replacements.push({ start, end, replacement: this.generateTemplateReplacement(extracted) });
    }

    // applyReplacements 负责倒序写入与重叠检测（重叠即抛错，不静默取舍）。
    return applyReplacements(templateContent, replacements);
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
    const actualVariables = templateVariables ? filterLiterals(templateVariables) : undefined;

    // 处理模板字符串（带变量插值）
    if (isTemplateString && actualVariables && actualVariables.length > 0) {
      // createMessageWithOptions 需要「内联字面量后、仅含真正变量 `${expr}`」的形式：
      //  - mixed-content：`original` 是源码层形式（含 `{{ }}`），用合成的 processedMessage；
      //  - dynamic-attribute / interpolation：`original` 现存源码层模板串（含字面量插值如
      //    `${'X'}`，供源码文本匹配），其内联后的 processedMessage 才是正确的消息输入。
      // 统一优先取 processedMessage，无（纯变量插值、内联前后相同）时回落 original。
      const messageInput = extracted.processedMessage ?? extracted.original;
      const { placeholderMap } = createMessageWithOptions(messageInput, actualVariables);
      const variablesMapping = formatValuesMapping(placeholderMap);

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
    const sourceFile = parseSourceFile(scriptContent, 'temp.ts');

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
      const node = findExactStringNode(sourceFile, position, extracted.original);

      if (node) {
        // 仅当所在块允许 this.$t（普通 <script> 块），且当前节点位于可绑定 this
        // 的词法作用域（method / lifecycle / 普通函数体内部，箭头函数透明）时，
        // 才使用 this.$t；模块顶层 / 选项对象的属性初始化器外层 → 裸 t()。
        const useThis = allowThisQualifier && isInThisBindableScope(node);
        const replacement = this.generateScriptReplacement(extracted, useThis);
        const start = node.getStart(sourceFile);
        const end = node.getEnd();

        // 验证节点文本
        const originalNodeText = nodeToText(node, sourceFile);
        const isTemplateString =
          extracted.original.startsWith('`') && extracted.original.endsWith('`');

        // script 侧节点为 StringLiteral / 模板串，源码侧均含定界符；extracted.original 仅模板串
        // 是源码形式、其余为裸内容 → 据此控制裸内容侧不剥定界符，避免内容自带成对引号被误剥。
        if (
          shouldReplaceNode(originalNodeText, extracted.original, isTemplateString, {
            nodeDelimited: !ts.isJsxText(node),
            originalDelimited: isTemplateString,
          })
        ) {
          replacements.push({ start, end, replacement });
        } else {
          throw new Error(
            `无法验证已提取文本的源码节点，已中止转换: ${extracted.filePath}:${extracted.line}:${extracted.column}「${extracted.original}」`,
          );
        }
      } else {
        throw new Error(
          `无法定位已提取文本的源码节点，已中止转换: ${extracted.filePath}:${extracted.line}:${extracted.column}「${extracted.original}」`,
        );
      }
    }

    // 返回转换后的 script 内容
    return applyReplacements(scriptContent, replacements);
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
    const actualVariables = templateVariables ? filterLiterals(templateVariables) : undefined;

    if (isTemplateString && actualVariables && actualVariables.length > 0) {
      // 对于模板字符串，使用变量插值
      const { placeholderMap } = createMessageWithOptions(extracted.original, actualVariables);
      const variablesMapping = formatValuesMapping(placeholderMap);
      return `${tFunc}('${semanticId}', ${variablesMapping})`;
    } else {
      // 对于普通字符串（或所有变量都是字面量）
      return `${tFunc}('${semanticId}')`;
    }
  }
}
