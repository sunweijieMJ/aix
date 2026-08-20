import fs from 'fs';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { NON_EXTRACTABLE_ELEMENT_TAGS } from '../../utils/constants';
import { ReactASTUtils } from './react-ast-utils';
import { FileUtils } from '../../utils/file-utils';
import { LoggerUtils } from '../../utils/logger';
import type { ExtractedString, MessageInfo } from '../../utils/types';
import { BaseTextExtractor } from '../base';
import type { ReactI18nLibrary } from './libraries';

/**
 * React 文本提取器
 * 负责从 React 文件中提取需要国际化的文本
 */
export class ReactTextExtractor extends BaseTextExtractor {
  private library?: ReactI18nLibrary;

  constructor(library?: ReactI18nLibrary, rejectPatterns: readonly RegExp[] = []) {
    super(rejectPatterns);
    this.library = library;
  }
  /**
   * 从单个文件中提取字符串
   * @param filePath - 文件路径
   * @returns 提取的字符串数组
   */
  async extractFromFile(filePath: string): Promise<ExtractedString[]> {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = CommonASTUtils.parseSourceFile(sourceText, filePath);

    const extractedStrings: ExtractedString[] = [];
    // filePath 必须从入参透传到 push 处，不能用 sourceFile.fileName：
    // ts.createSourceFile 内部会对 fileName 调用 normalizePath，把 Windows 反斜杠
    // 转成正斜杠，与上游传入的原始路径不一致。Vue 端在 extractFromScript 处有同名
    // 规避，参见 VueTextExtractor.ts。
    await this.visitNode(sourceFile, sourceFile, extractedStrings, filePath);
    return extractedStrings;
  }

