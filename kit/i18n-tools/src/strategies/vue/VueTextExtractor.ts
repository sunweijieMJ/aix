import fs from 'fs';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import {
  parse as parseTemplate,
  type ElementNode,
  type TextNode,
  type InterpolationNode,
  type AttributeNode,
  type DirectiveNode,
} from '@vue/compiler-dom';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { NON_EXTRACTABLE_ELEMENT_TAGS } from '../../utils/constants';
import { isNonTranslatableText, isTechnicalConfigValue } from '../../utils/text-classify';
import { FileUtils } from '../../utils/file-utils';
import { LoggerUtils } from '../../utils/logger';
import type { ExtractedString } from '../../utils/types';
import { BaseTextExtractor } from '../base';

/**
 * Vue 文本提取器
 * 负责从 Vue 文件中提取需要国际化的文本
 */
export class VueTextExtractor extends BaseTextExtractor {
  /**
   * 从单个文件中提取字符串
   * @param filePath - 文件路径
   * @returns 提取的字符串数组
   */
  async extractFromFile(filePath: string): Promise<ExtractedString[]> {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const extractedStrings: ExtractedString[] = [];
    const ext = filePath.split('.').pop()?.toLowerCase();

    // 处理 .vue 文件
    if (ext === 'vue') {
      const { descriptor } = parseSFC(sourceText, { filename: filePath });

      // 提取 template 部分
      if (descriptor.template) {
        const templateStrings = await this.extractFromTemplate(
          descriptor.template.content,
          filePath,
          descriptor.template.loc.start.line - 1,
        );
        extractedStrings.push(...templateStrings);
      }

      // 提取 script 部分
      // Vue 3 官方允许 <script> 与 <script setup> 共存（如用 <script> 声明
      // inheritAttrs: false 等组件选项，用 <script setup> 写 Composition API），
      // 两个块的中文文案都需要提取，不能只取其中一个。
      for (const script of [descriptor.script, descriptor.scriptSetup]) {
        if (!script) continue;
        const scriptStrings = await this.extractFromScript(
          script.content,
          filePath,
          script.loc.start.line - 1,
        );
        extractedStrings.push(...scriptStrings);
      }
    }
    // 处理纯 .ts 或 .js 文件
    else if (ext === 'ts' || ext === 'js') {
      const scriptStrings = await this.extractFromScript(
        sourceText,
        filePath,
        0, // 没有 template，从第 0 行开始
      );
      extractedStrings.push(...scriptStrings);
    }

    return extractedStrings;
  }

  // extractFromFiles 由 BaseTextExtractor 提供默认串行实现

  /**
   * 从 Vue template 中提取字符串
   * @param templateContent - template 内容
   * @param filePath - 文件路径
   * @param lineOffset - 行偏移量
   * @returns 提取的字符串数组
   */
  private async extractFromTemplate(
    templateContent: string,
    filePath: string,
    lineOffset: number,
  ): Promise<ExtractedString[]> {
    const extractedStrings: ExtractedString[] = [];

    try {
      const ast = parseTemplate(templateContent, { comments: true });
      await this.traverseTemplateNode(ast.children, extractedStrings, filePath, lineOffset);
    } catch (error) {
      LoggerUtils.error(`解析 template 失败: ${filePath}`, error);
    }

    return extractedStrings;
  }

