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
import { FileUtils } from '../../utils/file-utils';
import { LoggerUtils } from '../../utils/logger';
import type { ExtractedString } from '../../utils/types';
import { BaseTextExtractor } from '../base';
import type { VueI18nLibrary } from './libraries';

/**
 * Vue 文本提取器
 * 负责从 Vue 文件中提取需要国际化的文本
 */
export class VueTextExtractor extends BaseTextExtractor {
  constructor(_library: VueI18nLibrary, rejectPatterns: readonly RegExp[] = []) {
    super(rejectPatterns);
  }
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

        if (text && this.shouldExtract(text, 'template', undefined, 'text-node')) {
          extractedStrings.push({
            original: text,
            semanticId: '',
            filePath,
            line: textNode.loc.start.line + lineOffset,
            column: textNode.loc.start.column,
            context: 'template',
            componentType: 'setup', // Vue 默认使用 setup
            isTemplateString: false,
            templateContext: 'text-node',
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

    let synthetic = '`';
    let originalSrc = '';
    const templateVariables: string[] = [];

    for (const n of group) {
      if (n.type === 2) {
        const textNode = n as TextNode;
        synthetic += textNode.content;
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

      synthetic += '${' + expr + '}';
      originalSrc += interp.loc.source;
      templateVariables.push(expr);
    }
    synthetic += '`';

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
      column: first.loc.start.column,
      context: 'template',
      componentType: 'setup',
      isTemplateString: true,
      templateVariables,
      templateContext: 'mixed-content',
    });
    return true;
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
      'v-',
      ':',
      '@',
      '#', // Vue 指令前缀
    ];

    // 检查是否匹配技术属性
    if (technicalAttrs.some((tech) => attrName.startsWith(tech) || attrName === tech)) {
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
          continue;
        }

        if (attr.value && attr.value.content) {
          const text = attr.value.content.trim();
          if (text && this.shouldExtract(text, 'template')) {
            extractedStrings.push({
              original: text,
              semanticId: '',
              filePath,
              line: attr.loc.start.line + lineOffset,
              column: attr.loc.start.column,
              context: 'template',
              componentType: 'setup',
              isTemplateString: false,
              templateContext: 'static-attribute',
              attributeName: attr.name,
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

    // 跳过已经国际化的调用（如 $t('...') 或 t('...')）
    if (this.isVueI18nCall(trimmed)) {
      return;
    }

    // 使用 TypeScript AST 解析动态属性表达式
    const sourceFile = CommonASTUtils.parseSourceFile(trimmed, 'temp.ts');

    const visit = async (node: ts.Node): Promise<void> => {
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
            CommonASTUtils.recordSkippedComparisonOperand(
              text,
              filePath,
              directive.loc.start.line + lineOffset,
              directive.loc.start.column,
            );
          }
          return;
        }

        // 检查该节点是否已经在国际化调用中（如 $t('...') 或 t('...')）
        if (
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
      }

      // 收集子节点后逐个 await，避免 forEachChild 丢弃 Promise
      for (const child of node.getChildren()) {
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
    let text = '';
    let isTemplateString = false;
    const templateVariables: string[] = [];

    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      text = node.text;
    } else if (ts.isTemplateExpression(node)) {
      // 复用 CommonASTUtils.processTemplateExpression：与脚本段、React 端走同一份
      // 字面量内联与占位符生成逻辑，避免双端漂移。
      // template 段保留"内联字面量后的 text"用作 original（与原内联实现行为一致），
      // 因为 VueTransformer 通过 line/column 定位、不需要按 original 文本匹配源码。
      if (CommonASTUtils.templateLiteralsContainChinese(node)) {
        const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
        text = result.processedText;
        templateVariables.push(...result.templateVariables);
        isTemplateString = true;
      }
    }

    if (text && this.shouldExtract(text, 'template')) {
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
        isTemplateString,
        templateVariables: templateVariables.length > 0 ? templateVariables : undefined,
        templateContext: 'dynamic-attribute',
        attributeName: argName,
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

      // 跳过已经国际化的调用（如 $t('...') 或 t('...')）
      if (this.isVueI18nCall(content)) {
        return;
      }

      // 使用TypeScript AST解析插值表达式内容
      // 这样可以准确提取三元表达式中的字符串（包括模板字符串）
      const sourceFile = CommonASTUtils.parseSourceFile(content, 'temp.ts');

      const visit = async (node: ts.Node): Promise<void> => {
        // 提取字符串字面量
        if (ts.isStringLiteral(node)) {
          const text = node.text;
          // 检查该节点是否已经在国际化调用中（如 $t('...') 或 t('...')）
          if (
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
        }

        // 收集子节点后逐个 await，避免 forEachChild 丢弃 Promise
        for (const child of node.getChildren()) {
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
    let text = '';
    let isTemplateString = false;
    const templateVariables: string[] = [];

    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      text = node.text;
    } else if (ts.isTemplateExpression(node)) {
      // 复用 CommonASTUtils.processTemplateExpression（同动态属性段说明）
      if (CommonASTUtils.templateLiteralsContainChinese(node)) {
        const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
        text = result.processedText;
        templateVariables.push(...result.templateVariables);
        isTemplateString = true;
      }
    }

    // 提取
    if (text && this.shouldExtract(text, 'template')) {
      extractedStrings.push({
        original: text,
        semanticId: '',
        filePath,
        line: interpolationNode.loc.start.line + lineOffset,
        column: interpolationNode.loc.start.column,
        context: 'template',
        componentType: 'setup',
        isTemplateString,
        templateVariables: templateVariables.length > 0 ? templateVariables : undefined,
        templateContext: 'interpolation',
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
        CommonASTUtils.recordSkippedComparisonOperand(
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

    // 递归处理子节点
    const children = node.getChildren();
    for (const child of children) {
      await this.visitScriptNode(child, sourceFile, extractedStrings, lineOffset, filePath);
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
    context: 'template' | 'script',
    node?: ts.Node,
    templateContext?: string,
  ): boolean {
    // 工具内置规则先判定。规则放行后才让业务侧 rejectPatterns 兜底拒收——
    // 反之会让用户黑名单越过 isComparisonOperand / isInConsoleCall 等安全规则。
    const passInternal = this.shouldExtractInternal(str, context, node, templateContext);
    if (!passInternal) return false;
    return !this.isRejectedByConfig(str);
  }

  private shouldExtractInternal(
    str: string,
    context: 'template' | 'script',
    node?: ts.Node,
    templateContext?: string,
  ): boolean {
    // 基本过滤条件
    if (!str.trim()) return false;

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
    // 注意：曾尝试过滤"短碎片 + 标点"型残渣（如 "吧！" "嗯。" "哦~"），理由是
    // `<p>{{ msg }}吧！</p>` 这类被 AST 切出的尾巴文本节点 LLM 难翻译，会沉到
    // untranslated.json 里。但实践中误伤了真实文案——例如「开启你的学习计划<span>
    // …</span>吧！」里末尾"吧！"是必须翻译的句尾语气词，过滤后线上残留中文。
    // 权衡下选择"宁多勿漏"：让句尾片段进入提取流程，即便 LLM 翻不好也只是
    // untranslated.json 多一项噪音，不会导致线上漏翻。
    if (FileUtils.containsChinese(str)) {
      return true;
    }

    // 过滤不可翻译的技术文本（URL、版本号、CSS 值、邮箱、纯符号等）
    // 注意：必须放在 text-node 短路之前，否则 <p>18px</p> / <p>foo@bar.com</p>
    // 这类纯技术值会被当作"用户可见文本"提取出来。
    if (this.isNonTranslatableText(str)) {
      return false;
    }

    // 模板文本节点中的内容默认视为用户可见文本，跳过技术值过滤直接提取
    if (templateContext === 'text-node') {
      return true;
    }

    // 过滤技术值（Element Plus 等组件库的配置值）
    if (this.isTechnicalValue(str)) {
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
   * 判断字符串是否是技术值（组件库的配置值，不需要国际化）
   * @param str - 待检查的字符串
   * @returns 是否是技术值
   */
  private isTechnicalValue(str: string): boolean {
    const technicalValues = [
      // Element Plus type 属性值
      'primary',
      'success',
      'warning',
      'danger',
      'info',
      'text',
      'error',
      // Element Plus size 属性值
      'large',
      'default',
      'small',
      'mini',
      // 位置相关
      'top',
      'bottom',
      'left',
      'right',
      'center',
      'top-start',
      'top-end',
      'bottom-start',
      'bottom-end',
      'left-start',
      'left-end',
      'right-start',
      'right-end',
      // 主题和效果
      'dark',
      'light',
      'plain',
      // 其他常见配置值
      'always',
      'hover',
      'never',
      'click',
      'focus',
      'manual',
      'horizontal',
      'vertical',
      'card',
      'border-card',
      // 布尔值字符串形式（虽然通常用 boolean，但有时会用字符串）
      'true',
      'false',
    ];

    return technicalValues.includes(str.toLowerCase());
  }

  /**
   * 判断字符串是否是不需要翻译的技术文本
   * 例如 URL、版本号、CSS 值等
   */
  private isNonTranslatableText(str: string): boolean {
    const trimmed = str.trim();

    // URL
    if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) return true;

    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;

    // 版本号: v1.2.3, 1.0.0, 1.0.0-beta.1
    if (/^v?\d+(\.\d+)+(-[\w.]+)?$/.test(trimmed)) return true;

    // CSS 数值: 10px, 1.5rem, 100%, 0.5em
    if (/^\d+(\.\d+)?(px|em|rem|vh|vw|vmin|vmax|%|pt|cm|mm|in|ch|ex)$/i.test(trimmed)) return true;

    // CSS 颜色: #fff, #ffffff, #ffffffaa
    if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return true;

    // CSS 函数: rgb(), rgba(), hsl(), var()
    if (/^(rgb|rgba|hsl|hsla|var)\s*\(/.test(trimmed)) return true;

    // 文件路径: ./foo, ../bar, /path
    if (/^\.{0,2}\/\S+$/.test(trimmed)) return true;

    // 纯符号 / 标点：不含任何字母或数字（兜底）。
    // 例如 → ← × ✓ ··· 这类字符没有翻译意义，但它们既不是 URL 也不是 CSS。
    // 必须放在最后做兜底，确保前面已识别的特定模式不会被这条规则覆盖。
    if (!/[\p{L}\p{N}]/u.test(trimmed)) return true;

    return false;
  }

  /**
   * 判断表达式是否是 Vue i18n 的调用
   * @param expression - 表达式字符串
   * @returns 是否是 i18n 调用
   */
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
    const line = pos.line + 1 + lineOffset;
    const msg =
      `⚠️ 跳过含 HTML 标签的模板字符串提取：${FileUtils.getRelativePath(filePath)}:${line}\n` +
      `   原因：整段提取会把 HTML / CSS / SVG 灌进 i18n value，多语言下样式结构不可控。\n` +
      `   建议：把 t() 调用缩到具体中文文案上，例如\n` +
      `     \`<span>\${t('key')}</span>\` 替代 \`t('key')\` 包整个 \`<div>...</div>\``;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
  }
}
