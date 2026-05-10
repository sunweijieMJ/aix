import ts from 'typescript';
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
  static templateLiteralsContainChinese(
    node: ts.TemplateExpression,
    containsChinese: (text: string) => boolean,
  ): boolean {
    if (containsChinese(node.head.text)) return true;
    return node.templateSpans.some((span) => containsChinese(span.literal.text));
  }

  /**
   * 检查节点是否已被框架无关的国际化结构包裹（t()/$t() 调用）。
   * 框架/库特定的 JSX 组件（如 FormattedMessage/Trans）由各 i18n 库适配器自行覆盖。
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

      // 类型字面量（type X = '中文'）和枚举成员值（InProgress = '中文'）不应被提取
      if (ts.isLiteralTypeNode(parent) || ts.isEnumMember(parent)) {
        return false;
      }

      if (ts.isBlock(parent) || ts.isFunctionLike(parent) || ts.isClassLike(parent)) {
        return false;
      }

      parent = parent.parent;
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
    return sourceFile.text.substring(node.getFullStart(), node.getEnd()).trim();
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
    // 使用非贪婪匹配移除函数调用参数，避免 (a * b).toFixed(2) 整体被吃掉
    let baseName = expressionText.replace(/\([^)]*\)/g, '');
    baseName = baseName.replace(/\?\.|\?/g, '.');
    const parts = baseName.split('.').filter((p) => p.trim() !== '');

    // 从后往前找第一个有语义的部分（跳过 .value、.toFixed 等）
    for (let i = parts.length - 1; i >= 0; i--) {
      let part = parts[i] ?? '';
      part = part.replace(/^['"`]|['"`]$/g, '');
      part = part.replace(/[^\w\u4e00-\u9fa5]/g, '');

      if (part && !this.NON_SEMANTIC_SUFFIXES.has(part)) {
        return /^[0-9]/.test(part) ? `val_${part}` : part;
      }
    }

    // 兜底：从原始表达式中提取第一个标识符
    const idMatch = expressionText.match(/([a-zA-Z_$][\w$]*)/);
    if (idMatch?.[1] && !this.NON_SEMANTIC_SUFFIXES.has(idMatch[1])) {
      return idMatch[1];
    }

    return 'val';
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
      const hasOverlap = validReplacements.some(
        (selected) => replacement.start < selected.end && replacement.end > selected.start,
      );
      if (!hasOverlap) {
        validReplacements.push(replacement);
      }
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
        const text = child.text.trim();
        if (text) {
          templateText += text;
        }
      } else if (ts.isJsxExpression(child) && child.expression) {
        const expressionText = CommonASTUtils.nodeToText(child.expression, sourceFile);
        templateText += `\${${expressionText}}`;
      }
    }
    templateText += '`';

    return templateText;
  }

  /**
   * 在指定位置附近模糊查找匹配的字符串节点
   */
  private static findNearbyStringNode(
    sourceFile: ts.SourceFile,
    position: number,
    originalText: string,
  ): ts.Node | undefined {
    for (let offset = -5; offset <= 5; offset++) {
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
   * 将含模板变量的文本转换为 i18n 占位符格式
   * 框架无关，同时用于 Vue 和 React 的模板处理
   */
  static createMessageWithOptions(
    originalText: string,
    templateVariables?: string[],
  ): { message: string; placeholderMap: Map<string, string> } {
    const placeholderMap = new Map<string, string>();
    let message = originalText.replace(/^['"`]|['"`]$/g, '');

    if (templateVariables && templateVariables.length > 0) {
      const usedNames = new Set<string>();

      templateVariables.forEach((variableExpr) => {
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
   * 在文本行数组中查找最后一条 import 语句的行号；没有则返回 -1。
   *
   * Why: React 与 Vue 的 ImportManager 都需要这个能力来确定"插入新 import 的锚点"，
   * 此前两端各自实现（一份反向遍历、一份正向遍历），结果等价但维护两份易漂移。
   */
  static findLastImportLineIndex(lines: string[]): number {
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    return lastImportIndex;
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