  // extractFromFiles 由 BaseTextExtractor 提供默认串行实现

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
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'defineMessages') {
      return;
    }

    // 零参 `defineMessages()` 时 arguments[0] 为 undefined；不可用非空断言后直接喂
    // ts.isObjectLiteralExpression(undefined)（内部读 .kind 会抛 TypeError，中断整文件 restore）。
    const arg = node.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) {
      return;
    }

    for (const property of arg.properties) {
      if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
        const messageKey = property.name.text;

        if (ts.isObjectLiteralExpression(property.initializer)) {
          const messageProps = CommonASTUtils.extractObjectLiteralProperties(
            property.initializer,
            sourceFile,
          );
          // 只接受字符串字面量：简写变量值经 shorthand 分支是 {node,text} 对象（动态
          // 描述符），流入 restore 的 normalizeRestoreMessage 会对非字符串抛 TypeError，
          // 与 extractFormatMessageInfo 同口径过滤。
          const messageInfo: MessageInfo = {
            id: typeof messageProps.id === 'string' ? messageProps.id : undefined,
            defaultMessage:
              typeof messageProps.defaultMessage === 'string'
                ? messageProps.defaultMessage
                : undefined,
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
    // 工具内置规则先判定。规则放行后才让业务侧 rejectPatterns 兜底拒收——
    // 反之会让用户黑名单越过 isComparisonOperand / isInConsoleCall 等安全规则。
    if (!this.shouldExtractInternal(str, context, node)) return false;
    return !this.isRejectedByConfig(str);
  }

  private shouldExtractInternal(
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
        : CommonASTUtils.isAlreadyInternationalized(node);
      if (alreadyI18n) {
        return false;
      }
      // 如果字符串在console调用中，不提取
      if (CommonASTUtils.isInConsoleCall(node)) {
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
   * @param extractedStrings - 收集到的提取结果
   * @param filePath - 原始入参路径（不可用 sourceFile.fileName，见 extractFromFile 注释）
   */
  private async visitNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    extractedStrings: ExtractedString[],
    filePath: string,
  ): Promise<void> {
    if (
      ts.isCallExpression(node) &&
      (this.library?.isTranslationCall(node) ?? CommonASTUtils.isCommonI18nCall(node))
    ) {
      for (const item of CommonASTUtils.collectRuntimeChineseLiteralsFromI18nCall(node)) {
        const pos = ts.getLineAndCharacterOfPosition(sourceFile, item.node.getStart(sourceFile));
        CommonASTUtils.recordSkippedNestedChinese(
          item.text,
          filePath,
          pos.line + 1,
          pos.character + 1,
        );
      }
    }

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      this.recordRuntimeChineseInTranslationComponent(node, sourceFile, filePath);
    }

    // <code> / <pre> 内容是逐字代码 / 预格式文本，跳过整棵子树不提取
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName;
      if (
        ts.isIdentifier(tagName) &&
        NON_EXTRACTABLE_ELEMENT_TAGS.has(tagName.text.toLowerCase())
      ) {
        return;
      }
      // 已是翻译组件（<Trans> / <FormattedMessage>）：其 children 是用户手写的已国际化富文本，
      // 整棵跳过。否则下方混合内容分支会把 `<Trans>你好 {name} 欢迎</Trans>` 当未翻译整段提取
      // （该分支不经 isAlreadyInternationalized 守卫），ReactTransformer 据此二次包裹成嵌套
      // <Trans>，在增量重跑 / 对已 i18n 文件运行时破坏源码。
      if (ts.isIdentifier(tagName) && this.library?.isTranslationComponent(tagName.text)) {
        return;
      }
    }

    // 优先处理JSX元素的混合内容
    if (ts.isJsxElement(node)) {
      const mixedContent = this.extractJsxMixedContent(node, sourceFile);
      if (mixedContent) {
        const componentType = ReactASTUtils.getComponentType(node);
        const position = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));

        extractedStrings.push({
          original: mixedContent.text,
          semanticId: '', // 稍后生成
          filePath,
          line: position.line + 1,
          column: position.character + 1,
          context: 'jsx-text',
          componentType,
          isTemplateString: mixedContent.isTemplateString,
          templateVariables:
            mixedContent.templateVariables.length > 0 ? mixedContent.templateVariables : undefined,
        });
        // 插值分支里的嵌套中文记入诊断（与模板字面量路径一致），供 lint/doctor 告警。
        for (const [nestedIndex, nested] of mixedContent.nestedChineseTexts.entries()) {
          CommonASTUtils.recordSkippedNestedChinese(
            nested,
            filePath,
            position.line + 1,
            position.character + 1,
            nestedIndex,
          );
          this.recordManualSkip({
            category: 'nested-interpolation',
            message: `${filePath}:${position.line + 1}:${position.character + 1}:${nestedIndex}:${nested}`,
            count: 1,
          });
        }
        // 处理了混合内容后，跳过子节点的单独处理
        return;
      }
    }

    let text = '';
    let processedMessage: string | undefined;
    let isTemplateString = false;
    const templateVariables: string[] = [];

    // 处理字符串字面量
    if (ts.isStringLiteral(node)) {
      // 跳过对象属性 key、模块导入路径、比较运算符/case 操作数
      if (CommonASTUtils.isExtractableStringLiteral(node)) {
        text = node.text;
      } else if (CommonASTUtils.isComparisonOperand(node) && FileUtils.containsChinese(node.text)) {
        // 比较运算符两侧的中文字面量被跳过 —— 记录到诊断集合，lint 阶段与 locale map
        // 交叉告警，识别「同句中文在他处被 i18n 化导致 === 比较失效」的风险。
        const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
        CommonASTUtils.recordSkippedComparisonOperand(
          node.text,
          filePath,
          pos.line + 1,
          pos.character + 1,
        );
      }
    }
    // 处理模板字符串：复用 CommonASTUtils.processTemplateExpression，
    // 该方法会把字面量插值（'literal'/123/true 等）内联进文本，
    // 仅保留真正的变量表达式作为占位符——与 Vue 端对齐，避免
    // `${'literal'}` 被误当作占位符变量。
    //
    // 重要：text 必须保留源代码形式的 ${...} 占位符，因为后续 ReactTransformer
    // 通过 extracted.original 在源代码中匹配并替换；processedMessage 走 ID
    // 生成与 locale 写入路径，承载字面量内联后的真实文案。
    else if (ts.isTemplateExpression(node)) {
      if (CommonASTUtils.templateLiteralsContainChinese(node)) {
        // 含 HTML 标签的整段模板（如 dangerouslySetInnerHTML 拼装）拒绝提取，
        // 避免 HTML / CSS / SVG 灌进 locale value。详见 Vue 端同名逻辑。
        if (CommonASTUtils.templateLiteralContainsHtmlTags(node.getText(sourceFile))) {
          this.warnHtmlInTemplateLiteral(node, sourceFile);
          return;
        }
        const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
        text = result.originalText;
        if (result.processedText !== result.originalText) {
          processedMessage = result.processedText;
        }
        templateVariables.push(...result.templateVariables);
        isTemplateString = true;
        // 插值表达式里的中文分支被占位符吞掉（不提取/不内联）—— 记录诊断，避免静默泄漏。
        if (result.nestedChineseTexts.length > 0) {
          const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
          for (const [nestedIndex, nested] of result.nestedChineseTexts.entries()) {
            CommonASTUtils.recordSkippedNestedChinese(
              nested,
              filePath,
              pos.line + 1,
              pos.character + 1,
              nestedIndex,
            );
            this.recordManualSkip({
              category: 'nested-interpolation',
              message: `${filePath}:${pos.line + 1}:${pos.character + 1}:${nestedIndex}:${nested}`,
              count: 1,
            });
          }
        }
      }
    }
    // 处理无替换模板字符串
    else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      if (
        FileUtils.containsChinese(node.text) &&
        CommonASTUtils.templateLiteralContainsHtmlTags(node.text)
      ) {
        this.warnHtmlInTemplateLiteral(node, sourceFile);
        return;
      }
      text = node.text;
    }
    // 处理JSX文本
    else if (ts.isJsxText(node)) {
      text = node.text.trim();
    }

    // 检查是否需要提取
    if (text && this.shouldExtract(text, ReactASTUtils.getNodeContext(node), node)) {
      const componentType = ReactASTUtils.getComponentType(node);
      const context = ReactASTUtils.getNodeContext(node);
      const position = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));

      // Bug 2：类组件「非箭头函数属性初始化器」中的字符串（如 `label = '草稿'`、
      // `label = <div title="草稿"/>`）。注入器只为方法体/构造器/访问器/箭头属性注入
      // `const { t } = this.props`，此类初始化器求值时无 t/intl 绑定，替换成裸 t()/intl 会
      // 产出未定义标识符（TS2304）。按全库「宁可漏提取，绝不产出坏代码」原则跳过并告警，
      // 交由人工改写（如挪进 render()/getter，或改用 this.props.t）。jsx-text 走 <Trans>/
      // <FormattedMessage> 组件形态、不依赖 t/intl 绑定，故不在此跳过。
      if (
        componentType === 'class' &&
        context !== 'jsx-text' &&
        ReactASTUtils.isInClassNonArrowPropertyInitializer(node)
      ) {
        this.warnClassPropertyInitializer(node, sourceFile);
        return;
      }

      extractedStrings.push({
        original: text,
        processedMessage,
        semanticId: '', // 稍后生成
        filePath,
        line: position.line + 1,
        column: position.character + 1,
        context,
        componentType,
        isTemplateString,
        templateVariables: templateVariables.length > 0 ? templateVariables : undefined,
      });
      // 提取成功后，不再需要深入访问该节点的子节点
      return;
    }

    // 递归处理子节点：forEachChild 只遍历语义子节点（跳过 trivia token），避免 getChildren
    // 物化含全部 token 的子数组、也不会为 token 多创建一层 visit 调用。visit 为 async，
    // forEachChild 不会 await 回调，故先同步收集再逐个 await。
    const children: ts.Node[] = [];
    node.forEachChild((c) => {
      children.push(c);
    });
    for (const child of children) {
      await this.visitNode(child, sourceFile, extractedStrings, filePath);
    }
  }

  /** 记录 <Trans>/<FormattedMessage> 的 values 属性中仍残留的中文运行时分支。 */
  private recordRuntimeChineseInTranslationComponent(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    sourceFile: ts.SourceFile,
    filePath: string,
  ): void {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (
      !ts.isIdentifier(opening.tagName) ||
      !this.library?.isTranslationComponent(opening.tagName.text)
    ) {
      return;
    }

    const valuesAttribute = opening.attributes.properties.find(
      (property): property is ts.JsxAttribute =>
        ts.isJsxAttribute(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'values',
    );
    const initializer = valuesAttribute?.initializer;
    if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) return;

    for (const literal of CommonASTUtils.collectNestedChineseLiteralNodes(initializer.expression)) {
      const pos = ts.getLineAndCharacterOfPosition(sourceFile, literal.getStart(sourceFile));
      CommonASTUtils.recordSkippedNestedChinese(
        literal.text,
        filePath,
        pos.line + 1,
        pos.character + 1,
      );
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
    nestedChineseTexts: string[];
  } | null {
    const children = node.children;
    if (!children || children.length === 0) {
      return null;
    }

    // 检查是否包含中文文本和表达式的混合内容
    let hasChineseText = false;
    let hasExpression = false;
    let hasElementChild = false;

    for (const child of children) {
      if (ts.isJsxText(child)) {
        const text = child.text.trim();
        if (text && FileUtils.containsChinese(text)) {
          hasChineseText = true;
        }
      } else if (ts.isJsxExpression(child) && child.expression) {
        hasExpression = true;
      } else if (
        ts.isJsxElement(child) ||
        ts.isJsxSelfClosingElement(child) ||
        ts.isJsxFragment(child)
      ) {
        // 嵌套元素子节点：下方混合内容构建循环只覆盖 JsxText / JsxExpression，
        // 无法表达嵌套元素。若强行走混合内容路径，nested 元素及其文本会被静默
        // 丢弃，且 ReactTransformer 会替换整个 children 区间（连带删除嵌套元素）
        // —— 不可恢复的数据丢失。标记后退出混合内容提取（见下）。
        hasElementChild = true;
      }
    }

    // 只有当包含中文文本且有表达式时，才进行混合内容处理
    if (!hasChineseText || !hasExpression) {
      return null;
    }

    // 含嵌套元素子节点时放弃混合内容提取，返回 null 交回 visitNode 的子节点递归，
    // 让 JsxText / 嵌套元素各自独立提取与转换。宁可生成多个碎片 key，也不破坏
    // 源码结构 / 丢失嵌套中文。真正的 <Trans> 富文本映射作为后续增强另行实现。
    if (hasElementChild) {
      return null;
    }

    // 构建模板字符串格式的文本（使用${expression}格式）
    let inner = '';
    const templateVariables: string[] = [];
    const nestedChineseTexts: string[] = [];

    for (const child of children) {
      if (ts.isJsxText(child)) {
        // 纯空白 JsxText：仅当【含换行】时跳过——JSX 语义下含换行的纯空白会被折叠删除；
        // 不含换行的纯空白（相邻插值间的单个空格，如「{a} {b}」）会保留渲染，跳过会丢失
        // 词间空格 → 与转换端重建结果不一致导致漏替换。含内容的把换行+缩进压成单空格，
        // 保留文本与表达式之间的语义空格（如「共 {count} 项」的相邻空格是词间距，
        // trim 掉会让 locale 文案变成「共${count}项」，中英混排丢词间距）。
        // ⚠️ 此空白处理必须与 CommonASTUtils.reconstructJsxMixedContent 逐字一致。
        if (!child.text.trim() && /\n/.test(child.text)) continue;
        inner += child.text.replace(/\s*\n\s*/g, ' ');
      } else if (ts.isJsxExpression(child) && child.expression) {
        const expressionText = CommonASTUtils.nodeToText(child.expression!, sourceFile);
        templateVariables.push(expressionText);
        inner += `\${${expressionText}}`;
        // 插值表达式里的中文分支（如 `{ok ? '成功' : '失败'}`）被整段当运行时变量塞进
        // 占位符，既不提取也不内联 —— 与模板字面量路径对齐，记录到诊断集合避免静默泄漏。
        nestedChineseTexts.push(...CommonASTUtils.collectNestedChineseLiterals(child.expression));
      }
    }

    // 整体首尾去空白（内部词间距保留）：边界换行/缩进会被压成首尾空格，不应进 locale。
    // 必须与 CommonASTUtils.reconstructJsxMixedContent 的 trim 一致，否则
    // findExactStringNode 的 `=== originalText` 失配 → 漏替换。
    const templateText = '`' + inner.trim() + '`';

    return {
      text: templateText,
      isTemplateString: true,
      templateVariables,
      nestedChineseTexts,
    };
  }

  /**
   * 输出「含 HTML 模板字符串拒绝提取」的 warning，附文件路径与行号。
   * 与 VueTextExtractor 行为一致：仅跳过本节点，不抛错；同时走 console 与 RunReport。
   */
  private warnHtmlInTemplateLiteral(node: ts.Node, sourceFile: ts.SourceFile): void {
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const line = pos.line + 1;
    const msg =
      `⚠️ 跳过含 HTML 标签的模板字符串提取：${FileUtils.getRelativePath(sourceFile.fileName)}:${line}\n` +
      `   原因：整段提取会把 HTML / CSS / SVG 灌进 i18n value，多语言下样式结构不可控。\n` +
      `   建议：把 t() 调用缩到具体中文文案上。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
    this.recordManualSkip({
      category: 'html-template',
      message: msg,
      count: 1,
      dedupeKey: `${sourceFile.fileName}:${node.getStart(sourceFile)}`,
    });
  }

  /**
   * 输出「类组件非箭头属性初始化器跳过提取」的 warning（Bug 2），附文件路径与行号。
   * 仅跳过本节点、不抛错；同时走 console 与 RunReport，供 doctor / lint 汇总人工处理。
   */
  private warnClassPropertyInitializer(node: ts.Node, sourceFile: ts.SourceFile): void {
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const line = pos.line + 1;
    const msg =
      `⚠️ 跳过类组件属性初始化器中的文案提取：${FileUtils.getRelativePath(sourceFile.fileName)}:${line}\n` +
      `   原因：类字段初始化时无 t/intl 绑定（注入器只处理方法体/构造器/访问器/箭头属性），\n` +
      `        直接替换会产出未定义标识符（TS2304）。\n` +
      `   建议：把文案挪进 render()/方法/getter，或改用 this.props.t / this.props.intl。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
    this.recordManualSkip({
      category: 'class-property',
      message: msg,
      count: 1,
      dedupeKey: `${sourceFile.fileName}:${node.getStart(sourceFile)}`,
    });
  }
}