  /**
   * 遍历 template AST 节点
   * @param nodes - AST 节点数组
   * @param extractedStrings - 提取的字符串数组
   * @param filePath - 文件路径
   * @param lineOffset - 行偏移量
   */
  /**
   * 元素是否带 v-pre 指令。
   *
   * @vue/compiler-dom 在 parse 阶段消费 v-pre 并从 props 移除（不保留 DIRECTIVE 节点），
   * 无法从 props 检测；改为扫描元素「开标签」源码。开标签边界取「元素起点 → 第一个子节点
   * 起点」，而非按第一个 `>` 截断——后者会被属性值里的 `>`（如 `:x="a>b"`）骗到。
   *
   * 匹配前先把引号包裹的属性值整体抹平：仅靠属性名锚定的正则不够，值里空白分隔的
   * `v-pre`（如 `:data-tip="'enable v-pre mode'"`）会让整棵子树被误判为 v-pre 而漏提取。
   * 与 VueRestoreTransformer.stashVerbatimRegions 的同款判定保持一致。
   */
  private static hasVPreDirective(node: ElementNode): boolean {
    const src = node.loc.source;
    let openTag = src;
    const firstChild = node.children[0];
    if (firstChild) {
      const len = firstChild.loc.start.offset - node.loc.start.offset;
      if (len > 0 && len <= src.length) {
        openTag = src.slice(0, len);
      }
    }
    return /(?:^|\s)v-pre(?=[\s/>=]|$)/.test(openTag.replace(/"[^"]*"|'[^']*'/g, '""'));
  }

  private async traverseTemplateNode(
    nodes: any[],
    extractedStrings: ExtractedString[],
    filePath: string,
    lineOffset: number,
  ): Promise<void> {
    let i = 0;
    while (i < nodes.length) {
      const node = nodes[i];
      // 处理元素节点
      if (node.type === 1) {
        // ELEMENT
        const elementNode = node as ElementNode;

        // <code> / <pre> 内容是逐字代码 / 预格式文本，跳过整棵子树不提取
        if (NON_EXTRACTABLE_ELEMENT_TAGS.has((elementNode.tag || '').toLowerCase())) {
          i++;
          continue;
        }

        // v-pre 子树：Vue 编译期跳过该元素及其后代的编译，`{{ }}` 按纯文本原样输出。
        // @vue/compiler-dom 在 parse 阶段就消费掉 v-pre 并从 props 中移除（不像其它指令保留
        // DIRECTIVE 节点），且把子内容整体解析成一个含 `{{ }}` 字面量的 TEXT 节点。若不跳过，
        // 会把整段（连同 `{{ raw }}`）提取成 key，transform 后变 `{{ $t('k0') }}`，页面直接
        // 渲染这串字符。故与 code/pre 同处跳过整棵子树。
        if (VueTextExtractor.hasVPreDirective(elementNode)) {
          i++;
          continue;
        }

        // 提取属性中的文本
        await this.extractFromAttributes(elementNode, extractedStrings, filePath, lineOffset);

        // 递归处理子节点
        if (elementNode.children && elementNode.children.length > 0) {
          await this.traverseTemplateNode(
            elementNode.children,
            extractedStrings,
            filePath,
            lineOffset,
          );
        }
        i++;
        continue;
      }

      // TEXT / INTERPOLATION：先尝试把"相邻 TEXT + INTERPOLATION 序列"作为
      // 复合句整体提取（保留语序、避免切碎导致译文残缺，如「全部({{ count }})」
      // 切成 `全部(` + 硬编码 `)` 的破坏性产物）。命中则一次处理整组，
      // 未命中再回退到逐节点提取。
      if (node.type === 2 || node.type === 5) {
        let j = i;
        while (j < nodes.length && (nodes[j].type === 2 || nodes[j].type === 5)) {
          j++;
        }
        const groupSize = j - i;
        if (
          groupSize >= 2 &&
          (await this.tryExtractMixedContent(
            nodes.slice(i, j) as Array<TextNode | InterpolationNode>,
            extractedStrings,
            filePath,
            lineOffset,
          ))
        ) {
          i = j;
          continue;
        }
        // 不构成复合句或不满足合并条件 → 落回逐节点处理
      }

      if (node.type === 2) {
        // TEXT
        const textNode = node as TextNode;
        const text = textNode.content.trim();
        // loc.source 是未解码的原始源码；@vue/compiler-dom 会把 HTML 实体（&copy; 等）
        // 解码进 content。两者不一致时（即文本含实体）必须分别使用：
        // - original 用原始源码 → Transformer 的 indexOf 才能在含 &copy; 的模板里匹配到，
        //   否则替换失败、源码残留中文 + locale 多出孤儿 key。
        // - processedMessage 用解码后文本 → 作为 locale 值与 ID 源，$t 渲染时正确输出 ©。
        const rawSource = textNode.loc.source.trim();
        const hasEntity = rawSource !== text;

        if (text && this.shouldExtract(text, 'template', undefined, 'text-node')) {
          // loc.start 指向文本节点原始起点（紧跟开标签 `>`），而 original 是 trim 后的
          // 文本。元素子内容以换行开头时，节点起点在开标签行、真实文本在下一行——若原样
          // 记 loc.start，Transformer 在开标签行找不到文本、从行首重试时会误命中同行
          // 未被提取的属性值（如 value="全部"），产出非法模板。这里把 line/column 校正到
          // trim 后文本的实际位置（前导空白可能跨行）。
          const source = textNode.loc.source;
          const leadingWs = source.slice(0, source.length - source.trimStart().length);
          const wsNewlines = leadingWs.split('\n').length - 1;
          const column =
            wsNewlines === 0
              ? textNode.loc.start.column + leadingWs.length
              : leadingWs.length - leadingWs.lastIndexOf('\n'); // 1-based：新行内偏移 + 1
          extractedStrings.push({
            original: hasEntity ? rawSource : text,
            processedMessage: hasEntity ? text : undefined,
            semanticId: '',
            filePath,
            line: textNode.loc.start.line + wsNewlines + lineOffset,
            column,
            context: 'template',
            componentType: 'setup', // Vue 默认使用 setup
            isTemplateString: false,
            templateContext: 'text-node',
            // 与上面 line/column 的前导空白校正同源，只是换算到偏移：节点起点 + 前导空白
            // 长度 = trim 后文本的真实起点。rawSource 是未解码的源码原文，正是该区间内容。
            startOffset: textNode.loc.start.offset + leadingWs.length,
            sourceSlice: rawSource,
          });
        }
      } else if (node.type === 5) {
        // INTERPOLATION
        const interpolationNode = node as InterpolationNode;
        await this.extractFromInterpolation(
          interpolationNode,
          extractedStrings,
          filePath,
          lineOffset,
        );
      }
      i++;
    }
  }

  /**
   * 尝试把一段连续的 TEXT/INTERPOLATION 子节点作为"复合句"整体提取。
   *
   * 适用场景：
   * - `<div>全部({{ totalCount }})</div>` → 一个 key `全部({totalCount})`
   * - `<div>第{{ x }}讲：</div>` → 一个 key `第{x}讲：`
   * - `<div>{{ p }}%已学</div>` → 一个 key `{p}%已学`
   *
   * 命中条件（任一不满足均放弃，回退原逐节点处理路径）：
   * - 组内至少有一段 TEXT 含中文（否则 Locale 价值不大，由原插值路径处理）
   * - 组全部位于同一行（多行复合句替换边界复杂，保留为后续工作）
   * - 所有 INTERPOLATION 的表达式必须为 SIMPLE_EXPRESSION（type === 4），
   *   且表达式文本不含引号——避免吞掉嵌套的中文字符串字面量
   *   （如 `{{ x ? '中文1' : '中文2' }}`），否则 LLM 翻译时占位符失踪。
   *
   * 命中时输出一条 ExtractedString：
   * - `original`：源码片段（含 `{{ }}` 语法），供 Transformer 子串匹配替换
   * - `processedMessage`：合成的 backtick template 形式（含 `${expr}`），供
   *    createMessageWithOptions 生成占位符与 locale message
   * - `templateContext: 'mixed-content'`
   */
  private async tryExtractMixedContent(
    group: Array<TextNode | InterpolationNode>,
    extractedStrings: ExtractedString[],
    filePath: string,
    lineOffset: number,
  ): Promise<boolean> {
    if (group.length < 2) return false;

    const first = group[0]!;
    const last = group[group.length - 1]!;
    if (first.loc.start.line !== last.loc.end.line) return false;

    // 必须存在含中文的 TEXT，否则没有提取价值（纯插值由原路径处理）
    const hasChineseText = group.some(
      (n) => n.type === 2 && FileUtils.containsChinese((n as TextNode).content),
    );
    if (!hasChineseText) return false;

    let body = '';
    let originalSrc = '';
    const templateVariables: string[] = [];

    for (const n of group) {
      if (n.type === 2) {
        const textNode = n as TextNode;
        body += textNode.content;
        originalSrc += textNode.loc.source;
        continue;
      }
      // INTERPOLATION
      const interp = n as InterpolationNode;
      // 仅支持 SIMPLE_EXPRESSION（type 4）；其它结构（如 CompoundExpression）
      // 进入此分支较少且语义复杂，留给原路径单独处理。
      if (interp.content.type !== 4) return false;
      const expr = (interp.content as any).content.trim() as string;
      // 已是 i18n 调用的不应再被提取
      if (this.isVueI18nCall(expr)) return false;
      // 表达式含引号 → 大概率内部有字符串字面量，可能包含需独立翻译的中文，
      // 退回原路径让 extractFromInterpolation 走 AST 解构提取。
      if (/['"`]/.test(expr)) return false;

      body += '${' + expr + '}';
      originalSrc += interp.loc.source;
      templateVariables.push(expr);
    }

    // 与单 TEXT 节点路径（textNode.content.trim()）口径一致：去掉复合句首尾空白，避免
    // 源语言 locale 写入带首尾空格的脏值。originalSrc 同步 trim，使 Transformer 按 original
    // 子串匹配替换时只命中中文片段、保留模板里的空白；column 相应跳过被去掉的前导空白
    // （mixed-content 受单行约束，前导空白不含换行，故只调列不调行）。
    const leadingWhitespace = originalSrc.length - originalSrc.trimStart().length;
    const synthetic = '`' + body.trim() + '`';
    originalSrc = originalSrc.trim();

    // 走 shouldExtract（含业务侧 rejectPatterns 兜底），把合成 message 作为 text-node 看待
    if (!this.shouldExtract(synthetic, 'template', undefined, 'text-node')) {
      return false;
    }

    extractedStrings.push({
      original: originalSrc,
      processedMessage: synthetic,
      semanticId: '',
      filePath,
      line: first.loc.start.line + lineOffset,
      column: first.loc.start.column + leadingWhitespace,
      context: 'template',
      componentType: 'setup',
      isTemplateString: true,
      templateVariables,
      templateContext: 'mixed-content',
      // originalSrc 是组内各节点 loc.source 的顺序拼接再 trim——组内节点在源码中连续，
      // 故它就是 [first 起点 + 前导空白, +长度) 这一段的原文。
      startOffset: first.loc.start.offset + leadingWhitespace,
      sourceSlice: originalSrc,
    });
    return true;
  }

  /**
   * 把「表达式内的 TS 节点」换算成相对 template content 的绝对偏移。
   *
   * 三段偏移都必须补上，少一项就整体错位、替换到相邻字符上：
   *  1. exprLoc.start.offset —— 表达式在 template 中的起点；
   *  2. 被 trim 掉的前导空白 —— 提取端把 `exp.content` trim 后才送去解析
   *     （`:title="  'x'  "` 的 exp.loc.source 含那两个空格）；
   *  3. `- 1` —— parseExpressionSource 把表达式外包了一层括号 `(expr)`，
   *     解析结果里所有位置都比 trim 后的表达式多 1。
   *
   * 返回值只是「据此推算」的偏移；真正的正确性由转换端对 sourceSlice 的核对兜住
   * （compiler-dom 若对某个属性值做了实体解码，content 与 loc.source 长度不等、
   * 本换算就会偏，那里会 throw 而不是写出坏代码）。
   */
  private static templateOffsetOfExprNode(
    exprLoc: { start: { offset: number }; source: string },
    node: ts.Node,
    sourceFile: ts.SourceFile,
  ): number {
    const leadingTrimmed = exprLoc.source.length - exprLoc.source.trimStart().length;
    return exprLoc.start.offset + leadingTrimmed + (node.getStart(sourceFile) - 1);
  }

  /**
   * 判断属性名是否是技术属性（不应该被国际化）
   * @param attrName - 属性名
   * @returns 是否是技术属性
   */
  private isTechnicalAttribute(attrName: string): boolean {
    // CSS 和样式相关
    if (attrName === 'class' || attrName === 'id' || attrName === 'style') return true;

    // Vue 特殊属性
    if (attrName === 'key' || attrName === 'ref' || attrName === 'is') return true;

    // 组件技术配置属性
    // 注意 aria-* 的处理规则：
    //   - aria-label：面向辅助技术用户的可见文案，应当本地化，不放入排除名单
    //   - aria-labelledby / aria-describedby：取值是另一元素的 ID 引用（如
    //     "nav-title"），翻译后运行时无法关联到目标 id，破坏 a11y 关联，必须排除
    //   - 其余 aria-*（aria-hidden / aria-expanded / aria-controls 等）取值是
    //     布尔/状态枚举/ID 引用，不在 shouldExtract 的中文/英文规则命中范围内
    const technicalAttrs = [
      'size',
      'type',
      'position',
      'direction',
      'effect',
      'trigger',
      'placement',
      'width',
      'height',
      'offset',
      'disabled',
      'readonly',
      'clearable',
      'show-password',
      'rows',
      'autosize',
      'name',
      'value',
      'src',
      'href',
      'target',
      'method',
      'action',
      'enctype',
      'for',
      'role',
      'aria-labelledby', // ID 引用，翻译后破坏 a11y 关联
      'aria-describedby', // ID 引用，翻译后破坏 a11y 关联
      'prop',
      'column-key',
      'index',
      'align',
      'header-align',
      'fixed', // Element Plus 表格相关
      'data-',
    ];

    // 名单里不含 v- / : / @ / # 等指令形态：本方法的入参只会是 compiler-dom 解析后的
    // ATTRIBUTE 名或 DIRECTIVE 的 arg.content（`:title` 传进来已是 `title`），
    // 指令前缀永远匹配不到，写进名单只会误导后续维护者。
    //
    // 仅对真正的「前缀模式」（以 - 结尾，如 data-）做前缀匹配；其余是完整属性名，
    // 必须精确相等——否则 forecast 会被 'for' 误杀、namespace 被 'name' 误杀。
    const isPrefixPattern = (tech: string): boolean => tech.endsWith('-');
    if (
      technicalAttrs.some((tech) =>
        isPrefixPattern(tech) ? attrName.startsWith(tech) : attrName === tech,
      )
    ) {
      return true;
    }

    // label-position, label-width 等 Element Plus 组件配置属性
    if (
      attrName.includes('-') &&
      (attrName.startsWith('label-') ||
        attrName.startsWith('button-') ||
        attrName.startsWith('input-') ||
        attrName.includes('-position') ||
        attrName.includes('-width') ||
        attrName.includes('-height') ||
        attrName.includes('-size') ||
        attrName.includes('-type'))
    ) {
      return true;
    }

    return false;
  }

  /**
   * 从元素属性中提取文本
   * @param elementNode - 元素节点
   * @param extractedStrings - 提取的字符串数组
   * @param filePath - 文件路径
   * @param lineOffset - 行偏移量
   */
  private async extractFromAttributes(
    elementNode: ElementNode,
    extractedStrings: ExtractedString[],
    filePath: string,
    lineOffset: number,
  ): Promise<void> {
    for (const prop of elementNode.props) {
      // 处理静态属性
      if (prop.type === 6) {
        // ATTRIBUTE
        const attr = prop as AttributeNode;

        // 跳过技术属性
        if (this.isTechnicalAttribute(attr.name)) {
          // 技术属性名单是按属性名粗粒度匹配的，value="提交" 这类「名字在名单里、值却是可见
          // 文案」会被一并跳过。行为保持跳过（翻译 value/name 可能破坏运行时逻辑），但含中文时
          // 必须留痕——否则用户既看不到提取结果也看不到任何提示，中文静默留在源码里。
          if (attr.value?.content && FileUtils.containsChinese(attr.value.content)) {
            this.warnChineseInTechnicalAttribute(
              attr.name,
              attr.value.content.trim(),
              filePath,
              attr.loc.start.line + lineOffset,
            );
          }
          continue;
        }

        if (attr.value && attr.value.content) {
          const text = attr.value.content.trim();
          // 与文本节点 B1 对称：attr.value.content 已被 @vue/compiler-dom 解码（&amp; → &）。
          // 若原始源码含实体，Transformer 用解码后的 original 拼正则去匹配仍含 &amp; 的源码会
          // 失配 → 属性不被替换 + locale 多出孤儿 key。故 original 用「去引号的原始源码」让正则
          // 能命中，processedMessage 用解码后文本作为 locale 值 / ID 源。
          const rawSrc = attr.value.loc.source;
          const rawInner =
            rawSrc.length >= 2 &&
            (rawSrc[0] === '"' || rawSrc[0] === "'") &&
            rawSrc[rawSrc.length - 1] === rawSrc[0]
              ? rawSrc.slice(1, -1)
              : rawSrc;
          const rawText = rawInner.trim();
          const hasEntity = rawText !== text;
          if (text && this.shouldExtract(text, 'template')) {
            extractedStrings.push({
              original: hasEntity ? rawText : text,
              processedMessage: hasEntity ? text : undefined,
              semanticId: '',
              filePath,
              line: attr.loc.start.line + lineOffset,
              column: attr.loc.start.column,
              context: 'template',
              componentType: 'setup',
              isTemplateString: false,
              templateContext: 'static-attribute',
              attributeName: attr.name,
              // 整个 `name="value"` 区间：替换体是 `:name="$t(...)"`，属性名也要换掉。
              // attr.loc 天然覆盖属性名到闭合引号（无引号属性值同样准确），省掉旧实现里
              // 那条要同时容忍单/双/无引号与引号内 padding 的正则。
              startOffset: attr.loc.start.offset,
              sourceSlice: attr.loc.source,
            });
          }
        }
      }
      // 处理动态属性绑定（指令）
      else if (prop.type === 7) {
        // DIRECTIVE
        const directive = prop as DirectiveNode;

        // 处理 v-bind 或 : 绑定的表达式
        if (directive.exp && directive.exp.type === 4) {
          // SIMPLE_EXPRESSION
          const content = directive.exp.content;

          // 检查属性名是否是技术属性
          let isTechnical = false;
          if (directive.arg && directive.arg.type === 4) {
            const argName = (directive.arg as any).content;
            isTechnical = this.isTechnicalAttribute(argName);
          }

          // 如果是技术属性，检查内容是否包含中文
          // 如果包含中文，仍然提取（例如 :type="status === '进行中' ? 'success' : 'info'"）
          if (isTechnical && !FileUtils.containsChinese(content)) {
            continue;
          }

          // 使用 TypeScript AST 解析表达式，提取所有字符串和模板字符串
          await this.extractFromDynamicAttribute(
            content,
            extractedStrings,
            filePath,
            lineOffset,
            directive,
          );
        }
      }
    }
  }

  /**
   * 从动态属性表达式中提取文本
   * @param content - 属性表达式内容
   * @param extractedStrings - 提取的字符串数组
   * @param filePath - 文件路径
   * @param lineOffset - 行偏移量
   * @param directive - 指令节点
   */
  private async extractFromDynamicAttribute(
    content: string,
    extractedStrings: ExtractedString[],
    filePath: string,
    lineOffset: number,
    directive: any,
  ): Promise<void> {
    const trimmed = content.trim();

    // 以表达式上下文解析动态属性表达式（绑定表达式本质是表达式）：避免内联对象字面量
    // `{ '中文key': v }` 被当 Block 解析、其中文 KEY 被误提取。
    const sourceFile = CommonASTUtils.parseExpressionSource(trimmed, 'temp.ts');

    // 仅当整个表达式「就是单个 i18n 调用」时才整体跳过。旧粗筛（以 $t( 开头或含 .t(
    // 即整体 return）会把混合表达式（如 `$t('a') + '：中文后缀'`）连同中文一起漏掉。
    // 收窄为精确的顶层判定后，混合表达式落到下方 AST 逐节点处理：i18n 调用参数内的
    // key 由 isAlreadyInternationalized 保护、不会被重复提取，非调用部分的中文正常提取。
    const existingI18nCall = this.getSingleI18nCallExpression(sourceFile);
    if (existingI18nCall) {
      this.recordRuntimeChineseInI18nCall(
        existingI18nCall,
        sourceFile,
        filePath,
        lineOffset,
        directive.loc.start.line,
        directive.loc.start.column,
      );
      return;
    }

    const visit = async (node: ts.Node): Promise<void> => {
      if (ts.isCallExpression(node) && CommonASTUtils.isCommonI18nCall(node)) {
        this.recordRuntimeChineseInI18nCall(
          node,
          sourceFile,
          filePath,
          lineOffset,
          directive.loc.start.line,
          directive.loc.start.column,
        );
      }
      // 提取字符串字面量
      if (ts.isStringLiteral(node)) {
        const text = node.text;

        // 跳过比较运算符 (===, !==, ==, !=) 中的字符串操作数
        // 比较值应使用与 locale 无关的常量，提取后会导致数据与比较不同步
        // 例如 v-if="userType === 'admin'" 或 :type="status === '进行中' ? ..."
        if (CommonASTUtils.isComparisonOperand(node)) {
          // 中文字面量被跳过：记录到诊断集合，lint 阶段与 locale map 交叉告警。
          // 若同一句中文已在别处（如 script 数组初值）被提取为 i18n key，运行时
          // 切语言后该比较永远不命中 —— 详见 LocaleValueLinter.findHardcodedComparisons。
          if (FileUtils.containsChinese(text)) {
            this.diagnostics.recordSkippedComparisonOperand(
              text,
              filePath,
              directive.loc.start.line + lineOffset,
              directive.loc.start.column,
            );
          }
          return;
        }

        // 经 isExtractableStringLiteral 排除对象字面量 KEY / 模块导入路径（翻译会破坏
        // 数据结构 / 导入），与 script 段、React 端口径一致；再检查是否已在 i18n 调用中。
        if (
          CommonASTUtils.isExtractableStringLiteral(node) &&
          !CommonASTUtils.isAlreadyInternationalized(node) &&
          this.shouldExtract(text, 'template')
        ) {
          const argName =
            directive.arg && directive.arg.type === 4 ? (directive.arg as any).content : '';
          extractedStrings.push({
            original: text,
            semanticId: '',
            filePath,
            line: directive.loc.start.line + lineOffset,
            column: directive.loc.start.column,
            context: 'template',
            componentType: 'setup',
            isTemplateString: false,
            templateContext: 'dynamic-attribute',
            attributeName: argName,
            // 区间取字面量的完整源码（含引号）：替换体 `$t('k')` 自带引号，
            // 只换引号内的内容会留下 `'$t('k')'` 这种嵌套引号。
            startOffset: VueTextExtractor.templateOffsetOfExprNode(
              directive.exp!.loc,
              node,
              sourceFile,
            ),
            sourceSlice: node.getText(sourceFile),
          });
        }
      }
      // 提取模板字符串
      else if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        await this.extractTemplateStringFromDynamicAttribute(
          node,
          sourceFile,
          extractedStrings,
          filePath,
          lineOffset,
          directive,
        );
        // 整段模板已作为单条提取、嵌套中文分支也已记入诊断；不得再递归进子节点，
        // 否则分支字面量（`${cond ? '中文A' : '中文B'}`）会被重复提取成独立 key，
        // 产出孤儿键 + 同位置替换冲突。与脚本路径 visitScriptNode push 后 return 对齐。
        return;
      }

      // forEachChild 只遍历语义子节点（跳过 trivia token），避免 getChildren 物化全量 token
      // 子数组；visit 为 async 不能直接交给 forEachChild，故先同步收集再逐个 await。
      const children: ts.Node[] = [];
      node.forEachChild((c) => {
        children.push(c);
      });
      for (const child of children) {
        await visit(child);
      }
    };

    await visit(sourceFile);
  }

  /**
   * 从动态属性的模板字符串中提取文本
   * @param node - 模板字符串节点
   * @param sourceFile - 源文件
   * @param extractedStrings - 提取的字符串数组
   * @param filePath - 文件路径
   * @param lineOffset - 行偏移量
   * @param directive - 指令节点
   */
  private async extractTemplateStringFromDynamicAttribute(
    node: ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral,
    sourceFile: ts.SourceFile,
    extractedStrings: ExtractedString[],
    filePath: string,
    lineOffset: number,
    directive: any,
  ): Promise<void> {
    let originalText = '';
    let processedText = '';
    let isTemplateString = false;
    const templateVariables: string[] = [];

    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      // 与 script 侧对称：含 HTML 标签的整段模板拒绝提取并告警，避免 HTML/CSS/SVG 灌进 locale value。
      // template 侧此前缺这道守卫，`:content="`<b>加粗</b>提示`"` 会把整段 HTML 提进 locale 且无告警。
      if (
        FileUtils.containsChinese(node.text) &&
        CommonASTUtils.templateLiteralContainsHtmlTags(node.text)
      ) {
        this.warnHtmlInTemplateLiteralAtLine(
          directive.loc.start.line + lineOffset,
          filePath,
          `${directive.loc.start.offset}:${node.getStart(sourceFile)}`,
        );
        return;
      }
      originalText = node.text;
      processedText = node.text;
    } else if (ts.isTemplateExpression(node)) {
      // 复用 CommonASTUtils.processTemplateExpression：与脚本段、React 端走同一份
      // 字面量内联与占位符生成逻辑，避免双端漂移。
      // original 必须存源码层形式（result.originalText，保留 `${expr}` 含字面量插值如 `${'X'}`），
      // 因为 VueTransformer 按 original 在源码做文本匹配替换；processedMessage 存内联后的
      // processedText（供 locale 值 / ID 生成）。两字段约定与脚本路径一致——否则含字面量插值时
      // original=已内联文本与源码失配 → 整段绑定不被替换、源码残留中文（静默泄漏）。
      if (CommonASTUtils.templateLiteralsContainChinese(node)) {
        // 与 script 侧对称的 HTML 守卫：含 HTML 标签整段拒绝提取并告警。
        if (CommonASTUtils.templateLiteralContainsHtmlTags(node.getText(sourceFile))) {
          this.warnHtmlInTemplateLiteralAtLine(
            directive.loc.start.line + lineOffset,
            filePath,
            `${directive.loc.start.offset}:${node.getStart(sourceFile)}`,
          );
          return;
        }
        const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
        originalText = result.originalText;
        processedText = result.processedText;
        templateVariables.push(...result.templateVariables);
        isTemplateString = true;
        // 插值表达式里的中文分支被占位符吞掉（不提取/不内联）—— 记录诊断，避免静默泄漏。
        const nestedNodes = CommonASTUtils.collectNestedChineseLiteralNodes(node);
        for (const [nestedIndex, nested] of result.nestedChineseTexts.entries()) {
          const occurrence = nestedNodes[nestedIndex]?.getStart(sourceFile) ?? nestedIndex;
          this.diagnostics.recordSkippedNestedChinese(
            nested,
            filePath,
            directive.loc.start.line + lineOffset,
            directive.loc.start.column,
            occurrence,
          );
          this.recordManualSkip({
            category: 'nested-interpolation',
            message: `${filePath}:${directive.loc.start.line + lineOffset}:${directive.loc.start.column}:${occurrence}:${nested}`,
            count: 1,
          });
        }
      }
    }

    if (originalText && this.shouldExtract(processedText || originalText, 'template')) {
      const argName =
        directive.arg && directive.arg.type === 4 ? (directive.arg as any).content : '';
      extractedStrings.push({
        original: originalText,
        processedMessage: processedText !== originalText ? processedText : undefined,
        semanticId: '',
        filePath,
        line: directive.loc.start.line + lineOffset,
        column: directive.loc.start.column,
        context: 'template',
        componentType: 'setup',
        isTemplateString,
        templateVariables: templateVariables.length > 0 ? templateVariables : undefined,
        templateContext: 'dynamic-attribute',
        attributeName: argName,
        // 区间是整个模板字面量（含反引号）。注意不能用 originalText 当 sourceSlice：
        // processTemplateExpression 重建 originalText 时把 `${ n }` 归一成 `${n}`，
        // 与源码逐字不等；node.getText 才是逐字原文。
        startOffset: VueTextExtractor.templateOffsetOfExprNode(directive.exp.loc, node, sourceFile),
        sourceSlice: node.getText(sourceFile),
      });
    }
  }

  /**
   * 从插值表达式中提取文本
   * @param interpolationNode - 插值节点
   * @param extractedStrings - 提取的字符串数组
   * @param filePath - 文件路径
   * @param lineOffset - 行偏移量
   */
  private async extractFromInterpolation(
    interpolationNode: InterpolationNode,
    extractedStrings: ExtractedString[],
    filePath: string,
    lineOffset: number,
  ): Promise<void> {
    if (interpolationNode.content.type === 4) {
      // SIMPLE_EXPRESSION
      const content = interpolationNode.content.content.trim();

      // 以表达式上下文解析插值内容：准确提取三元表达式中的字符串（含模板字符串），
      // 并让内联对象字面量 `{ '中文key': v }` 正确成形（避免中文 KEY 被误提取）。
      const sourceFile = CommonASTUtils.parseExpressionSource(content, 'temp.ts');

      // 仅当整个插值「就是单个 i18n 调用」时才整体跳过。旧粗筛（以 $t( 开头或含 .t(
      // 即整体 return）会把 `$t('a') + '：中文后缀'`、`obj.t(x) ? '进行中' : '已结束'`
      // 这类混合/三元表达式里的中文一起漏掉。收窄后交给下方 AST 逐节点处理。
      const existingI18nCall = this.getSingleI18nCallExpression(sourceFile);
      if (existingI18nCall) {
        this.recordRuntimeChineseInI18nCall(
          existingI18nCall,
          sourceFile,
          filePath,
          lineOffset,
          interpolationNode.loc.start.line,
          interpolationNode.loc.start.column,
        );
        return;
      }

      const visit = async (node: ts.Node): Promise<void> => {
        if (ts.isCallExpression(node) && CommonASTUtils.isCommonI18nCall(node)) {
          this.recordRuntimeChineseInI18nCall(
            node,
            sourceFile,
            filePath,
            lineOffset,
            interpolationNode.loc.start.line,
            interpolationNode.loc.start.column,
          );
        }
        // 提取字符串字面量
        if (ts.isStringLiteral(node)) {
          const text = node.text;

          // 跳过比较运算符 (===, !==, ==, !=) 中的字符串操作数
          // 比较值应使用与 locale 无关的常量，提取后会导致数据与比较不同步
          // 例如 {{ status === '进行中' ? '已完成' : '未完成' }}
          if (CommonASTUtils.isComparisonOperand(node)) {
            // 中文字面量被跳过：记录到诊断集合，lint 阶段与 locale map 交叉告警。
            // 与 extractFromDynamicAttribute / script 段 / React 端口径一致，避免插值里
            // 这种最常见的 `{{ x === '中文' ? ... }}` 写法静默漏报「比较失效」风险。
            if (FileUtils.containsChinese(text)) {
              this.diagnostics.recordSkippedComparisonOperand(
                text,
                filePath,
                interpolationNode.loc.start.line + lineOffset,
                interpolationNode.loc.start.column,
              );
            }
            return;
          }

          // 经 isExtractableStringLiteral 排除对象 KEY / 导入路径，与其他提取路径口径一致；
          // 再检查是否已在 i18n 调用中。
          if (
            CommonASTUtils.isExtractableStringLiteral(node) &&
            !CommonASTUtils.isAlreadyInternationalized(node) &&
            this.shouldExtract(text, 'template')
          ) {
            extractedStrings.push({
              original: text,
              semanticId: '',
              filePath,
              line: interpolationNode.loc.start.line + lineOffset,
              column: interpolationNode.loc.start.column,
              context: 'template',
              componentType: 'setup',
              isTemplateString: false,
              templateContext: 'interpolation',
              // 同 dynamic-attribute：区间含引号，整个字面量换成 $t(...)。
              startOffset: VueTextExtractor.templateOffsetOfExprNode(
                interpolationNode.content.loc,
                node,
                sourceFile,
              ),
              sourceSlice: node.getText(sourceFile),
            });
          }
        }
        // 提取模板字符串
        else if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          await this.extractTemplateStringFromInterpolation(
            node,
            sourceFile,
            extractedStrings,
            filePath,
            lineOffset,
            interpolationNode,
          );
          // 同 dynamic-attribute：整段模板已提取、嵌套中文已记诊断，禁止再递归进分支字面量
          // 造成重复提取。与脚本路径对齐。
          return;
        }

        // forEachChild 只遍历语义子节点（跳过 trivia token），避免 getChildren 物化全量 token
        // 子数组；visit 为 async 不能直接交给 forEachChild，故先同步收集再逐个 await。
        const children: ts.Node[] = [];
        node.forEachChild((c) => {
          children.push(c);
        });
        for (const child of children) {
          await visit(child);
        }
      };

      await visit(sourceFile);
    }
  }

