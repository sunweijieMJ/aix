import ts from 'typescript';
import { CONFIG } from './constants';
import { LoggerUtils } from './logger';

/**
 * 通用 AST 工具类
 * 提供框架无关的 TypeScript AST 操作功能
 */
export class CommonASTUtils {
  /**
   * 对字符串做正则元字符转义，用于把任意文本嵌入 `new RegExp(...)` 模板。
   *
   * Why: React/Vue 多个 ImportManager / Transformer / RestoreTransformer 此前
   *      各自内联 `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`，已经出现字符集
   *      不一致（个别位置漏掉 `*` `?`）。统一到本方法消除漂移。
   */
  static escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 把代码字符串中包裹在引号/反引号/JSX 表达式中的 `\uXXXX` Unicode 转义序列还原回字符。
   * 之前 React/Vue 的 ImportManager 各有一份几乎相同的实现，此处统一。
   *
   * @param code      源代码文本
   * @param includeJsx 是否包含 JSX 表达式 `{'...'}` 这种括号包裹形式（仅 React 使用）
   */
  static convertUnicodeToChineseInCode(code: string, includeJsx: boolean = false): string {
    const decode = (str: string): string =>
      str.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));

    const replaceQuoted = (input: string, quote: string): string => {
      // 匹配同种引号内含 \uXXXX 的字符串字面量
      const escapedQuote = quote === '`' ? '`' : quote;
      const regex = new RegExp(
        `${escapedQuote}([^${escapedQuote}]*\\\\u[0-9a-fA-F]{4}[^${escapedQuote}]*)${escapedQuote}`,
        'g',
      );
      return input.replace(regex, (match) => {
        try {
          return `${quote}${decode(match.slice(1, -1))}${quote}`;
        } catch {
          return match;
        }
      });
    };

    let out = code;
    out = replaceQuoted(out, "'");
    out = replaceQuoted(out, '"');
    out = replaceQuoted(out, '`');

    if (includeJsx) {
      out = out.replace(/\{'([^']*\\u[0-9a-fA-F]{4}[^']*)'\}/g, (match) => {
        try {
          return `{'${decode(match.slice(2, -2))}'}`;
        } catch {
          return match;
        }
      });
    }

    return out;
  }

  /**
   * 处理 ts.TemplateExpression（带变量插值的模板字符串）
   *
   * 同时返回两份文本：
   * - originalText：保持源代码 ${expr} 占位形式，用于源文件 AST 替换匹配
   * - processedText：将字面量插值（StringLiteral / NumericLiteral / Boolean / Null /
   *   NoSubstitutionTemplateLiteral）内联回 text，仅保留真正的「变量表达式」作为占位符
   *   ↑ 用于翻译消息（locale 文件）和 ID 生成
   *
   * templateVariables 仅包含「真正的变量表达式」，不含字面量。
   *
   * 此前 React 与 Vue 的实现并不一致：Vue 端会内联字面量，React 端把所有 spans
   * 都当作变量。统一到本方法后，行为对齐，避免「`Hello${'world'}`」这类被错误
   * 拆成两个占位符的问题。
   */
  static processTemplateExpression(
    node: ts.TemplateExpression,
    sourceFile: ts.SourceFile,
  ): {
    originalText: string;
    processedText: string;
    templateVariables: string[];
  } {
    let originalText = '`' + node.head.text;
    let processedText = '`' + node.head.text;
    const templateVariables: string[] = [];

    for (const span of node.templateSpans) {
      const expression = span.expression;
      const expressionText = this.nodeToText(expression, sourceFile);

      const isLiteral =
        ts.isStringLiteral(expression) ||
        ts.isNumericLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression) ||
        expression.kind === ts.SyntaxKind.TrueKeyword ||
        expression.kind === ts.SyntaxKind.FalseKeyword ||
        expression.kind === ts.SyntaxKind.NullKeyword;

      if (isLiteral) {
        // 原始文本保持 ${...}，方便回到源码位置精确替换
        originalText += '${' + expressionText + '}' + span.literal.text;

        // 处理后的文本内联字面量值
        let literalValue = expressionText;
        if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
          literalValue = expression.text;
        }
        processedText += literalValue + span.literal.text;
      } else {
        templateVariables.push(expressionText);
        originalText += '${' + expressionText + '}' + span.literal.text;
        processedText += '${' + expressionText + '}' + span.literal.text;
      }
    }

    return {
      originalText: originalText + '`',
      processedText: processedText + '`',
      templateVariables,
    };
  }

  /**
   * 被「比较运算符跳过」记录到的中文字面量位置。
   *
   * Why: isComparisonOperand 跳过 `status === '进行中'` 这类位置是为了避免
   *      翻译后分支失效；但同一句中文若在别处（如 tabs 数组初值）被提取，
   *      就会出现「script 端值已 i18n 化，template 端仍硬编码中文比较」的
   *      非对称——切语言后分支永远不命中。lint 阶段把本集合与 source locale
   *      map values 交叉，命中即告警，让用户改用 key 比较或索引比较。
   *
   * 用 Map 去重（同一位置多次访问 AST 时只记录一次）。
   */
  private static skippedComparisonOperands: Map<
    string,
    { text: string; filePath: string; line: number; column: number }
  > = new Map();

  /**
   * 记录一处「因比较运算符被跳过」的中文字面量位置。供 extractor 调用。
   * 仅当 text 含中文时建议记录（调用方自行判定，避免把英文枚举值记进来产生噪音）。
   */
  static recordSkippedComparisonOperand(
    text: string,
    filePath: string,
    line: number,
    column: number,
  ): void {
    const key = `${filePath}:${line}:${column}:${text}`;
    if (!CommonASTUtils.skippedComparisonOperands.has(key)) {
      CommonASTUtils.skippedComparisonOperands.set(key, { text, filePath, line, column });
    }
  }

  /** 取出当前累积的跳过记录并清空（供 lint 阶段一次性消费）。 */
  static drainSkippedComparisonOperands(): Array<{
    text: string;
    filePath: string;
    line: number;
    column: number;
  }> {
    const items = Array.from(CommonASTUtils.skippedComparisonOperands.values());
    CommonASTUtils.skippedComparisonOperands.clear();
    return items;
  }

  /**
   * 判断字符串字面量是否是比较运算符（=== / !== / == / !=）的操作数
   *
   * 比较的右值通常是 locale 无关的状态常量（如 status === 'pending'）。
   * 一旦被提取并替换为 t(...)，运行时返回的是当前语言的翻译文本，与原始
   * 状态值脱钩，分支永远不命中，破坏业务逻辑。
   *
   * @param node 字符串字面量节点（也支持其他可能作为操作数的节点）
   */
  static isComparisonOperand(node: ts.Node): boolean {
    const parent = node.parent;
    if (parent && ts.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind;
      return (
        op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        op === ts.SyntaxKind.EqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken
      );
    }
    // case '中文': 中的字面量也是比较场景（switch-case 与 === 等价）
    if (parent && ts.isCaseClause(parent) && parent.expression === node) {
      return true;
    }
    return false;
  }

  /**
   * 判断 ts.StringLiteral 是否属于"应被国际化提取"的语义位置。
   *
   * 排除：
   * - 对象字面量属性 key（如 `{ '中文key': value }`，翻译会破坏数据结构）
   * - 模块导入路径（import / require / external module reference）
   * - 比较运算符 / case 子句的操作数（翻译状态值会破坏分支判断）
   *
   * Why: React/Vue 两端 TextExtractor 此前各写一遍同样的三条排除条件，
   *      字面相同；统一到本工具方法避免维护漂移。
   */
  static isExtractableStringLiteral(node: ts.StringLiteral): boolean {
    const parent = node.parent;
    if (!parent) return true;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
    if (ts.isImportDeclaration(parent) || ts.isExternalModuleReference(parent)) return false;
    if (CommonASTUtils.isComparisonOperand(node)) return false;
    return true;
  }

  /**
   * 模板字符串的字面量片段（head + 各 span 的 literal.text）是否含中文。
   *
   * 仅当字面量片段命中中文时才视为可提取，避免对 `${user}: ${count}` 这类
   * 不含本地化文案的模板误处理。变量表达式中的中文（如 ${'中文'}）由
   * processTemplateExpression 内部的内联逻辑兜底。
   */
  static templateLiteralsContainChinese(node: ts.TemplateExpression): boolean {
    const test = (s: string): boolean => CONFIG.CHINESE_REGEX.test(s);
    if (test(node.head.text)) return true;
    return node.templateSpans.some((span) => test(span.literal.text));
  }

  /**
   * 模板字符串文本是否包含 HTML 标签。
   *
   * 典型场景：`innerHTML = \`<div>...<span>中文</span></div>\`` 这种把 HTML
   * 拼装放进模板字符串的写法——整段提取会把 HTML / CSS / SVG 一起灌进 locale
   * value，多语言下样式结构不可控、翻译质量受 HTML 噪声干扰。
   *
   * 命中规则：`<` 后必须紧跟字母 / `/`，避免 `x < 10` 等不等式误命中。
   * 与 LocaleValueLinter 同 family，规则一致，便于双端校验。
   */
  static templateLiteralContainsHtmlTags(text: string): boolean {
    return /<\s*\/?\s*[a-zA-Z][\w-]*(\s|>|\/)/.test(text);
  }

  /**
   * 检查节点是否应跳过提取：
   *   - 已被框架无关的 t()/$t() 调用包裹
   *   - 位于不可提取的位置：类型字面量（type X = '中文'）、枚举成员值
   *
   * 框架/库特定的 JSX 组件（如 FormattedMessage/Trans）由各 i18n 库适配器自行覆盖。
   * 调用方语义为"是否应跳过"，因此类型字面量/枚举成员返回 true（跳过）。
   */
  static isAlreadyInternationalized(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent) {
      if (ts.isCallExpression(parent)) {
        const expression = parent.expression;

        if (ts.isIdentifier(expression) && (expression.text === 't' || expression.text === '$t')) {
          return true;
        }

        if (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.name) &&
          (expression.name.text === 't' || expression.name.text === '$t')
        ) {
          return true;
        }
      }

      // 类型字面量与枚举成员值在编译期就被消费，不参与运行时本地化，应跳过提取。
      if (ts.isLiteralTypeNode(parent) || ts.isEnumMember(parent)) {
        return true;
      }

      if (ts.isBlock(parent) || ts.isFunctionLike(parent) || ts.isClassLike(parent)) {
        return false;
      }

      parent = parent.parent;
    }

    return false;
  }

  /**
   * 判断节点是否处于"可绑定 this"的词法作用域。
   *
   * 用于 Vue SFC 普通 <script> 块的转换：data() / methods / computed / watch /
   * mounted 等 Options API 选项内部的字符串可以写 `this.$t(...)`，因为运行时
   * `this` 指向组件实例；但同一 <script> 块的**模块顶层**（如顶层
   * `const X = ...`、IIFE 顶部、模块级 import 等）`this` 是 undefined，
   * 强行写 `this.$t` 会运行时崩溃。
   *
   * 规则（按 JavaScript this 绑定语义）：
   * - 普通函数 / 方法 / getter / setter / 构造器 → this 绑定到调用点 → 返回 true
   * - 箭头函数 → 透明，沿父链继续向上判定
   * - 类声明体 → 透明（类成员的 this 由方法层判定，类字段初始化器无 this）
   * - 模块顶层 / 块语句直接挂 SourceFile → 返回 false
   *
   * 注意：类字段初始化器（class field initializer）严格说有 this（指向实例），
   * 但实际场景里 SFC 不写 class，故不特别处理。
   */
  static isInThisBindableScope(node: ts.Node): boolean {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (ts.isArrowFunction(current)) {
        current = current.parent;
        continue;
      }
      if (
        ts.isMethodDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isFunctionDeclaration(current) ||
        ts.isGetAccessor(current) ||
        ts.isSetAccessor(current) ||
        ts.isConstructorDeclaration(current)
      ) {
        return true;
      }
      if (ts.isSourceFile(current)) {
        return false;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * 获取字符串字面量的值
   * @param node - TypeScript AST节点
   * @returns 字符串值，如果不是字符串字面量则返回undefined
   */
  static getStringLiteralValue(node: ts.Node): string | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    return undefined;
  }

  /**
   * 将AST节点转换为源代码文本
   * @param node - TypeScript AST节点
   * @param sourceFile - 源文件
   * @returns 源代码文本
   */
  static nodeToText(node: ts.Node, sourceFile: ts.SourceFile): string {
    // 用 getStart（跳过前导 trivia：空白与注释）而非 getFullStart。
    // getFullStart 会把节点前的注释一并纳入，导致 `const msg = /* x */ '你好'`
    // 这类带前导注释的字面量在 shouldReplaceNode 比较时首字符变成注释字符、
    // 比较失败 → 提取阶段已生成 key 写入 locale，但替换阶段被静默跳过。
    return sourceFile.text.substring(node.getStart(sourceFile), node.getEnd()).trim();
  }

  /**
   * 查找指定位置的节点
   * @param sourceFile - 源文件
   * @param position - 位置
   * @returns 找到的节点，如果没找到则返回undefined
   */
  static findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
    function find(node: ts.Node): ts.Node | undefined {
      if (position >= node.getFullStart() && position < node.getEnd()) {
        return ts.forEachChild(node, find) || node;
      }
      return undefined;
    }
    return find(sourceFile);
  }

  /**
   * 提取对象字面量中的属性值
   * @param node - 对象字面量表达式节点
   * @param sourceFile - 源文件（可选）
   * @returns 属性键值对
   */
  static extractObjectLiteralProperties(
    node: ts.ObjectLiteralExpression,
    sourceFile?: ts.SourceFile,
  ): Record<string, any> {
    const props: Record<string, any> = {};

    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = CommonASTUtils.getPropertyKey(property.name);
        if (key) {
          props[key] = CommonASTUtils.getPropertyValue(property.initializer, sourceFile);
        }
      }
    }

    return props;
  }

  /**
   * 获取属性键名
   * @param name - 属性名节点
   * @returns 属性键名
   */
  private static getPropertyKey(name: ts.PropertyName): string | undefined {
    if (ts.isIdentifier(name)) {
      return name.text;
    } else if (ts.isStringLiteral(name)) {
      return name.text;
    }
    return undefined;
  }

  /**
   * 获取属性值
   * @param initializer - 初始化表达式
   * @param sourceFile - 源文件（可选）
   * @returns 属性值
   */
  private static getPropertyValue(initializer: ts.Expression, sourceFile?: ts.SourceFile): any {
    const stringValue = CommonASTUtils.getStringLiteralValue(initializer);

    if (stringValue !== undefined) {
      return stringValue;
    } else if (ts.isNumericLiteral(initializer)) {
      return Number(initializer.text);
    } else if (
      ts.isIdentifier(initializer) ||
      ts.isPropertyAccessExpression(initializer) ||
      ts.isCallExpression(initializer)
    ) {
      if (sourceFile) {
        return {
          node: initializer,
          text: CommonASTUtils.nodeToText(initializer, sourceFile),
        };
      }
      return initializer;
    } else if (sourceFile) {
      const expressionText = CommonASTUtils.nodeToText(initializer, sourceFile);
      return `{{${expressionText}}}`;
    }

    return undefined;
  }

  /**
   * 检查节点是否在console调用中
   * @param node - TypeScript AST节点
   * @returns 是否在console调用中
   */
  static isInConsoleCall(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent) {
      if (ts.isCallExpression(parent)) {
        const expression = parent.expression;
        if (ts.isPropertyAccessExpression(expression)) {
          const object = expression.expression;
          if (ts.isIdentifier(object) && object.text === 'console') {
            return true;
          }
        }
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * 获取文件类型
   * @param filePath - 文件路径
   * @returns 脚本类型
   */
  static getScriptKind(filePath: string): ts.ScriptKind {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      return ts.ScriptKind.TSX;
    }
    // .js/.mjs/.cjs 文件使用 JSX 模式，以支持 React 项目中 .js 文件内的 JSX 语法
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
      return ts.ScriptKind.JSX;
    }
    return ts.ScriptKind.TS;
  }

  /**
   * 从表达式文本中提取一个合理的变量名
   * @param expressionText - 表达式的源代码文本
   * @returns 合理的变量名
   */
  /**
   * 非语义后缀集合：这些属性名/方法名不适合作为占位符名称
   */
  private static readonly NON_SEMANTIC_SUFFIXES = new Set([
    // Vue ref 解包
    'value',
    // Number 方法
    'toFixed',
    'toString',
    'valueOf',
    'toLocaleString',
    'toPrecision',
    // String 方法
    'trim',
    'trimStart',
    'trimEnd',
    'toLowerCase',
    'toUpperCase',
    'replace',
    'replaceAll',
    'slice',
    'substring',
    'substr',
    'padStart',
    'padEnd',
    // Array 方法
    'join',
    'length',
  ]);

  static getVariableNameFromExpression(expressionText: string): string {
    const trimmed = expressionText.trim();

    // 复杂表达式（三元 ?: / 逻辑 && || / 比较 == != 等）无法通过字符串切割
    // 稳定取出语义名。早年实现把三元 `?` 当作 optional chain 走 split('.')
    // 兜底，会从两个分支字面量里"挤"出形如 `内部错误网络异常` 的拼接标识符，
    // 写进 locale 文件后再被 LLM 翻译占位符内容，运行时占位符无法替换。
    // 这类表达式统一退到兜底名 'value'，由 createMessageWithOptions 的 usedNames
    // 自动加序号去重（value / value1 / value2）。
    // 注意：optional chaining `obj?.prop` 中的 `?` 后跟 `.`，用负向先行排除。
    const hasComplexOperator =
      /\?(?!\.)/.test(trimmed) || // 三元 ?
      /&&|\|\|/.test(trimmed) || // 逻辑 && ||
      /===|!==|==|!=/.test(trimmed); // 比较 == != === !==
    if (hasComplexOperator) {
      return 'value';
    }

    // 使用非贪婪匹配移除函数调用参数，避免 (a * b).toFixed(2) 整体被吃掉
    // 剥掉 `[...]` 让 `progressMap[item.pathId]` 退回 `progressMap` —— 下标里的
    // key 名描述的是字典 key，与字典值语义无关，作为占位符名会误导译者。
    let baseName = expressionText.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
    baseName = baseName.replace(/\?\.|\?/g, '.');
    const parts = baseName.split('.').filter((p) => p.trim() !== '');

    // 从后往前找第一个有语义的部分（跳过 .value、.toFixed 等）
    for (let i = parts.length - 1; i >= 0; i--) {
      let part = parts[i] ?? '';
      part = part.replace(/^['"`]|['"`]$/g, '');
      part = part.replace(/[^\w\u4e00-\u9fa5]/g, '');

      if (part && !this.NON_SEMANTIC_SUFFIXES.has(part)) {
        if (this.isLowSignalIdentifier(part)) return 'value';
        return /^[0-9]/.test(part) ? `val_${part}` : part;
      }
    }

    // 兜底：从原始表达式中提取第一个标识符
    const idMatch = expressionText.match(/([a-zA-Z_$][\w$]*)/);
    if (idMatch?.[1] && !this.NON_SEMANTIC_SUFFIXES.has(idMatch[1])) {
      if (this.isLowSignalIdentifier(idMatch[1])) return 'value';
      return idMatch[1];
    }

    return 'val';
  }

  /**
   * 占位符命名"信号量"判定：低信号标识符不适合作为译者可见的占位符名。
   *
   * 译者最终在 locale 文件里看到的是 `{xxx}`，xxx 来自源代码标识符。下列形态
   * 信噪比低，对翻译几乎无帮助，且会让"中文相同但源变量名不同的字面量"分裂
   * 为多个 dedup key（如 `节点 {_ni1}` vs `节点 {nodeIndex1}`）。这些情形
   * 统一退到中立名 `value`：
   *
   * - 单字符或双字符纯小写（i / j / ni / ts / pt 等循环计数器和缩写）
   * - 下划线起始（_ni / __tmp 等约定俗成的"私有/忽略"标记）
   *
   * 三字符以上、camelCase、英文单词形态的标识符（userName / fileName /
   * pathName / nodeIndex 等）信息量足够，保留原名以维持上下文。
   */
  private static isLowSignalIdentifier(name: string): boolean {
    if (!name) return true;
    if (name.startsWith('_')) return true;
    if (name.length <= 2 && /^[a-z]+$/.test(name)) return true;
    return false;
  }

  /**
   * 根据消息文本和变量值，创建一个字符串字面量或模板表达式节点
   * @param messageText - 从语言文件中获取的、包含占位符的消息文本
   * @param values - 包含变量名到其原始AST节点映射的对象
   * @returns 创建的字符串字面量或模板表达式节点
   */
  static createStringOrTemplateNode(messageText: string, values?: Record<string, any>): ts.Node {
    if (!values || Object.keys(values).length === 0) {
      return ts.factory.createStringLiteral(messageText);
    }

    const literalParts: string[] = [];
    const placeholderNames: string[] = [];
    const regex = /\{([^}]+)\}/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(messageText)) !== null) {
      literalParts.push(messageText.substring(lastIndex, match.index));
      placeholderNames.push(match[1]!);
      lastIndex = match.index + match[0].length;
    }
    literalParts.push(messageText.substring(lastIndex));

    if (placeholderNames.length === 0) {
      return ts.factory.createStringLiteral(messageText);
    }

    if (placeholderNames.length !== Object.keys(values).length) {
      LoggerUtils.warn(
        `[Restore Warning] Mismatch between placeholders (${placeholderNames.length}) and variables (${
          Object.keys(values).length
        }). Returning raw string. Template: "${messageText}"`,
      );
      return ts.factory.createStringLiteral(messageText);
    }

    const templateSpans: ts.TemplateSpan[] = [];
    const headText = literalParts[0];

    for (let i = 0; i < placeholderNames.length; i++) {
      const placeholderName = placeholderNames[i];
      const expressionNode = CommonASTUtils.findExpressionForVariable(placeholderName!, values);
      const literal = literalParts[i + 1] || '';

      if (!expressionNode) {
        LoggerUtils.warn(
          `[Restore Warning] Could not find expression for placeholder "{${placeholderName}}". Returning raw string.`,
        );
        return ts.factory.createStringLiteral(messageText);
      }

      if (i === placeholderNames.length - 1) {
        templateSpans.push(
          ts.factory.createTemplateSpan(expressionNode, ts.factory.createTemplateTail(literal)),
        );
      } else {
        templateSpans.push(
          ts.factory.createTemplateSpan(expressionNode, ts.factory.createTemplateMiddle(literal)),
        );
      }
    }

    return ts.factory.createTemplateExpression(
      ts.factory.createTemplateHead(headText ?? ''),
      templateSpans,
    );
  }

  /**
   * 从values映射中查找变量名对应的AST表达式节点
   */
  private static findExpressionForVariable(
    varName: string,
    values: Record<string, any>,
  ): ts.Expression | undefined {
    const value = values[varName];

    if (value && typeof value === 'object') {
      if ('node' in value && 'text' in value) {
        return value.node as ts.Expression;
      } else if ('kind' in value) {
        return value as ts.Expression;
      }
    }

    return undefined;
  }

  /**
   * 解析源代码为AST
   * @param sourceText - 源代码文本
   * @param filePath - 文件路径
   * @returns TypeScript源文件对象
   */
  static parseSourceFile(sourceText: string, filePath: string): ts.SourceFile {
    return ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      CommonASTUtils.getScriptKind(filePath),
    );
  }

  /**
   * 替换代码中的字符串
   * @param sourceText - 源代码文本
   * @param replacements - 替换项列表
   * @returns 替换后的代码
   */
  static applyReplacements(
    sourceText: string,
    replacements: Array<{ start: number; end: number; replacement: string }>,
  ): string {
    if (replacements.length === 0) {
      return sourceText;
    }

    let result = sourceText;

    // 按范围大小降序排序，优先保留覆盖范围更大的替换
    const sortedBySize = [...replacements].sort((a, b) => b.end - b.start - (a.end - a.start));
    // 贪心选择：依次选入不与已选替换重叠的项
    const validReplacements: typeof replacements = [];
    for (const replacement of sortedBySize) {
      const overlapping = validReplacements.find(
        (selected) => replacement.start < selected.end && replacement.end > selected.start,
      );
      if (overlapping) {
        // 静默丢弃会让"明明提取了却没替换成功"的现象难以排查；告警便于定位
        // 调用方（如 findExactStringNode 同时返回了重叠节点）的语义问题
        LoggerUtils.warn(
          `跳过重叠替换: [${replacement.start},${replacement.end}] 与 [${overlapping.start},${overlapping.end}] 冲突，保留范围更大的项`,
        );
        continue;
      }
      validReplacements.push(replacement);
    }

    validReplacements.sort((a, b) => b.start - a.start);

    for (const { start, end, replacement } of validReplacements) {
      result = result.substring(0, start) + replacement + result.substring(end);
    }

    return result;
  }

  /**
   * 基于位置和原始文本，在源文件中查找最精确的字符串、模板或JSX文本节点
   */
  static findExactStringNode(
    sourceFile: ts.SourceFile,
    position: number,
    originalText: string,
  ): ts.Node | undefined {
    const node = CommonASTUtils.findNodeAtPosition(sourceFile, position);
    if (!node) return undefined;

    if (originalText.startsWith('`') && originalText.endsWith('`')) {
      let parent = node;
      while (parent) {
        if (ts.isJsxElement(parent)) {
          const mixedContent = CommonASTUtils.reconstructJsxMixedContent(parent, sourceFile);
          if (mixedContent === originalText) {
            return parent;
          }
        }
        parent = parent.parent;
      }

      if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const nodeText = CommonASTUtils.nodeToText(node, sourceFile);
        if (CommonASTUtils.shouldReplaceNode(nodeText, originalText, true)) {
          return node;
        }
      }

      let parent2 = node.parent;
      while (parent2) {
        if (ts.isTemplateExpression(parent2) || ts.isNoSubstitutionTemplateLiteral(parent2)) {
          const nodeText = CommonASTUtils.nodeToText(parent2, sourceFile);
          if (CommonASTUtils.shouldReplaceNode(nodeText, originalText, true)) {
            return parent2;
          }
        }
        parent2 = parent2.parent;
      }
    }

    if (ts.isStringLiteral(node)) {
      const nodeText = CommonASTUtils.nodeToText(node, sourceFile);
      if (CommonASTUtils.shouldReplaceNode(nodeText, originalText, false)) {
        return node;
      }

      let parent = node.parent;
      while (parent) {
        if (ts.isStringLiteral(parent)) {
          const parentText = CommonASTUtils.nodeToText(parent, sourceFile);
          if (CommonASTUtils.shouldReplaceNode(parentText, originalText, false)) {
            return parent;
          }
        }
        parent = parent.parent;
      }
    }

    if (ts.isJsxText(node)) {
      const nodeText = CommonASTUtils.nodeToText(node, sourceFile);
      if (CommonASTUtils.shouldReplaceNode(nodeText, originalText, false)) {
        return node;
      }
    }

    // 处理无变量模板字符串（`文本` 没有 ${} 的场景）
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      const nodeText = CommonASTUtils.nodeToText(node, sourceFile);
      if (CommonASTUtils.shouldReplaceNode(nodeText, originalText, false)) {
        return node;
      }
    }

    const nearbyNode = CommonASTUtils.findNearbyStringNode(sourceFile, position, originalText);
    if (nearbyNode) {
      return nearbyNode;
    }

    return undefined;
  }

  /**
   * 重构JSX元素的混合内容
   */
  private static reconstructJsxMixedContent(
    jsxElement: ts.JsxElement,
    sourceFile: ts.SourceFile,
  ): string {
    const children = jsxElement.children;
    if (!children || children.length === 0) {
      return '';
    }

    let templateText = '`';
    for (const child of children) {
      if (ts.isJsxText(child)) {
        // 必须与 ReactTextExtractor.extractJsxMixedContent 的空白处理逐字一致：
        // 跳过纯空白节点，含内容的把换行+缩进压缩为单空格、但保留词间空格。
        // 若此处用 trim() 去掉词间空格（「共 ${count} 项」→「共${count}项」），
        // 与提取端产出的 original 不相等，findExactStringNode 的 `=== originalText`
        // 比对失败 → 该 JSX 混合内容被静默漏替换（locale 写了 key 但源码残留中文）。
        if (!child.text.trim()) continue;
        templateText += child.text.replace(/\s*\n\s*/g, ' ');
      } else if (ts.isJsxExpression(child) && child.expression) {
        const expressionText = CommonASTUtils.nodeToText(child.expression, sourceFile);
        templateText += `\${${expressionText}}`;
      }
    }
    templateText += '`';

    return templateText;
  }

  /**
   * 在指定位置附近模糊查找匹配的字符串节点。
   *
   * Why ±NEARBY_OFFSET：上游传入的 position 由不同 AST 工具计算，可能因引号、
   * leading whitespace、JSX `{ ' ' }` 等场景偏移 1~3 字符；±5 是经验值，覆盖常见
   * 偏移又不会越界跳到相邻 token。改大无明显收益（命中率边际为 0），改小则有
   * 漏命中风险。如未来发现 ±5 不够，调整这一处常量即可。
   */
  private static readonly NEARBY_SEARCH_OFFSET = 5;

  private static findNearbyStringNode(
    sourceFile: ts.SourceFile,
    position: number,
    originalText: string,
  ): ts.Node | undefined {
    const range = CommonASTUtils.NEARBY_SEARCH_OFFSET;
    for (let offset = -range; offset <= range; offset++) {
      const nearbyPosition = position + offset;
      if (nearbyPosition < 0 || nearbyPosition >= sourceFile.text.length) {
        continue;
      }

      const node = CommonASTUtils.findNodeAtPosition(sourceFile, nearbyPosition);
      if (!node) continue;

      if (
        ts.isStringLiteral(node) ||
        ts.isJsxText(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        const nodeText = CommonASTUtils.nodeToText(node, sourceFile);
        if (CommonASTUtils.shouldReplaceNode(nodeText, originalText, false)) {
          return node;
        }
      }
    }

    return undefined;
  }

  /**
   * 决定是否应该替换一个给定的AST节点
   */
  static shouldReplaceNode(
    nodeText: string,
    originalText: string,
    _isTemplateString: boolean,
  ): boolean {
    // 解码常见 JSON 风格转义（替代之前 `JSON.parse(\`"${str}"\`)` 的兜底匹配）。
    // 旧实现遇到原文含 `"` 或孤立 `\` 时构造出非法 JSON 字符串，JSON.parse 抛错被
    // catch 吞掉，导致包含中英混合引号的中文（如 `他说："你好"`）匹配失败。
    const decodeEscapes = (text: string) =>
      text
        // 先处理 \uXXXX，避免被后面的反斜杠规则吃掉
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");

    const normalizeText = (text: string) => {
      text = text.replace(/^['"`]|['"`]$/g, '');
      text = text.replace(/\r?\n/g, '\n');
      text = decodeEscapes(text);
      return text;
    };

    return normalizeText(nodeText) === normalizeText(originalText);
  }

  /**
   * 判断模板变量表达式是否是字面量（不需要作为 i18n 参数传入）
   * 字面量包括：字符串字面量、数字字面量、布尔值、null/undefined
   */
  static isLiteralExpression(varExpr: string): boolean {
    const trimmed = varExpr.trim();
    if (/^['"`].*['"`]$/.test(trimmed)) return true;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return true;
    if (trimmed === 'true' || trimmed === 'false') return true;
    if (trimmed === 'null' || trimmed === 'undefined') return true;
    return false;
  }

  /**
   * 求值字面量表达式，返回其展开值（用于直接拼到 message 中）
   * - 字符串字面量去掉外层引号
   * - 其它字面量保持原文
   */
  static evalLiteralExpression(varExpr: string): string {
    const trimmed = varExpr.trim();
    if (/^['"`].*['"`]$/.test(trimmed)) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  /**
   * 过滤掉 templateVariables 中的字面量值，只保留真正的变量表达式
   * 框架无关，Vue/React 共用
   */
  static filterLiterals(templateVariables: string[]): string[] {
    return templateVariables.filter((varExpr) => !CommonASTUtils.isLiteralExpression(varExpr));
  }

  /**
   * 占位符名匹配：标识符 / 含点的路径（如 `count`、`user.name`）。
   * 与 createMessageWithOptions 写入的占位符名（来自 getVariableNameFromExpression）保持一致。
   */
  private static readonly PLACEHOLDER_NAME = '[A-Za-z0-9_$.]+';

  /**
   * 单花括号 `{name}` → 双花括号 `{{name}}`。
   * 用于 i18next 系库（react-i18next / vue-i18next）写入 locale 前的边界转换。
   *
   * 幂等：用负向断言 `(?<!\{)...(?!\})` 跳过已是 `{{name}}` 的占位符，避免重复转换
   * 成 `{{{name}}}`。Why 必须幂等：apply-plan 路径会把 dry-run 已转换的
   * plan.localeDelta 再次喂入 updateLanguageFiles（commitToDisk 仍按 library 标志
   * 转换），若非幂等就会三花括号畸形。
   */
  static toDoubleBracePlaceholders(message: string): string {
    return message.replace(
      new RegExp(`(?<!\\{)\\{(${CommonASTUtils.PLACEHOLDER_NAME})\\}(?!\\})`, 'g'),
      '{{$1}}',
    );
  }

  /**
   * 双花括号 `{{name}}` → 单花括号 `{name}`。
   * 用于 i18next 系库 restore 时把 locale 文本归一回内部规范形式，
   * 复用既有的单花括号还原逻辑（React createStringOrTemplateNode / Vue 占位符正则）。
   */
  static toSingleBracePlaceholders(message: string): string {
    return message.replace(
      new RegExp(`\\{\\{\\s*(${CommonASTUtils.PLACEHOLDER_NAME})\\s*\\}\\}`, 'g'),
      '{$1}',
    );
  }

  /**
   * 将含模板变量的文本转换为 i18n 占位符格式
   * 框架无关，同时用于 Vue 和 React 的模板处理
   *
   * 字面量插值（如 `${'active'}`）会被直接展开为字面值嵌入 message，
   * 不进入 placeholderMap —— 保证 locale message 占位符与代码侧参数对象 key
   * 严格一致（Why: LanguageFileManager 与 Transformer 必须使用相同语义，否则
   * locale 中会出现运行时没有对应实参的孤儿占位符）。
   */
  static createMessageWithOptions(
    originalText: string,
    templateVariables?: string[],
  ): { message: string; placeholderMap: Map<string, string> } {
    const placeholderMap = new Map<string, string>();
    let message = originalText.replace(/^['"`]|['"`]$/g, '');

    if (templateVariables && templateVariables.length > 0) {
      // 1. 先展开字面量插值：${'active'} → active
      templateVariables
        .filter((expr) => CommonASTUtils.isLiteralExpression(expr))
        .forEach((expr) => {
          const literalValue = CommonASTUtils.evalLiteralExpression(expr);
          message = message.split(`\${${expr}}`).join(literalValue);
        });

      // 2. 再为真实变量生成占位符
      const actualVariables = templateVariables.filter(
        (expr) => !CommonASTUtils.isLiteralExpression(expr),
      );
      const usedNames = new Set<string>();

      actualVariables.forEach((variableExpr) => {
        let key = CommonASTUtils.getVariableNameFromExpression(variableExpr);

        if (!key || key.trim() === '') {
          LoggerUtils.warn(
            `[i18n] Generated empty placeholder key for expression: ${variableExpr}, using 'val'`,
          );
          key = 'val';
        }

        const originalKey = key;
        let count = 1;

        while (usedNames.has(key)) {
          key = `${originalKey}${count++}`;
        }

        usedNames.add(key);
        placeholderMap.set(variableExpr, key);
      });

      placeholderMap.forEach((placeholder, expression) => {
        const searchPattern = `\${${expression}}`;
        message = message.split(searchPattern).join(`{${placeholder}}`);
      });
    }

    return { message, placeholderMap };
  }

  // ==================== Import 文本操作 ====================

  /**
   * 启发式剥除 JS/TS/Vue 源码中的注释（行注释、块注释、HTML 注释），保留字符串字面量。
   *
   * Why: 工具的多处静态扫描（doctor 的 t() 引用收集、IdReuseResolver 的 existingIds
   * 收集等）只需要识别"真实代码里调用的 t('xxx')"。若不剥注释，被注释掉的示例代码
   * 中的 t('xxx') 会被误统计，产生 false-positive（如 doctor 的 missing-key 误报）。
   *
   * 与 VueComponentInjector.stripCommentsAndStrings 区别：
   *  - 那里需要的是"判断真实代码中是否存在 t() 调用"，连字符串也一并吞掉
   *  - 这里需要保留字符串内容供正则提取 t('key') 的 key 字面量
   *
   * 实现：单遍扫描 + 引号/反引号状态机，正确跳过字符串/模板字面量内部的注释起始序列
   * （行注释、块注释、HTML 注释开头都按字符串内文本处理，不进入注释状态）。
   * Why 不用单纯正则：JSX 里 href 含 URL（双斜杠）+ 同行 t 调用时，单纯
   * 「匹配整行直至换行的双斜杠正则」会把 URL 后半段（含同行的 t 调用）一并替换为空格，
   * 导致 doctor 漏报 used-key（误报 orphan / missing）。
   */
  static stripComments(code: string): string {
    const out: string[] = [];
    const len = code.length;
    let i = 0;

    // 状态栈：栈顶为当前所处的语法上下文，支持模板字符串 ${...} 内嵌套字符串/模板/注释。
    // - none      : 代码区
    // - dq/sq     : 双/单引号字符串
    // - tpl       : 模板字符串外层（反引号内、非 ${} 段）
    // - tpl_expr  : 模板字符串内 ${...} 表达式区（属于代码上下文，需追踪 { 嵌套深度）
    // - line/block/html : 三类注释
    type FrameKind = 'none' | 'dq' | 'sq' | 'tpl' | 'tpl_expr' | 'line' | 'block' | 'html';
    interface Frame {
      kind: FrameKind;
      braceDepth?: number;
      // 块注释内容起点（`/*` 之后第一个字符的下标）。用于判定 `*/` 闭合时，
      // 排除开头 `/*` 自身的 `*`，避免把 `/*/` 误判为完整闭合注释。
      blockContentStart?: number;
    }
    const stack: Frame[] = [{ kind: 'none' }];
    const top = (): Frame => stack[stack.length - 1]!;

    while (i < len) {
      const frame = top();
      const ch = code[i]!;
      const next = code[i + 1];

      // 代码上下文（含模板表达式内）：识别字符串/注释起始，tpl_expr 还需匹配 ${} 的闭合
      if (frame.kind === 'none' || frame.kind === 'tpl_expr') {
        if (ch === '"') {
          stack.push({ kind: 'dq' });
          out.push(ch);
          i++;
          continue;
        }
        if (ch === "'") {
          stack.push({ kind: 'sq' });
          out.push(ch);
          i++;
          continue;
        }
        if (ch === '`') {
          stack.push({ kind: 'tpl' });
          out.push(ch);
          i++;
          continue;
        }
        if (ch === '/' && next === '*') {
          // 记录内容起点（跳过 `/*` 后的下标），闭合判定据此排除开头的 `*`。
          stack.push({ kind: 'block', blockContentStart: i + 2 });
          out.push(' ');
          i += 2;
          continue;
        }
        if (ch === '/' && next === '/') {
          stack.push({ kind: 'line' });
          out.push(' ');
          i += 2;
          continue;
        }
        if (ch === '<' && code.startsWith('!--', i + 1)) {
          stack.push({ kind: 'html' });
          out.push(' ');
          i += 4;
          continue;
        }
        // tpl_expr 中追踪 { / } 嵌套；遇到深度为 0 的 } 表示 ${...} 闭合，弹栈回到外层 tpl
        if (frame.kind === 'tpl_expr') {
          if (ch === '{') {
            frame.braceDepth = (frame.braceDepth ?? 0) + 1;
            out.push(ch);
            i++;
            continue;
          }
          if (ch === '}') {
            if ((frame.braceDepth ?? 0) === 0) {
              stack.pop();
              out.push(ch);
              i++;
              continue;
            }
            frame.braceDepth = (frame.braceDepth ?? 0) - 1;
            out.push(ch);
            i++;
            continue;
          }
        }
        out.push(ch);
        i++;
        continue;
      }

      // 普通字符串：处理转义与闭合
      if (frame.kind === 'dq' || frame.kind === 'sq') {
        if (ch === '\\') {
          out.push(ch);
          if (i + 1 < len) out.push(code[i + 1]!);
          i += 2;
          continue;
        }
        const quote = frame.kind === 'dq' ? '"' : "'";
        if (ch === quote) {
          stack.pop();
        }
        out.push(ch);
        i++;
        continue;
      }

      // 模板字符串：识别 ${ 嵌入表达式与反引号闭合
      if (frame.kind === 'tpl') {
        if (ch === '\\') {
          out.push(ch);
          if (i + 1 < len) out.push(code[i + 1]!);
          i += 2;
          continue;
        }
        if (ch === '$' && next === '{') {
          stack.push({ kind: 'tpl_expr', braceDepth: 0 });
          out.push('$');
          out.push('{');
          i += 2;
          continue;
        }
        if (ch === '`') {
          stack.pop();
        }
        out.push(ch);
        i++;
        continue;
      }

      // 块注释：吃到 */，整段替空格（保留行结构以便行号不漂移）
      if (frame.kind === 'block') {
        // 闭合要求 `*` 的下标 ≥ 内容起点，否则 `/*/` 会把开头 `/*` 的 `*` 误当 `*/`。
        if (ch === '/' && code[i - 1] === '*' && i - 1 >= (frame.blockContentStart ?? 1)) {
          stack.pop();
        }
        out.push(ch === '\n' ? '\n' : ' ');
        i++;
        continue;
      }

      // 行注释：吃到行尾
      if (frame.kind === 'line') {
        if (ch === '\n') {
          stack.pop();
          out.push('\n');
        } else {
          out.push(' ');
        }
        i++;
        continue;
      }

      // HTML 注释：吃到 -->
      if (frame.kind === 'html') {
        if (ch === '>' && code[i - 1] === '-' && code[i - 2] === '-') {
          stack.pop();
        }
        out.push(ch === '\n' ? '\n' : ' ');
        i++;
        continue;
      }
    }

    return out.join('');
  }

  /**
   * 在文本行数组中查找最后一条 import 语句的行号；没有则返回 -1。
   *
   * Why: React 与 Vue 的 ImportManager 都需要这个能力来确定"插入新 import 的锚点"，
   * 此前两端各自实现（一份反向遍历、一份正向遍历），结果等价但维护两份易漂移。
   */
  static findLastImportLineIndex(lines: string[]): number {
    // 多行 import（如 `import {\n  A,\n  B,\n} from 'x'`）只用 startsWith('import ')
    // 检测会让 lastImportIndex 停在第一行（`import {`），随后 `appendImportLine` 把
    // 新 import 插到第二行，落入花括号内部，产生语法错误。
    // 这里通过 brace 平衡跨行追踪 import 语句的真实结束行。
    let lastImportEndLine = -1;
    let pendingDepth = 0; // 当前 import 内尚未闭合的 { 深度

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      if (pendingDepth > 0) {
        pendingDepth += CommonASTUtils.countBraceDelta(line);
        if (pendingDepth === 0) {
          // brace 闭合那一行就是该 import 的实际结束行
          lastImportEndLine = i;
        }
        continue;
      }

      if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
        const depth = CommonASTUtils.countBraceDelta(line);
        if (depth === 0) {
          lastImportEndLine = i;
        } else {
          pendingDepth = depth;
        }
      }
    }

    return lastImportEndLine;
  }

  /**
   * 计算单行内净 `{` - `}` 数，跳过字符串字面量内部的括号。
   *
   * Why: 字符串内 `{`/`}`（如 `from '@/i18n{mock}'` 这种含特殊字符的别名路径、
   * 或字符串 payload 内含括号）若被计入大括号深度，会让 import 边界追踪错位，
   * 导致 `const { t } = useI18n()` 之类的注入落到错误行。
   *
   * 不处理转义字符（`\\'`），对当前用途够用——import 行内出现 `\\'` 极罕见，
   * 即便出错也只是行号偏差，不会破坏语义。
   */
  private static countBraceDelta(line: string): number {
    let delta = 0;
    let quote: '"' | "'" | '`' | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote !== null) {
        if (ch === '\\') {
          i++; // 跳过下一字符（处理 \" \' \` 等转义）
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
      } else if (ch === '{') {
        delta++;
      } else if (ch === '}') {
        delta--;
      }
    }
    return delta;
  }

  /**
   * 把 importStatement 插入到代码字符串中"最后一条 import 之后"。
   * 已 trim，调用方不需要再处理换行。
   */
  static appendImportLine(code: string, importStatement: string): string {
    const lines = code.split('\n');
    const lastImportIndex = CommonASTUtils.findLastImportLineIndex(lines);
    lines.splice(lastImportIndex + 1, 0, importStatement.trim());
    return lines.join('\n');
  }

  /**
   * 从代码中精准摘除指定包的命名导入项。仅删除 names 列表中的名字，
   * 不破坏同一条 import 内的其他名字。若摘除后命名列表为空，整条 import 行
   * 一并删除。
   *
   * Why 精准摘除：早先各 i18n library 暴露 getImportCleanupRegex 直接匹配整条
   * `import { … } from 'pkg'` 后 replace 成空串——用户若在同一行手写其他导出
   * （如 `import { useI18n, createI18n } from 'vue-i18n'`），restore 会把
   * createI18n 也删掉，下游编译报错。
   *
   * @param code            源代码
   * @param isTargetModule  判断某个 `from 'X'` 是否属于目标库（支持包名别名）
   * @param namesToRemove   要从命名列表中摘除的名字（精确匹配，trim 后比对）
   */
  static removeNamedImports(
    code: string,
    isTargetModule: (moduleName: string) => boolean,
    namesToRemove: string[],
  ): string {
    if (namesToRemove.length === 0) return code;
    // 整行匹配；尾部 `;?` `\n?` 与原 getImportCleanupRegex 行为一致，
    // 避免删除后留下空行。
    const importRegex = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?\n?/g;
    return code.replace(importRegex, (match, namedList: string, moduleName: string) => {
      if (!isTargetModule(moduleName)) return match;
      const remaining = namedList
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        // `useI18n as foo` 这类重命名导入：取 ` as ` 之前的原始名作为比对锚点
        .filter((entry) => {
          const original = entry.split(/\s+as\s+/)[0]!.trim();
          return !namesToRemove.includes(original);
        });
      if (remaining.length === 0) return '';
      // 复用原始行尾分号/换行，保留风格一致
      const hasSemi = match.trimEnd().endsWith(';');
      const hasNewline = match.endsWith('\n');
      return `import { ${remaining.join(', ')} } from '${moduleName}'${hasSemi ? ';' : ''}${hasNewline ? '\n' : ''}`;
    });
  }

  /**
   * 合并/插入命名导入：若代码中已存在 `import { ... } from packageName`，把新 names
   * 并入现有花括号；否则在最后一条 import 之后追加新 import 行。
   *
   * 返回更新后的代码；语义上等价于 React/Vue 端原本各自实现的 addLibraryImports。
   */
  static mergeNamedImport(code: string, packageName: string, names: string[]): string {
    if (names.length === 0) return code;
    const escapedPkg = CommonASTUtils.escapeRegExp(packageName);
    // 全局匹配，捕获所有同包的 named import 语句（多条 import { A } from 'x'; import { B } from 'x';）
    const importRegex = new RegExp(
      `import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escapedPkg}['"];?`,
      'g',
    );
    const matches = [...code.matchAll(importRegex)];

    if (matches.length > 0) {
      // 收集所有已存在的命名导入并与新增合并去重
      const existing = matches.flatMap((m) =>
        m[1]!
          .split(',')
          .map((imp) => imp.trim())
          .filter(Boolean),
      );
      const merged = [...new Set([...existing, ...names])];
      const replacement = `import { ${merged.join(', ')} } from '${packageName}';`;

      // 用合并后的语句替换第一处，删除其余同包导入语句以避免冗余
      let result = code.replace(matches[0]![0], replacement);
      for (let i = 1; i < matches.length; i++) {
        result = result.replace(matches[i]![0], '');
      }
      // 清理可能产生的连续空行
      return result.replace(/\n{3,}/g, '\n\n');
    }
    const importStatement = `import { ${names.join(', ')} } from '${packageName}';`;
    return CommonASTUtils.appendImportLine(code, importStatement);
  }
}
