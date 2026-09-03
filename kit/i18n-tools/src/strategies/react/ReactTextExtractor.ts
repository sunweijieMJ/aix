import fs from 'fs';
import ts from 'typescript';
import {
  extractObjectLiteralProperties,
  nodeToText,
  normalizeJsxTextSegment,
  parseSourceFile,
} from '../../utils/ast-core';
import {
  collectNestedChineseLiteralNodes,
  collectNestedChineseLiterals,
  collectRuntimeChineseLiteralsFromI18nCall,
  isAlreadyInternationalized,
  isCommonI18nCall,
  isComparisonOperand,
  isExtractableStringLiteral,
  isInConsoleCall,
  templateLiteralContainsHtmlTags,
  templateLiteralsContainChinese,
} from '../../utils/ast-guards';
import { processTemplateExpression } from '../../utils/message-shape';
import { NON_EXTRACTABLE_ELEMENT_TAGS } from '../../utils/constants';
import { decodeJsxEntities } from './jsx-entities';
import { ReactASTUtils, type ConflictingBindingOptions } from './react-ast-utils';
import { FileUtils } from '../../utils/file-utils';
import { LoggerUtils } from '../../utils/logger';
import { isNonTranslatableText } from '../../utils/text-classify';
import type { ExtractedString, MessageInfo } from '../../utils/types';
import { BaseTextExtractor } from '../base';
import type { ReactI18nLibrary } from './libraries';

/**
 * React 文本提取器
 * 负责从 React 文件中提取需要国际化的文本
 */
export class ReactTextExtractor extends BaseTextExtractor {
  private library?: ReactI18nLibrary;
  /** 工具注入全局 `t` 的模块路径；该路径下的同名导入是 i18n 来源，不算冲突绑定。 */
  private tImport?: string;