  /**
   * 从插值表达式中的模板字符串提取文本
   * @param node - 模板字符串节点
   * @param sourceFile - 源文件
   * @param extractedStrings - 提取的字符串数组
   * @param filePath - 文件路径
   * @param lineOffset - 行偏移量
   * @param interpolationNode - 插值节点
   */
  private async extractTemplateStringFromInterpolation(
    node: ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral,
    sourceFile: ts.SourceFile,
    extractedStrings: ExtractedString[],
    filePath: string,
    lineOffset: number,
    interpolationNode: InterpolationNode,
  ): Promise<void> {
    let originalText = '';
    let processedText = '';
    let isTemplateString = false;
    const templateVariables: string[] = [];

    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      // 与 script / 动态属性侧对称：含 HTML 标签的整段模板拒绝提取并告警。
      if (
        FileUtils.containsChinese(node.text) &&
        CommonASTUtils.templateLiteralContainsHtmlTags(node.text)
      ) {
        this.warnHtmlInTemplateLiteralAtLine(
          interpolationNode.loc.start.line + lineOffset,
          filePath,
          `${interpolationNode.loc.start.offset}:${node.getStart(sourceFile)}`,
        );
        return;
      }
      originalText = node.text;
      processedText = node.text;
    } else if (ts.isTemplateExpression(node)) {
      // 复用 CommonASTUtils.processTemplateExpression（同动态属性段说明）：original 存源码形式
      // （含 `${expr}`）供 VueTransformer 文本匹配，processedMessage 存内联后文本供 locale/ID。
      if (CommonASTUtils.templateLiteralsContainChinese(node)) {
        // 与 script 侧对称的 HTML 守卫：含 HTML 标签整段拒绝提取并告警。
        if (CommonASTUtils.templateLiteralContainsHtmlTags(node.getText(sourceFile))) {
          this.warnHtmlInTemplateLiteralAtLine(
            interpolationNode.loc.start.line + lineOffset,
            filePath,
            `${interpolationNode.loc.start.offset}:${node.getStart(sourceFile)}`,
          );
          return;
        }
        const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
        originalText = result.originalText;
        processedText = result.processedText;
        templateVariables.push(...result.templateVariables);
        isTemplateString = true;
        // 插值表达式里的中文分支被占位符吞掉（不提取/不内联）—— 记录诊断，避免静默泄漏。
        const nestedNodes = CommonASTUtils.collectNestedChineseLiteralNodes(node);
        for (const [nestedIndex, nested] of result.nestedChineseTexts.entries()) {
          const occurrence = nestedNodes[nestedIndex]?.getStart(sourceFile) ?? nestedIndex;
          this.diagnostics.recordSkippedNestedChinese(
            nested,
            filePath,
            interpolationNode.loc.start.line + lineOffset,
            interpolationNode.loc.start.column,
            occurrence,
          );
          this.recordManualSkip({
            category: 'nested-interpolation',
            message: `${filePath}:${interpolationNode.loc.start.line + lineOffset}:${interpolationNode.loc.start.column}:${occurrence}:${nested}`,
            count: 1,
          });
        }
      }
    }

