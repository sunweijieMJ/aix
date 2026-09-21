import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import {
  applyReplacements,
  findExactStringNode,
  nodeMatchesExtractedOriginal,
  parseSourceFile,
} from '../../utils/ast-core';
import { isInThisBindableScope } from '../../utils/ast-guards';
import { createMessageWithOptions, filterLiterals } from '../../utils/message-shape';
import { formatValuesMapping } from '../../utils/string-escape';
import { vueExtras } from './extracted-extras';
import { isHtmlTemplateLang, isStandaloneScriptPath, scriptFileNameOfLang } from './sfc-blocks';
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

      // 一条 script 字符串只能归属一个块。优先用提取端记下的块起点（绝对偏移）判定：
      // `</script><script setup>` 写在同一行时，按行号区间判定会让边界行上的字符串同时
      // 落进两个块 —— 同一区间被替换两次，第二次在已改写的内容上按旧行列换算位置，
      // 抛出无线索的 ts Debug Failure。旧数据（无该字段）回落行号区间，且按顺序只认第一个
      // 命中的块，保证「至多归属一个块」这一不变式与新路径一致。
      const claimed = new Set<ExtractedString>();
      const belongsTo = (
        s: ExtractedString,
        block: NonNullable<(typeof scriptBlocks)[number]['block']>,
      ): boolean => {
        const blockStart = vueExtras(s).scriptBlockStart;
        if (blockStart !== undefined) return blockStart === block.loc.start.offset;
        if (claimed.has(s)) return false;
        const hit = s.line >= block.loc.start.line && s.line <= block.loc.end.line;
        if (hit) claimed.add(s);
        return hit;
      };

      for (const { block, allowThisQualifier } of scriptBlocks) {
        if (!block) continue;
        const scriptStrings = fileStrings.filter(
          (s) => s.context === 'script' && belongsTo(s, block),
        );
        if (scriptStrings.length === 0) continue;

        const transformedScript = this.processScript(
          block.content,
          block.loc.start.line - 1,
          scriptStrings,
          allowThisQualifier,
          scriptFileNameOfLang(block.lang),
        );
        replacements.push({
          start: block.loc.start.offset,
          end: block.loc.end.offset,
          content: transformedScript,
        });
      }

      // 处理 template 部分（后处理，但先替换）。非 HTML 模板（pug 等）提取端整块跳过，
      // 正常不会有 template 字符串落到这里；显式守卫是为了挡住陈旧提取数据——按 HTML
      // 偏移改写 pug 源码会把整块模板替换成一句 $t()，且不可还原。
      if (descriptor.template && isHtmlTemplateLang(descriptor.template.lang)) {
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
    // 处理独立脚本（.ts / .js / .tsx / .jsx）
    else if (isStandaloneScriptPath(filePath)) {
      const scriptStrings = fileStrings.filter((s) => s.context === 'script');
      if (scriptStrings.length > 0) {
        transformedCode = this.processScript(
          sourceText,
          0, // 没有 template，从第 0 行开始
          scriptStrings,
          false, // 独立脚本走 import { t } from '@/plugins/locale' 路径，不用 this.$t
          // 解析文件名用真实路径：tsx/jsx 必须按 JSX 解析，否则 `<div a="x">` 被当成类型断言，
          // 与提取端（同样用真实路径）的 AST 对不上，定位必然失败。
          filePath,
        );
      }
    }

    // 添加必要的导入和声明（使用注入的 importManager 以共享配置）
    transformedCode = this.importManager.handleGlobalImports(
      transformedCode,
      fileStrings,
      filePath,
    );

    // 只对 .vue 文件注入 Hook（filePath 按接口约定透传；Vue 侧内部一律按 SFC 分段，
    // 不依赖它决定 ScriptKind）
    if (ext === 'vue') {
      transformedCode = this.componentInjector.inject(transformedCode, filePath);
    }

    return transformedCode;
  }

  /**
   * 处理 template 内容：按提取端给出的绝对偏移做精确区间替换。
   *
   * Why 绝对偏移而非「行列 + indexOf」：按 (line, column) 定位到行再在行内 indexOf 原文，
   * 必然要配一整套启发式补丁（引号感知搜索、比较操作数跳过、属性正则、邻行与跨行兜底），
   * 且补丁之间还要排优先级；同行出现第二个相同字面量就会替换到错误的那一处（产出坏代码），
   * 字面量距节点起始行较远时又会直接抛错、整个文件不再转换。compiler-dom 的 loc 是精确
   * 区间，这些启发式一条都不需要。
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
      // 都会砍在半截语法上，故中止而不是退化搜索。这一道校验就是全部的防误替换机制：
      // 区间精确到字符，不可能命中"同行另一处相同字面量"或"比较运算符的操作数"，
      // 无需再叠加引号感知搜索、邻行兜底之类的启发式。
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
    // key 的引号必须与所在属性的外层引号不同，否则 `:title='a ? $t('k') : b'` 在外层单引号
    // 处提前闭合，产出坏模板。key 由工具生成，不含引号，选另一种即可，无需转义。
    const q = vueExtras(extracted).attributeQuote === "'" ? '"' : "'";
    const key = `${q}${semanticId}${q}`;

    // 过滤掉字面量，只保留真正的变量表达式
    const actualVariables = templateVariables ? filterLiterals(templateVariables) : undefined;

    // 处理模板字符串（带变量插值）
    if (isTemplateString && actualVariables && actualVariables.length > 0) {
      // 这里只取 placeholderMap（`表达式 → 占位符名`），它仅由 actualVariables 推导，
      // 与传入文本无关；locale 值由 buildLocaleMessage 另行生成。入参仍与消息生成端同源
      // （优先 processedMessage、回落 original），避免两端各喂一份文本而口径分叉。
      const messageInput = extracted.processedMessage ?? extracted.original;
      const { placeholderMap } = createMessageWithOptions(messageInput, actualVariables);
      const variablesMapping = formatValuesMapping(placeholderMap);

      // 根据上下文生成不同格式。static-attribute 不在此分支：提取端该路径恒
      // isTemplateString:false（静态属性值是纯字面量），带变量形态只出现在下面三种上下文。
      switch (templateContext) {
        case 'interpolation':
        case 'dynamic-attribute':
          // 插值表达式和动态属性中：不需要额外的 {{ }}（已在表达式上下文中）
          return `$t(${key}, ${variablesMapping})`;
        case 'mixed-content':
        case 'text-node':
        default:
          // 文本节点 / 复合句：使用 {{ }} 包裹。mixed-content 的区间已涵盖多个源码节点
          // （如 `全部({{ totalCount }})`，可跨行），整体被一次精确区间替换。
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
          return `$t(${key})`;
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
    parseFileName: string = 'temp.ts',
  ): string {
    const sourceFile = parseSourceFile(scriptContent, parseFileName);

    // 无需在此按位置预排序：倒序写入与重叠检测都由 applyReplacements 内部统一完成，
    // 预排序对最终产物无影响，且会原地 mutate 入参数组。与 ReactTransformer.replaceStrings
    // 的同款说明保持一致（那边已删掉这段排序）。

    const replacements: Array<{
      start: number;
      end: number;
      replacement: string;
    }> = [];

    for (const extracted of strings) {
      const localLine = extracted.line - lineOffset - 1;
      const localColumn = extracted.column - 1;
      const position = ts.getPositionOfLineAndCharacter(sourceFile, localLine, localColumn);
      const node = findExactStringNode(sourceFile, position, extracted.original);

      if (node) {
        // 仅当所在块允许 this.$t（普通 <script> 块），且当前节点位于可绑定 this
        // 的词法作用域（method / lifecycle / 普通函数体内部，箭头函数透明）时，
        // 才使用 this.$t；模块顶层 / 选项对象的属性初始化器外层 → 裸 t()。
        const useThis = allowThisQualifier && isInThisBindableScope(node);
        // JSX 属性值只接受字符串字面量或 `{表达式}`（`lang="tsx"` 的 script 块才可能出现）：
        // 裸 `title=t('k')` 是语法错误，必须补花括号。
        const inJsxAttribute =
          node.parent !== undefined &&
          ts.isJsxAttribute(node.parent) &&
          node.parent.initializer === node;
        const call = this.generateScriptReplacement(extracted, useThis);
        const replacement = inJsxAttribute ? `{${call}}` : call;
        const start = node.getStart(sourceFile);
        const end = node.getEnd();

        // 「original 是否为带定界符的源码形式」以提取端的旗标为准，不看首尾字符：
        // script 侧只有 TemplateExpression 存源码形式（isTemplateString=true），
        // StringLiteral / 无插值模板存的是裸内容。用首尾字符猜会把 `'\`代码\`'` 这类
        // 「内容本身首尾是反引号」的普通字符串误判成模板源码形式 → 裸内容侧被多剥一层
        // → 复核不通过 → 整文件中止转换。
        const isTemplateString = extracted.isTemplateString === true;

        // 验证节点文本。script 侧节点为 StringLiteral / 模板串，源码侧均含定界符；
        // extracted.original 仅模板串是源码形式、其余为裸内容 → 据此控制裸内容侧不剥定界符，
        // 避免内容自带成对引号被误剥。模板串走结构化比对（见 nodeMatchesExtractedOriginal），
        // 与 findExactStringNode 的定位口径同源，不会出现「定位得到、复核不过」。
        // nodeDelimited 排除 JsxText：`lang="tsx"` 的块按 TSX 解析，定位回退路径可能返回
        // JsxText 节点，它源码侧本就无定界符，剥一层会剪掉首尾真实字符。
        if (
          nodeMatchesExtractedOriginal(node, sourceFile, extracted.original, {
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