  constructor(
    library?: ReactI18nLibrary,
    rejectPatterns: readonly RegExp[] = [],
    tImport?: string,
  ) {
    super(rejectPatterns);
    this.library = library;
    this.tImport = tImport;
  }
  /**
   * 从单个文件中提取字符串
   * @param filePath - 文件路径
   * @returns 提取的字符串数组
   */
  async extractFromFile(filePath: string): Promise<ExtractedString[]> {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = parseSourceFile(sourceText, filePath);

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
          const messageProps = extractObjectLiteralProperties(property.initializer, sourceFile);
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
   * React 侧的内置提取规则。外壳（空串 → 本方法 → 业务侧 rejectPatterns）已在
   * BaseTextExtractor.shouldExtract 里固化，此处只负责框架特有部分。
   *
   * @param str - 待检查的字符串
   * @param context - jsx-text / jsx-attribute / js-code
   * @param node - AST 节点，用于检查上下文环境
   */
  protected shouldExtractInternal(
    str: string,
    context?: 'jsx-text' | 'jsx-attribute' | 'js-code',
    node?: ts.Node,
  ): boolean {
    if (node) {
      // 如果节点已经被国际化结构包裹，则不提取
      const alreadyI18n = this.library
        ? this.library.isAlreadyInternationalized(node)
        : isAlreadyInternationalized(node);
      if (alreadyI18n) {
        return false;
      }
      // 如果字符串在console调用中，不提取
      if (isInConsoleCall(node)) {
        return false;
      }
    }

    // 如果字符串包含中文，则提取
    if (FileUtils.containsChinese(str)) {
      return true;
    }

    // 过滤不可翻译的技术文本（URL、版本号、CSS 值、邮箱、纯符号等）。
    // 必须放在下面 jsx-text 短路之前，否则 <p>18px</p> / <p>https://a.com</p>
    // 这类纯技术值会被当作"用户可见文本"提取出来送去翻译。判据必须与 Vue 端同源
    // （text-classify），两端各写一套会让同一个字符串在不同框架下判定相反。
    if (isNonTranslatableText(str)) {
      return false;
    }

    // 英文字符串的判断逻辑
    if (/[a-zA-Z]/.test(str)) {
      // 如果是JSX文本，直接提取
      if (context === 'jsx-text') {
        return true;
      }
      return false;
    }

    // 不接 isTechnicalConfigValue（Vue 端有）：那道闸只对属性值生效，而 React 端
    // 非 jsx-text 的含字母字符串在上一步已一律返回 false，接上去恒不可达。
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
      (this.library?.isTranslationCall(node) ?? isCommonI18nCall(node))
    ) {
      for (const item of collectRuntimeChineseLiteralsFromI18nCall(node)) {
        const pos = ts.getLineAndCharacterOfPosition(sourceFile, item.node.getStart(sourceFile));
        this.diagnostics.recordSkippedNestedChinese(
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

    // 内建 <code> / <pre> 内容是逐字代码 / 预格式文本，跳过整棵子树不提取。
    // 必须先过 isIntrinsicJsxTag：NON_EXTRACTABLE_ELEMENT_TAGS 描述的是 HTML 原生标签，
    // 而设计系统里首字母大写的 `<Code>` / `<Pre>` 是普通组件，其 children 与属性文案照常提取。
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName;
      if (
        ts.isIdentifier(tagName) &&
        ReactASTUtils.isIntrinsicJsxTag(tagName.text) &&
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

    // 优先处理 JSX 元素 / Fragment 的混合内容。Fragment（`<>共 {count} 项</>`）同样是
    // 「文本 + 插值」的宿主，只判 JsxElement 会让它退回子节点递归、拆成「共」「项」两个碎 key。
    // 上方 <code>/<pre> 与翻译组件两道守卫依赖 openingElement.tagName，Fragment 无标签名、
    // 不可能命中，故直接进混合内容判定。
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const mixedContent = this.extractJsxMixedContent(node, sourceFile, filePath);
      // 与其余提取点同口径过一遍 shouldExtract：合成串直接 push 会绕过业务侧
      // config.extract.filterPatterns，用户黑名单对混合内容形同虚设（Vue 端同款合成串已过闸）。
      if (mixedContent && this.shouldExtract(mixedContent.text, 'jsx-text')) {
        const componentType = ReactASTUtils.getComponentType(node);
        const position = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));

        extractedStrings.push({
          original: mixedContent.text,
          processedMessage: mixedContent.processedText,
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
          this.diagnostics.recordSkippedNestedChinese(
            nested,
            filePath,
            position.line + 1,
            position.character + 1,
            nestedIndex,
          );
        }
        // 处理了混合内容后，跳过 children 的单独处理——但开标签必须单独再走一遍：
        // 混合内容只吃掉 children 区间（ReactTransformer 也只替换 children），
        // openingElement 上的属性文案（`<div title="标题">共 {n} 项</div>` 的 title）
        // 与它无关。此处若无差别 return，属性中文既不提取也不进诊断，会静默丢失。
        // JsxFragment 无开标签属性，不需要这一步。
        if (ts.isJsxElement(node)) {
          await this.visitNode(node.openingElement, sourceFile, extractedStrings, filePath);
        }
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
      if (isExtractableStringLiteral(node)) {
        text = node.text;
        // 直接作为 JSX 属性值的字符串（`title="点击&amp;确认"`）按 JSX 语义解码实体，与
        // JsxText 分支同一套白名单：original 留源码原文供替换定位，locale 值与 ID 走
        // processedMessage。表达式容器里的字符串（`title={"a&amp;b"}`）是 JS 字面量、
        // 实体不被解析，故只认「恰为 JsxAttribute 初始化器」这一形态。
        if (ts.isJsxAttribute(node.parent) && node.parent.initializer === node) {
          const decoded = decodeJsxEntities(text);
          if (decoded.unknownEntities.length > 0) {
            if (this.shouldExtract(text, 'jsx-attribute', node)) {
              this.warnUnknownJsxEntities(node, sourceFile, decoded.unknownEntities);
            }
            return;
          }
          if (decoded.text !== text) {
            processedMessage = decoded.text;
          }
        }
      } else if (isComparisonOperand(node) && FileUtils.containsChinese(node.text)) {
        // 比较运算符两侧的中文字面量被跳过 —— 记录到诊断集合，lint 阶段与 locale map
        // 交叉告警，识别「同句中文在他处被 i18n 化导致 === 比较失效」的风险。
        const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
        this.diagnostics.recordSkippedComparisonOperand(
          node.text,
          filePath,
          pos.line + 1,
          pos.character + 1,
        );
      }
    }
    // 处理模板字符串：复用 processTemplateExpression，
    // 该方法会把字面量插值（'literal'/123/true 等）内联进文本，
    // 仅保留真正的变量表达式作为占位符——与 Vue 端对齐，避免
    // `${'literal'}` 被误当作占位符变量。
    //
    // 重要：text 必须保留源代码形式的 ${...} 占位符，因为后续 ReactTransformer
    // 通过 extracted.original 在源代码中匹配并替换；processedMessage 走 ID
    // 生成与 locale 写入路径，承载字面量内联后的真实文案。
    else if (ts.isTemplateExpression(node)) {
      // cspell:ignore gql divt —— 注释中的标签模板示例（graphql-tag 的 gql、拼接产物 divt）
      // 标签模板（styled.div`…`、gql`…`、String.raw`…`）的 template 整体不可提取：
      // ReactTransformer 按模板节点区间整体替换，替换体会与前面的 tag 无缝拼接成
      // `styled.divt('key')` 这类未定义调用 → 运行时 ReferenceError。
      // 字面段含中文时告警留痕；不 return——${} 插值里的字符串字面量仍可由子节点
      // 遍历安全提取（替换单个字面量不会破坏 tag 调用）。
      if (ts.isTaggedTemplateExpression(node.parent)) {
        const quasiTexts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
        if (quasiTexts.some((t) => FileUtils.containsChinese(t))) {
          this.warnTaggedTemplateSkipped(node, sourceFile, filePath);
        }
      } else if (templateLiteralsContainChinese(node)) {
        // 含 HTML 标签的整段模板（如 dangerouslySetInnerHTML 拼装）拒绝提取，
        // 避免 HTML / CSS / SVG 灌进 locale value。详见 Vue 端同名逻辑。
        if (templateLiteralContainsHtmlTags(node.getText(sourceFile))) {
          this.warnHtmlInTemplateLiteral(node, sourceFile);
          return;
        }
        const result = processTemplateExpression(node, sourceFile);
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
            this.diagnostics.recordSkippedNestedChinese(
              nested,
              filePath,
              pos.line + 1,
              pos.character + 1,
              nestedIndex,
            );
          }
        }
      }
    }
    // 处理无替换模板字符串
    else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      // 同上：标签模板的 template 不可提取（见 TemplateExpression 分支注释）。
      if (ts.isTaggedTemplateExpression(node.parent)) {
        if (FileUtils.containsChinese(node.text)) {
          this.warnTaggedTemplateSkipped(node, sourceFile, filePath);
        }
        return;
      }
      if (FileUtils.containsChinese(node.text) && templateLiteralContainsHtmlTags(node.text)) {
        this.warnHtmlInTemplateLiteral(node, sourceFile);
        return;
      }
      text = node.text;
    }
    // 处理JSX文本
    else if (ts.isJsxText(node)) {
      // original 必须留原文（ReactTransformer 按源码文本定位替换区间），locale 值与 ID 走
      // 解码后的 processedMessage —— 替换成 t()/<Trans> 后文本按纯文本渲染，实体不再被解析。
      const raw = node.text.trim();
      const decoded = decodeJsxEntities(raw);
      // 白名单外的实体不猜语义，整段跳过并告警；仅对「本会被提取」的文本告警，避免为
      // 纯装饰实体（`<span>&ensp;</span>`）刷屏。
      if (decoded.unknownEntities.length > 0) {
        if (this.shouldExtract(raw, 'jsx-text', node)) {
          this.warnUnknownJsxEntities(node, sourceFile, decoded.unknownEntities);
        }
        return;
      }
      text = raw;
      // 源码换行 + 缩进不是文案的一部分：与混合内容分支及重建端共用 normalizeJsxTextSegment
      // 压成单空格后作为 locale 值 / ID 源。original 仍是源码原文，替换定位不受影响。
      const normalized = normalizeJsxTextSegment(decoded.text) ?? decoded.text;
      if (normalized !== raw) {
        processedMessage = normalized;
      }
    }

    // 检查是否需要提取
    if (text && this.shouldExtract(text, ReactASTUtils.getNodeContext(node), node)) {
      const componentType = ReactASTUtils.getComponentType(node);
      const context = ReactASTUtils.getNodeContext(node);
      const position = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));