    // 提取
    if (originalText && this.shouldExtract(processedText || originalText, 'template')) {
      extractedStrings.push({
        original: originalText,
        processedMessage: processedText !== originalText ? processedText : undefined,
        semanticId: '',
        filePath,
        line: interpolationNode.loc.start.line + lineOffset,
        column: interpolationNode.loc.start.column,
        context: 'template',
        componentType: 'setup',
        isTemplateString,
        templateVariables: templateVariables.length > 0 ? templateVariables : undefined,
        templateContext: 'interpolation',
        // 同 dynamic-attribute 的模板字面量分支：区间含反引号，sourceSlice 用逐字原文。
        startOffset: VueTextExtractor.templateOffsetOfExprNode(
          interpolationNode.content.loc,
          node,
          sourceFile,
        ),
        sourceSlice: node.getText(sourceFile),
      });
    }
  }

  /**
   * 从 Vue script 中提取字符串
   * @param scriptContent - script 内容
   * @param filePath - 文件路径
   * @param lineOffset - 行偏移量
   * @returns 提取的字符串数组
   */
  private async extractFromScript(
    scriptContent: string,
    filePath: string,
    lineOffset: number,
  ): Promise<ExtractedString[]> {
    const extractedStrings: ExtractedString[] = [];

    try {
      const sourceFile = CommonASTUtils.parseSourceFile(scriptContent, filePath);

      // filePath 必须从入参透传到 push 处，不能用 sourceFile.fileName。
      // ts.createSourceFile 内部会对 fileName 调用 normalizePath，将 Windows 反
      // 斜杠转换成正斜杠；template 路径用的是入参（反斜杠），两边不一致会让上
      // 游的 `new Set(extractedStrings.map(s => s.filePath))` 去重失败，导致同一
      // .vue 文件被 transform 两次（第二次在已被改写的源码上越界，触发 ts
      // Debug Failure）。
      await this.visitScriptNode(sourceFile, sourceFile, extractedStrings, lineOffset, filePath);
    } catch (error) {
      LoggerUtils.error(`解析 script 失败: ${filePath}`, error);
    }

    return extractedStrings;
  }

  /**
   * 访问 script AST 节点
   * @param node - AST 节点
   * @param sourceFile - 源文件
   * @param extractedStrings - 提取的字符串数组
   * @param lineOffset - 行偏移量
   */
  private async visitScriptNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    extractedStrings: ExtractedString[],
    lineOffset: number,
    filePath: string,
  ): Promise<void> {
    if (ts.isCallExpression(node) && CommonASTUtils.isCommonI18nCall(node)) {
      this.recordRuntimeChineseInI18nCall(node, sourceFile, filePath, lineOffset);
    }
    let originalText = ''; // 保持源代码原样（用于转换时匹配）
    let processedText = ''; // 内联字面量后的文本（用于locale和ID）
    let isTemplateString = false;
    const templateVariables: string[] = [];

    // 处理字符串字面量：跳过对象 key、import 路径、比较运算符 / case 操作数
    if (ts.isStringLiteral(node)) {
      if (CommonASTUtils.isExtractableStringLiteral(node)) {
        originalText = node.text;
        processedText = node.text;
      } else if (CommonASTUtils.isComparisonOperand(node) && FileUtils.containsChinese(node.text)) {
        // script 端比较运算符两侧的中文字面量被跳过 —— 与 template 端记录对称，
        // 用于事后与 locale map 交叉，识别「同句中文在他处被 i18n 化导致比较失效」的风险。
        const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
        this.diagnostics.recordSkippedComparisonOperand(
          node.text,
          filePath,
          pos.line + 1 + lineOffset,
          pos.character + 1,
        );
      }
    }
    // 处理模板字符串：复用 CommonASTUtils.processTemplateExpression，
    // 与 React 端走同一份字面量过滤 / 占位符生成逻辑，避免双端漂移。
    else if (ts.isTemplateExpression(node)) {
      if (CommonASTUtils.templateLiteralsContainChinese(node)) {
        // 模板字符串里含 HTML 标签（典型场景：innerHTML = `<div>...<span>中文</span></div>`），
        // 整段提取会把 SVG / CSS / 样式属性一起灌进 i18n value，翻译质量差且多语言下结构不可控。
        // 跳过提取并 warning，由开发者把 t() 缩到具体文案片段上。
        if (CommonASTUtils.templateLiteralContainsHtmlTags(node.getText(sourceFile))) {
          this.warnHtmlInTemplateLiteral(node, sourceFile, lineOffset, filePath);
          return;
        }
        const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
        originalText = result.originalText;
        processedText = result.processedText;
        templateVariables.push(...result.templateVariables);
        isTemplateString = true;
        // 插值表达式里的中文分支被占位符吞掉（不提取/不内联）—— 记录诊断，避免静默泄漏。
        if (result.nestedChineseTexts.length > 0) {
          const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
          for (const [nestedIndex, nested] of result.nestedChineseTexts.entries()) {
            this.diagnostics.recordSkippedNestedChinese(
              nested,
              filePath,
              pos.line + 1 + lineOffset,
              pos.character + 1,
              nestedIndex,
            );
            this.recordManualSkip({
              category: 'nested-interpolation',
              message: `${filePath}:${pos.line + 1 + lineOffset}:${pos.character + 1}:${nestedIndex}:${nested}`,
              count: 1,
            });
          }
        }
      }
    }
    // 处理无替换模板字符串
    else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      // 同 TemplateExpression：含 HTML 的整段模板拒绝提取，避免 HTML 入 locale value。
      if (
        FileUtils.containsChinese(node.text) &&
        CommonASTUtils.templateLiteralContainsHtmlTags(node.text)
      ) {
        this.warnHtmlInTemplateLiteral(node, sourceFile, lineOffset, filePath);
        return;
      }
      originalText = node.text;
      processedText = node.text;
    }

    // 检查是否需要提取
    if (originalText && this.shouldExtract(processedText || originalText, 'script', node)) {
      const position = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));

      extractedStrings.push({
        original: originalText,
        processedMessage: processedText !== originalText ? processedText : undefined,
        semanticId: '',
        filePath,
        line: position.line + 1 + lineOffset,
        column: position.character + 1,
        context: 'script',
        componentType: 'setup',
        isTemplateString,
        templateVariables: templateVariables.length > 0 ? templateVariables : undefined,
      });
      return;
    }

    // 递归处理子节点：forEachChild 只遍历语义子节点（跳过 trivia token），避免 getChildren
    // 物化含全部 token 的子数组、也不会为 token 多创建一层 visit 调用。visitScriptNode 为
    // async，forEachChild 不会 await 回调，故先同步收集再逐个 await。
    const children: ts.Node[] = [];
    node.forEachChild((c) => {
      children.push(c);
    });
    for (const child of children) {
      await this.visitScriptNode(child, sourceFile, extractedStrings, lineOffset, filePath);
    }
  }

  /**
   * Vue 侧的内置提取规则。外壳（空串 → 本方法 → 业务侧 rejectPatterns）已在
   * BaseTextExtractor.shouldExtract 里固化，此处只负责框架特有部分。
   *
   * @param str - 待检查的字符串
   * @param context - template / script 上下文
   * @param node - AST 节点，用于检查上下文环境
   * @param templateContext - template 内的细分位置（text-node / 属性值等）
   */
  protected shouldExtractInternal(
    str: string,
    context?: 'template' | 'script',
    node?: ts.Node,
    templateContext?: string,
  ): boolean {
    if (node) {
      // 如果节点已经被国际化结构包裹，则不提取
      if (CommonASTUtils.isAlreadyInternationalized(node)) {
        return false;
      }
      // 如果字符串在console调用中，不提取
      if (CommonASTUtils.isInConsoleCall(node)) {
        return false;
      }
    }

    // 如果字符串包含中文，则提取。
    //
    // 不过滤"短碎片 + 标点"型残渣（如 "吧！" "嗯。" "哦~"）：句尾片段（如「开启你的学习
    // 计划<span>…</span>吧！」末尾的"吧！"）是必须翻译的句尾语气词，过滤会导致线上残留中文。
    // 故"宁多勿漏"：让句尾片段进入提取流程，即便 LLM 翻不好也只是 untranslated.json 多一项
    // 噪音，不会导致线上漏翻。
    if (FileUtils.containsChinese(str)) {
      return true;
    }

    // 过滤不可翻译的技术文本（URL、版本号、CSS 值、邮箱、纯符号等）
    // 注意：必须放在 text-node 短路之前，否则 <p>18px</p> / <p>foo@bar.com</p>
    // 这类纯技术值会被当作"用户可见文本"提取出来。
    if (isNonTranslatableText(str)) {
      return false;
    }

    // 模板文本节点中的内容默认视为用户可见文本，跳过技术值过滤直接提取
    if (templateContext === 'text-node') {
      return true;
    }

    // 过滤技术值（Element Plus 等组件库的配置值）
    if (isTechnicalConfigValue(str)) {
      return false;
    }

    // 英文字符串的判断逻辑
    // 仅 template 文本节点中的纯英文文本才视为面向用户的可见文案；
    // 属性值（即便是 template 上下文）是 ID 引用 / 类名 / 配置值的概率更高，
    // 不应仅凭"含字母"就提取——例如 aria-labelledby="nav-title"、role="button"。
    if (/[a-zA-Z]/.test(str)) {
      if (context === 'template' && templateContext === 'text-node') {
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * 判断表达式是否是 Vue i18n 的调用
   * @param expression - 表达式字符串
   * @returns 是否是 i18n 调用
   */
  /**
   * 精确判定：解析后的表达式「整体就是单个 i18n 调用」（$t('k') / t('k') / this.$t('k') / obj.t('k')）。
   *
   * 用于替代 isVueI18nCall 字符串粗筛在提取入口处的整体跳过判定：粗筛只要以 $t( 开头或含 .t(
   * 即整体 return，会误吞混合表达式（`$t('a') + '中文'`、`obj.t(x) ? '中A' : '中B'`）里的中文。
   * parseExpressionSource 会把片段包一层括号，故顶层是单个 ExpressionStatement → 括号表达式。
   */
  private getSingleI18nCallExpression(sourceFile: ts.SourceFile): ts.CallExpression | undefined {
    if (sourceFile.statements.length !== 1) return undefined;
    const stmt = sourceFile.statements[0]!;
    if (!ts.isExpressionStatement(stmt)) return undefined;
    let expr: ts.Expression = stmt.expression;
    while (ts.isParenthesizedExpression(expr)) {
      expr = expr.expression;
    }
    if (!ts.isCallExpression(expr)) return undefined;
    return CommonASTUtils.isCommonI18nCall(expr) ? expr : undefined;
  }

  /** 增量重跑时记录 t/$t 的 values/options 参数中仍残留的中文。 */
  private recordRuntimeChineseInI18nCall(
    call: ts.CallExpression,
    sourceFile: ts.SourceFile,
    filePath: string,
    lineOffset: number,
    baseLine = 1,
    baseColumn = 0,
  ): void {
    for (const item of CommonASTUtils.collectRuntimeChineseLiteralsFromI18nCall(call)) {
      const pos = ts.getLineAndCharacterOfPosition(sourceFile, item.node.getStart(sourceFile));
      this.diagnostics.recordSkippedNestedChinese(
        item.text,
        filePath,
        baseLine + pos.line + lineOffset,
        (pos.line === 0 ? baseColumn : 0) + pos.character + 1,
      );
    }
  }

  private isVueI18nCall(expression: string): boolean {
    const trimmed = expression.trim();

    // 检查是否以 $t( 或 t( 开头（支持可能的空格）
    // 匹配: $t('...'), t('...'), $t ('...'), this.$t('...')
    if (/^(\$t|t)\s*\(/.test(trimmed)) {
      return true;
    }

    // 匹配对象方法调用: this.$t(...), obj.$t(...), obj.t(...)
    if (/\.\s*(\$t|t)\s*\(/.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * 输出「含 HTML 模板字符串拒绝提取」的 warning，附文件路径与行号。
   *
   * 不抛错——只跳过本节点提取，让 generate 流程继续处理其他节点，避免整文件失败。
   * 用户拿到 warning 后应手动把 t() 缩到具体的中文片段上。
   *
   * 同步走 LoggerUtils（即时反馈）与 BaseTextExtractor.recordWarning（落盘留痕）。
   */
  private warnHtmlInTemplateLiteral(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    lineOffset: number,
    filePath: string,
  ): void {
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    this.warnHtmlInTemplateLiteralAtLine(
      pos.line + 1 + lineOffset,
      filePath,
      node.getStart(sourceFile),
    );
  }

  /**
   * 「含 HTML 模板字符串拒绝提取」warning 的行号变体。
   *
   * template 侧（动态属性 / 插值）的模板字符串是用 parseExpressionSource 单独解析的临时
   * sourceFile，节点位置相对该临时片段而非 SFC，无法直接算出真实行号；改由调用方传入
   * 指令 / 插值节点的真实行号（loc.start.line + lineOffset），复用与 script 侧同一文案。
   */
  private warnHtmlInTemplateLiteralAtLine(
    line: number,
    filePath: string,
    sourceOffset?: string | number,
  ): void {
    const msg =
      `⚠️ 跳过含 HTML 标签的模板字符串提取：${FileUtils.getRelativePath(filePath)}:${line}\n` +
      `   原因：整段提取会把 HTML / CSS / SVG 灌进 i18n value，多语言下样式结构不可控。\n` +
      `   建议：把 t() 调用缩到具体中文文案上，例如\n` +
      `     \`<span>\${t('key')}</span>\` 替代 \`t('key')\` 包整个 \`<div>...</div>\``;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
    this.recordManualSkip({
      category: 'html-template',
      message: msg,
      count: 1,
      dedupeKey: `${filePath}:${sourceOffset ?? line}`,
    });
  }

  /**
   * 输出「技术属性里的中文被跳过」warning。
   *
   * 只走 recordWarning 不走 recordManualSkip：ManualSkipDiagnostic.category 是封闭联合，
   * 现有三档（html-template / class-property / nested-interpolation）语义都不覆盖本场景，
   * 扩枚举需同步改 GenerateProcessor 的映射，收益不足以扩面。
   */
  private warnChineseInTechnicalAttribute(
    attrName: string,
    value: string,
    filePath: string,
    line: number,
  ): void {
    const msg =
      `⚠️ 跳过技术属性中的中文：${FileUtils.getRelativePath(filePath)}:${line} ` +
      `${attrName}="${value}"\n` +
      `   原因：该属性名在技术属性名单内，翻译其值可能破坏运行时逻辑（枚举值 / 表单字段名 / 引用 ID）。\n` +
      `   建议：确认该值确实是面向用户的文案时，手动改用绑定形式（如 :${attrName}="$t('key')"）。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
  }
}
