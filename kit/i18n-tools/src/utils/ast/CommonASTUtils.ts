import ts from 'typescript';
import { LoggerUtils } from '../logger';

/**
 * 通用 AST 工具类
 * 提供框架无关的 TypeScript AST 操作功能
 */
export class CommonASTUtils {
  /**
   * 检查节点是否已被国际化结构包裹
   * 支持检测 t()/$t()、formatMessage()、defineMessages()、
   * FormattedMessage/Trans JSX 组件等
   */
  static isAlreadyInternationalized(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent) {
      if (ts.isCallExpression(parent)) {
        const expression = parent.expression;

        if (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.name) &&
          expression.name.text === 'formatMessage'
        ) {
          return true;
        }

        if (
          ts.isIdentifier(expression) &&
          expression.text === 'defineMessages'
        ) {
          return true;
        }

        if (
          ts.isIdentifier(expression) &&
          (expression.text === 't' || expression.text === '$t')
        ) {
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

      if (ts.isJsxAttribute(parent)) {
        const jsxElement = parent.parent.parent;
        if (
          ts.isJsxOpeningElement(jsxElement) ||
          ts.isJsxSelfClosingElement(jsxElement)
        ) {
          if (
            ts.isIdentifier(jsxElement.tagName) &&
            (jsxElement.tagName.text === 'FormattedMessage' ||
              jsxElement.tagName.text === 'Trans')
          ) {
            return true;
          }
        }
      }
      if (ts.isJsxElement(parent)) {
        const openingElement = parent.openingElement;
        if (
          ts.isIdentifier(openingElement.tagName) &&
          (openingElement.tagName.text === 'FormattedMessage' ||
            openingElement.tagName.text === 'Trans')
        ) {
          return true;
        }
      }

      if (
        ts.isBlock(parent) ||
        ts.isFunctionLike(parent) ||
        ts.isClassLike(parent)
      ) {
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
  static findNodeAtPosition(
    sourceFile: ts.SourceFile,
    position: number,
  ): ts.Node | undefined {
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
          props[key] = CommonASTUtils.getPropertyValue(
            property.initializer,
            sourceFile,
          );
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
  private static getPropertyValue(
    initializer: ts.Expression,
    sourceFile?: ts.SourceFile,
  ): any {
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
  static createStringOrTemplateNode(
    messageText: string,
    values?: Record<string, any>,
  ): ts.Node {
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
      const expressionNode = CommonASTUtils.findExpressionForVariable(
        placeholderName!,
        values,
      );
      const literal = literalParts[i + 1] || '';

      if (!expressionNode) {
        LoggerUtils.warn(
          `[Restore Warning] Could not find expression for placeholder "{${placeholderName}}". Returning raw string.`,
        );
        return ts.factory.createStringLiteral(messageText);
      }

      if (i === placeholderNames.length - 1) {
        templateSpans.push(
          ts.factory.createTemplateSpan(
            expressionNode,
            ts.factory.createTemplateTail(literal),
          ),
        );
      } else {
        templateSpans.push(
          ts.factory.createTemplateSpan(
            expressionNode,
            ts.factory.createTemplateMiddle(literal),
          ),
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
    const sortedBySize = [...replacements].sort(
      (a, b) => b.end - b.start - (a.end - a.start),
    );
    // 贪心选择：依次选入不与已选替换重叠的项
    const validReplacements: typeof replacements = [];
    for (const replacement of sortedBySize) {
      const hasOverlap = validReplacements.some(
        (selected) =>
          replacement.start < selected.end && replacement.end > selected.start,
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
          const mixedContent = CommonASTUtils.reconstructJsxMixedContent(
            parent,
            sourceFile,
          );
          if (mixedContent === originalText) {
            return parent;
          }
        }
        parent = parent.parent;
      }

      if (
        ts.isTemplateExpression(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        const nodeText = CommonASTUtils.nodeToText(node, sourceFile);
        if (CommonASTUtils.shouldReplaceNode(nodeText, originalText, true)) {
          return node;
        }
      }

      let parent2 = node.parent;
      while (parent2) {
        if (
          ts.isTemplateExpression(parent2) ||
          ts.isNoSubstitutionTemplateLiteral(parent2)
        ) {
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
          if (
            CommonASTUtils.shouldReplaceNode(parentText, originalText, false)
          ) {
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

    const nearbyNode = CommonASTUtils.findNearbyStringNode(
      sourceFile,
      position,
      originalText,
    );
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
        const expressionText = CommonASTUtils.nodeToText(
          child.expression,
          sourceFile,
        );
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

      const node = CommonASTUtils.findNodeAtPosition(
        sourceFile,
        nearbyPosition,
      );
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
    isTemplateString: boolean,
  ): boolean {
    const normalizeText = (text: string) => {
      text = text.replace(/^['"`]|['"`]$/g, '');
      text = text.replace(/\r?\n/g, '\n');
      text = text.replace(/\\n/g, '\n');
      return text;
    };

    if (isTemplateString) {
      return normalizeText(nodeText) === normalizeText(originalText);
    }

    const normalizedNodeText = normalizeText(nodeText);
    const normalizedOriginalText = normalizeText(originalText);

    if (normalizedNodeText === normalizedOriginalText) {
      return true;
    }

    try {
      const parsedNodeText = JSON.parse(`"${normalizedNodeText}"`);
      const parsedOriginalText = JSON.parse(`"${normalizedOriginalText}"`);
      return parsedNodeText === parsedOriginalText;
    } catch {
      return false;
    }
  }
}