      // 形参默认值在参数作用域求值，看不到注入在函数体内的 t 绑定 → 裸 t() 未定义
      // （TS2304 / 省略实参即 ReferenceError），跳过并留痕。
      // 不按 componentType / context 收窄：函数组件、箭头组件、类方法、构造器、模块级函数的
      // 参数位置成因相同，默认值里的 JSX 子树也同处参数作用域。
      if (ReactASTUtils.isInFunctionParameterDefault(node)) {
        this.warnParameterDefault(node, sourceFile);
        return;
      }

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

      // static 成员（static 箭头属性 / static 方法 / static 访问器 / static 块）：`this` 是
      // 类构造函数、没有 props，注入器那句 `const { t } = this.props` 解构会运行时抛
      // TypeError；不注入则裸 t() 未定义。与上面的属性初始化器同口径跳过并留痕。
      if (
        componentType === 'class' &&
        context !== 'jsx-text' &&
        ReactASTUtils.isInClassStaticMember(node)
      ) {
        this.warnClassStaticMember(node, sourceFile);
        return;
      }

      // 组件内已有与注入变量同名的非 i18n 绑定（`const { t } = useTemperature()`）：注入器
      // 会跳过注入（否则同块双声明 TS2451），但替换已经发生 —— 裸 t('key') 于是解析到那个
      // 同名函数上，产出「能编译、行为错」的代码。把判定前移到提取端，让该候选
      // 不进 extractedStrings，替换也就不会发生。jsx-text 走 <Trans>/<FormattedMessage>
      // 组件形态、不引用 t 绑定，与上面两道守卫同样不在此跳过。
      if (context !== 'jsx-text' && this.hasConflictingTranslationBinding(node, componentType)) {
        this.warnConflictingTranslationBinding(node, sourceFile, filePath);
        return;
      }

      // 除翻译变量外，本候选还会让工具向模块顶层注入 hook / JSX 组件 / HOC 及其 props 类型名。
      // 这些名字若已被非 i18n 来源占用（自封装的 useTranslation wrapper、自有 Trans 组件），
      // 注入即产出重复标识符（TS2300）。同样在提取端跳过，避免替换先于注入落地。
      const conflictingName = this.conflictingInjectedName(node, context, componentType);
      if (conflictingName) {
        this.warnConflictingInjectedName(node, sourceFile, filePath, conflictingName);
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

    for (const literal of collectNestedChineseLiteralNodes(initializer.expression)) {
      const pos = ts.getLineAndCharacterOfPosition(sourceFile, literal.getStart(sourceFile));
      this.diagnostics.recordSkippedNestedChinese(
        literal.text,
        filePath,
        pos.line + 1,
        pos.character + 1,
      );
    }
  }

  /**
   * 提取JSX元素的混合内容（文本+表达式）
   * @param node - JSX 元素或 Fragment 节点
   * @param sourceFile - 源文件
   * @param filePath - 原始入参路径（告警定位用）
   * @returns 混合内容信息，如果不包含中文则返回null
   */
  private extractJsxMixedContent(
    node: ts.JsxElement | ts.JsxFragment,
    sourceFile: ts.SourceFile,
    filePath: string,
  ): {
    text: string;
    processedText?: string;
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
    let jsxInExpression: ts.JsxExpression | undefined;
    let commentChild: ts.JsxExpression | undefined;
    let spreadChild: ts.JsxExpression | undefined;

    for (const child of children) {
      if (ts.isJsxText(child)) {
        const text = child.text.trim();
        if (text && FileUtils.containsChinese(text)) {
          hasChineseText = true;
        }
      } else if (ts.isJsxExpression(child) && child.dotDotDotToken) {
        // 展开子节点 `{...items}`：展开的是一组子元素，不是可插值的单个值。
        hasExpression = true;
        spreadChild ??= child;
      } else if (ts.isJsxExpression(child) && child.expression) {
        hasExpression = true;
        if (!jsxInExpression && ReactASTUtils.containsJsxNode(child.expression)) {
          jsxInExpression = child;
        }
      } else if (ts.isJsxExpression(child) && /\/\*|\/\//.test(child.getText(sourceFile))) {
        // 注释容器 `{/* … */}`：下方合并循环只收 JsxText 与有表达式的 JsxExpression，
        // 而转换端按整个 children 区间替换 —— 合并即等于把注释删掉。
        commentChild = child;
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

    // 含 JSX 注释容器时放弃合并：转换端整段替换会静默删掉注释。退回子节点递归让文本自行
    // 提取（碎片 key 可接受，删注释不可接受）。
    if (commentChild) {
      this.warnJsxCommentInMixedContent(commentChild, sourceFile, filePath);
      return null;
    }

    // 插值表达式内部嵌了 JSX（如 `状态 {ok && <b>正常</b>}`）时同样放弃合并：该表达式会被整段
    // 塞进占位符，产出 `values={{ ok: ok && <b>正常</b> }}` —— react-i18next 把 values 当纯值
    // 插值，渲染出 `[object Object]`，且嵌套元素里的中文既不提取也不告警。退回子节点递归让
    // 文本与嵌套元素各自独立提取（碎片 key 可接受，坏渲染不可接受）。
    if (jsxInExpression) {
      this.warnJsxInsideInterpolation(jsxInExpression, sourceFile, filePath);
      return null;
    }

    // 含展开子节点 `{...items}` 时放弃合并：合并会把它当普通插值写成 `${items}` 并塞进
    // values，原本展开渲染的一组子节点被插值成字符串，`...` 语义静默丢失。
    if (spreadChild) {
      this.warnJsxSpreadChild(spreadChild, sourceFile, filePath);
      return null;
    }

    // 构建模板字符串格式的文本（使用${expression}格式）
    let inner = '';
    // 与 inner 同构、但文本段已解码实体的副本，作为 locale 值 / ID 源（见 JsxText 分支注释）。
    // 逐段解码而非解码整串：插值表达式里的字符串字面量（`{cond ? '&amp;' : x}`）是 JS 语义，
    // 解码会改掉表达式文本、让占位符替换对不上。
    let decodedInner = '';
    const templateVariables: string[] = [];
    const nestedChineseTexts: string[] = [];

    for (const child of children) {
      if (ts.isJsxText(child)) {
        // 空白归一与重建端（reconstructJsxMixedContent）共用同一实现，两端结论差一个空格
        // 就会让 findExactStringNode 比对失败、混合内容被静默漏替换。null 表示整段不参与拼接。
        const segment = normalizeJsxTextSegment(child.text);
        if (segment === null) continue;
        const decoded = decodeJsxEntities(segment);
        // 未知实体：放弃整段合并，退回子节点递归，由 JsxText 分支逐段告警并跳过该段。
        if (decoded.unknownEntities.length > 0) return null;
        inner += segment;
        decodedInner += decoded.text;
      } else if (ts.isJsxExpression(child) && child.expression) {
        const expressionText = nodeToText(child.expression!, sourceFile);
        templateVariables.push(expressionText);
        inner += `\${${expressionText}}`;
        decodedInner += `\${${expressionText}}`;
        // 插值表达式里的中文分支（如 `{ok ? '成功' : '失败'}`）被整段当运行时变量塞进
        // 占位符，既不提取也不内联 —— 与模板字面量路径对齐，记录到诊断集合避免静默泄漏。
        nestedChineseTexts.push(...collectNestedChineseLiterals(child.expression));
      }
    }

    // 整体首尾去空白（内部词间距保留）：边界换行/缩进会被压成首尾空格，不应进 locale。
    // 必须与 ast-core 的 reconstructJsxMixedContent 的 trim 一致，否则
    // findExactStringNode 的 `=== originalText` 失配 → 漏替换。
    const templateText = '`' + inner.trim() + '`';
    // trim 口径与 text 一致：两者只在实体处不同，locale 值与替换区间才对得上。
    const decodedText = '`' + decodedInner.trim() + '`';

    return {
      text: templateText,
      processedText: decodedText !== templateText ? decodedText : undefined,
      isTemplateString: true,
      templateVariables,
      nestedChineseTexts,
    };
  }

  /**
   * 输出「JSX 文本含未识别 HTML 实体、跳过提取」的 warning。
   *
   * 只走 warning 通道：ManualSkipDiagnostic.category 是封闭联合，扩枚举要同步 CoverageReporter
   * 与 RunReport 的映射；warning 已随 RunReport 落盘留痕。
   */
  private warnUnknownJsxEntities(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    entities: string[],
  ): void {
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const msg =
      `⚠️ 跳过含未识别 HTML 实体的 JSX 文本：${FileUtils.getRelativePath(sourceFile.fileName)}:${pos.line + 1}\n` +
      `   实体：${[...new Set(entities)].join(' ')}\n` +
      `   原因：解码后的字符无法确定，写进 locale 会渲染成字面实体或错误字符。\n` +
      `   建议：源码里改成实体对应的真实字符后重跑提取。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
  }

  /** 同一轮提取内已告警过的「插值内嵌 JSX」位置，按 文件:偏移 去重。 */
  private warnedJsxInterpolations = new Set<string>();

  /**
   * 输出「插值内嵌 JSX 导致放弃混合内容合并」的 warning。
   *
   * 只走 warning 通道（不进 manualSkip）：文案并未被跳过——退回子节点递归后文本与嵌套元素
   * 都会各自提取，只是拆成了多个 key，计入 manualSkip 会虚报「需人工处理」的覆盖率缺口。
   */
  private warnJsxInsideInterpolation(
    node: ts.JsxExpression,
    sourceFile: ts.SourceFile,
    filePath: string,
  ): void {
    const dedupeKey = `${filePath}:${node.getStart(sourceFile)}`;
    if (this.warnedJsxInterpolations.has(dedupeKey)) return;
    this.warnedJsxInterpolations.add(dedupeKey);
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const msg =
      `⚠️ 插值内嵌 JSX，放弃整段合并提取：${FileUtils.getRelativePath(filePath)}:${pos.line + 1}\n` +
      `   原因：把 JSX 元素当插值变量传入 values 会渲染成 [object Object]。\n` +
      `   影响：该段文本改为按文本节点 / 嵌套元素分别提取，会拆成多个 key。\n` +
      `   建议：如需保持整句，请手写 <Trans> 富文本映射。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
  }

  /** 同一轮提取内已告警过的「混合内容含 JSX 注释」位置，按 文件:偏移 去重。 */
  private warnedJsxComments = new Set<string>();

  /**
   * 输出「混合内容含 JSX 注释、放弃整段合并」的 warning。
   *
   * 只走 warning 通道（不进 manualSkip）：文案并未被跳过——退回子节点递归后文本照常提取，
   * 只是拆成多个 key，计入 manualSkip 会虚报「需人工处理」的覆盖率缺口。
   */
  private warnJsxCommentInMixedContent(
    node: ts.JsxExpression,
    sourceFile: ts.SourceFile,
    filePath: string,
  ): void {
    const dedupeKey = `${filePath}:${node.getStart(sourceFile)}`;
    if (this.warnedJsxComments.has(dedupeKey)) return;
    this.warnedJsxComments.add(dedupeKey);
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const msg =
      `⚠️ 混合内容含 JSX 注释，放弃整段合并提取：${FileUtils.getRelativePath(filePath)}:${pos.line + 1}\n` +
      `   原因：整段替换会连同 {/* … */} 一起删除。\n` +
      `   影响：该段文本改为按文本节点分别提取，会拆成多个 key。\n` +
      `   建议：如需保持整句，请把注释移到该元素之外。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
  }

  /** 同一轮提取内已告警过的「混合内容含展开子节点」位置，按 文件:偏移 去重。 */
  private warnedJsxSpreadChildren = new Set<string>();

  /**
   * 输出「混合内容含展开子节点、放弃整段合并」的 warning。
   *
   * 只走 warning 通道（不进 manualSkip）：文案并未被跳过——退回子节点递归后文本照常提取，
   * 只是拆成多个 key，计入 manualSkip 会虚报「需人工处理」的覆盖率缺口。
   */
  private warnJsxSpreadChild(
    node: ts.JsxExpression,
    sourceFile: ts.SourceFile,
    filePath: string,
  ): void {
    const dedupeKey = `${filePath}:${node.getStart(sourceFile)}`;
    if (this.warnedJsxSpreadChildren.has(dedupeKey)) return;
    this.warnedJsxSpreadChildren.add(dedupeKey);
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const msg =
      `⚠️ 混合内容含展开子节点，放弃整段合并提取：${FileUtils.getRelativePath(filePath)}:${pos.line + 1}\n` +
      `   原因：{...children} 展开的是一组子节点，当插值变量合并会丢掉展开语义。\n` +
      `   影响：该段文本改为按文本节点分别提取，会拆成多个 key。\n` +
      `   建议：如需保持整句，请把展开子节点移到该元素之外。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
  }

  /** 同一轮提取内已告警过的标签模板位置（CSS-in-JS 项目单文件可能几十处，防连刷）。 */
  private warnedTaggedTemplates = new Set<string>();

  /**
   * 输出「标签模板含中文但跳过提取」的 warning。只走 warning 通道（不进 manualSkip）：
   * ManualSkipDiagnostic.category 是封闭联合，扩枚举需同步 CoverageReporter 的映射，
   * 而这类命中（CSS-in-JS/gql 里的中文）绝大多数本就不该翻译，warning 留痕足够。
   * 按 文件:偏移 去重，去重前缀统一用入参 filePath（不用被规范化过的 sourceFile.fileName）。
   */
  private warnTaggedTemplateSkipped(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
  ): void {
    const dedupeKey = `${filePath}:${node.getStart(sourceFile)}`;
    if (this.warnedTaggedTemplates.has(dedupeKey)) return;
    this.warnedTaggedTemplates.add(dedupeKey);
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const msg =
      `⚠️ 跳过标签模板中的中文提取：${FileUtils.getRelativePath(filePath)}:${pos.line + 1}\n` +
      `   原因：替换标签模板会破坏 styled/gql 等标签调用（拼成未定义函数）。\n` +
      `   建议：如需国际化，请把中文移出标签模板、经变量插值传入。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
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
      `   建议：把 t() 调用缩到具体中文文案上，例如\n` +
      `     \`<span>\${t('key')}</span>\` 替代 \`t('key')\` 包整个 \`<div>...</div>\``;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
    this.recordManualSkip({
      category: 'html-template',
      message: msg,
      dedupeKey: `${sourceFile.fileName}:${node.getStart(sourceFile)}`,
    });
  }

  /**
   * 「哪些同名绑定属于 i18n 来源」的豁免口径，提取端与注入端
   * （ReactComponentInjector.hasConflictingLocalBinding）必须同源，两端分叉会产出
   * 「已替换成裸 t() 却没注入绑定」的错误代码。
   */
  private bindingOptions(library: ReactI18nLibrary): ConflictingBindingOptions {
    const i18nModules = [library.packageName];
    if (this.tImport) i18nModules.push(this.tImport);
    return {
      i18nModules,
      isI18nDeclaration: (declaration) => library.isGlobalFunctionDeclaration(declaration),
      hookName: library.hookName,
      hocPropsType: library.hocPropsType,
      isHOCCall: (expression) => library.isHOCCall(expression),
    };
  }

  /**
   * 本替换点替换成裸 `t(...)` / `intl.formatMessage(...)` 后是否会解析错人。
   *
   * 两问都要过（判定收口在 ReactASTUtils，与注入端共用）：
   *  1. **引用级**：从本节点上溯到注入宿主，任一层块 / 函数形参 / 回调形参 / 解构形参
   *     绑定了同名变量且不是 i18n 来源 —— 裸 t() 会调到那个业务变量上（TS2349）；
   *  2. **注入级**：宿主作用域自身与其外层（含模块顶层）已有同名非 i18n 绑定 —— 注入的
   *     hook 声明轻则同块双声明（TS2451），重则遮蔽外层同名绑定。
   *
   * 宿主按 componentType 分三类：函数组件（hook 注入在组件体顶部）、类组件（this.props
   * 解构注入在该成员体内，故只判该成员）、模块级（裸 t 来自模块顶层 import / 声明）。
   */
  private hasConflictingTranslationBinding(
    node: ts.Node,
    componentType: 'function' | 'class' | 'other',
  ): boolean {
    const library = this.library;
    if (!library) return false;
    const options = this.bindingOptions(library);
    const varName = library.translationVarName;

    if (componentType === 'function') {
      const host = ReactASTUtils.findEnclosingInjectableFunctionComponent(node);
      if (host) {
        return (
          ReactASTUtils.referenceBindsConflictingVar(node, varName, host, options) ||
          ReactASTUtils.hasConflictingTranslationBinding(host, varName, library.hookName, options)
        );
      }
    }

    if (componentType === 'class') {
      const member = ReactASTUtils.findEnclosingClassMemberFunction(node);
      return ReactASTUtils.referenceBindsConflictingVar(node, varName, member, options);
    }

    const sourceFile = node.getSourceFile();
    if (ReactASTUtils.referenceBindsConflictingVar(node, varName, undefined, options)) return true;
    if (!ReactASTUtils.canBindName(sourceFile, varName, options)) return true;
    // react-intl 模块级还要注入 `import { getIntl }`：该名字被占用同样是重复标识符。
    const globalName = library.globalFunctionName.split('.')[0]!;
    return globalName !== varName && !ReactASTUtils.canBindName(sourceFile, globalName, options);
  }

  /**
   * 本候选会让工具向模块顶层注入的名字里，第一个已被非 i18n 来源占用的名字（无则 undefined）。
   *
   * jsx-text 走 JSX 组件（Trans / FormattedMessage）；函数组件走 hook；类组件走 HOC 及其
   * props 类型。这些名字来自 i18n 库包名或 tImport 时不算冲突（工具自身上一轮的产物），
   * 保证增量重跑幂等。
   */
  private conflictingInjectedName(
    node: ts.Node,
    context: 'jsx-text' | 'jsx-attribute' | 'js-code',
    componentType: 'function' | 'class' | 'other',
  ): string | undefined {
    const library = this.library;
    if (!library) return undefined;
    const options = this.bindingOptions(library);
    const names: Array<{ name: string; kind: 'value' | 'type' }> = [];

    if (context === 'jsx-text') {
      names.push({ name: library.jsxComponentName, kind: 'value' });
    } else if (componentType === 'function') {
      names.push({ name: library.hookName, kind: 'value' });
    } else if (componentType === 'class') {
      const specifiers = library.getImportSpecifiers({
        hasJsxComponent: false,
        hasHook: false,
        hasHOC: true,
      });
      for (const name of specifiers.values) names.push({ name, kind: 'value' });
      for (const name of specifiers.types) names.push({ name, kind: 'type' });
    }

    const sourceFile = node.getSourceFile();
    for (const { name, kind } of names) {
      if (!ReactASTUtils.canBindName(sourceFile, name, { ...options, kind })) return name;
    }
    return undefined;
  }

  /**
   * 输出「static 类成员跳过提取」的 warning，附文件路径与行号。
   * 归入 manualSkip 的 class-property 类目：成因与属性初始化器同族（该位置没有可用的
   * t/intl 绑定），复用同一条人工处理建议，不为此扩 ManualSkipDiagnostic 的封闭联合。
   */
  private warnClassStaticMember(node: ts.Node, sourceFile: ts.SourceFile): void {
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const line = pos.line + 1;
    const msg =
      `⚠️ 跳过类组件 static 成员中的文案提取：${FileUtils.getRelativePath(sourceFile.fileName)}:${line}\n` +
      `   原因：static 成员里的 this 是类本身、没有 props，注入 const { t } = this.props 会运行时报错。\n` +
      `   建议：把文案挪进实例方法 / render()，或改用模块级 t() 导入。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
    this.recordManualSkip({
      category: 'class-property',
      message: msg,
      dedupeKey: `${sourceFile.fileName}:${node.getStart(sourceFile)}`,
    });
  }

  /** 同一轮提取内已告警过的「同名非 i18n 绑定」组件位置，按 文件:偏移 去重。 */
  private warnedConflictingBindings = new Set<string>();

  /**
   * 输出「组件内存在同名非 i18n 绑定、整体跳过提取」的 warning，并计入 manualSkip。
   *
   * 必须走 manualSkip 通道：这些中文片段是工具确认属于文案、却没能自动改写的，
   * 不进 needsManual 与覆盖率分母的话，面板会把「跳过 / 待人工 0、覆盖率 100%」
   * 报给一个实际存在未改写文案的目录（CI 假绿）。
   */
  private warnConflictingTranslationBinding(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
  ): void {
    const dedupeKey = `${filePath}:${node.getStart(sourceFile)}`;
    if (this.warnedConflictingBindings.has(dedupeKey)) return;
    this.warnedConflictingBindings.add(dedupeKey);
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const varName = this.library?.translationVarName ?? 't';
    const msg =
      `⚠️ 跳过提取：组件自身或其外层作用域（含模块顶层）已存在与 '${varName}' 同名的非 i18n 本地绑定：` +
      `${FileUtils.getRelativePath(filePath)}:${pos.line + 1}\n` +
      `   原因：注入器不能在同块再声明一个 ${varName}（TS2451）、也不能遮蔽外层同名绑定，` +
      `若仍替换文案，新的 ${varName}(...) 会解析到那个同名函数上。\n` +
      `   建议：把该绑定改名，或人工为该组件接入 i18n 后重跑。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
    this.recordManualSkip({
      category: 'conflicting-t-binding',
      message: msg,
      dedupeKey,
    });
  }

  /** 同一轮提取内已告警过的「注入名被占用」位置，按 文件:偏移 去重。 */
  private warnedConflictingInjectedNames = new Set<string>();

  /**
   * 输出「工具要注入的名字已被非 i18n 来源占用、跳过提取」的 warning，并计入 manualSkip。
   *
   * 与 warnConflictingTranslationBinding 同走 conflicting-t-binding 类目：成因同族
   * （模块内同名标识符冲突）、人工处理手法一致（改名或人工接入），不为此扩
   * ManualSkipDiagnostic 的封闭联合。
   */
  private warnConflictingInjectedName(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    name: string,
  ): void {
    const dedupeKey = `${filePath}:${node.getStart(sourceFile)}`;
    if (this.warnedConflictingInjectedNames.has(dedupeKey)) return;
    this.warnedConflictingInjectedNames.add(dedupeKey);
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const msg =
      `⚠️ 跳过提取：模块顶层已存在与待注入的 '${name}' 同名、且非 i18n 来源的绑定：` +
      `${FileUtils.getRelativePath(filePath)}:${pos.line + 1}\n` +
      `   原因：改写需要从 '${this.library?.packageName}' 导入 ${name}，与既有同名绑定构成重复标识符（TS2300）。\n` +
      `   建议：把该绑定改名（如自封装的 ${name} 换个导出名），或人工为该文件接入 i18n 后重跑。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
    this.recordManualSkip({
      category: 'conflicting-t-binding',
      message: msg,
      dedupeKey,
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
      dedupeKey: `${sourceFile.fileName}:${node.getStart(sourceFile)}`,
    });
  }

  /**
   * 输出「形参默认值跳过提取」的 warning，附文件路径与行号。
   * 独立成 param-default 类目而非并入 class-property：成因（参数作用域 vs 类字段初始化）与
   * 人工改写手法都不同，合并会给出误导性的修复建议。
   */
  private warnParameterDefault(node: ts.Node, sourceFile: ts.SourceFile): void {
    const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    const varName = this.library?.translationVarName ?? 't';
    const msg =
      `⚠️ 跳过形参默认值中的文案提取：${FileUtils.getRelativePath(sourceFile.fileName)}:${pos.line + 1}\n` +
      `   原因：形参默认值在参数作用域求值，而 ${varName} 绑定注入在函数体内，` +
      `直接替换会产出未定义标识符（TS2304 / 省略实参时 ReferenceError）。\n` +
      `   建议：默认值改用哨兵（如 undefined），在函数体内用 ${varName}(...) 兜底赋值。`;
    LoggerUtils.warn(msg);
    this.recordWarning(msg);
    this.recordManualSkip({
      category: 'param-default',
      message: msg,
      dedupeKey: `${sourceFile.fileName}:${node.getStart(sourceFile)}`,
    });
  }
}
