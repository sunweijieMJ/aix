import ts from 'typescript';
import { CHINESE_CHAR_RANGE, PLACEHOLDER_NAME_CHARS } from './constants';
import { LoggerUtils } from './logger';
import { collectNestedChineseLiterals } from './ast-guards';
import { buildTemplateExpressionOriginal, nodeToText } from './ast-core';
import { stripMatchedDelimiters } from './string-escape';
import type { LocaleMap, ExtractedString } from './types';

/**
 * 消息形态层：把「源码里的模板/字面量」与「locale 文件里的文案」互相换算。
 *
 * 职责边界：占位符命名、字面量插值内联、单/双花括号方言适配、locale 值定稿与
 * restore 归一都归这里。它是 generate 落盘与 restore 读回共用的唯一形态口径——
 * 任何一侧绕开本模块自行拼接，都会让两端形态漂移（反查 miss → 重复 key / 丢占位符）。
 * 本模块只产出**文本**；把文本重建回 AST 节点属于 restore-node-factory。
 */

/** 非「标识符字符或中文」的字符，用于把表达式片段清洗成合法占位符名。 */
const NON_IDENT_OR_CHINESE_RE = new RegExp(`[^\\w${CHINESE_CHAR_RANGE}]`, 'g');

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
 * React 与 Vue 共用本方法保证行为一致：字面量插值（如 `Hello${'world'}`）内联回 text，
 * 仅真正的变量表达式作占位符，避免被错误拆成两个占位符。
 */
export function processTemplateExpression(
  node: ts.TemplateExpression,
  sourceFile: ts.SourceFile,
): {
  originalText: string;
  processedText: string;
  templateVariables: string[];
  nestedChineseTexts: string[];
} {
  // originalText 由 ast-core 的重建函数产出：转换端定位/复核节点时用同一函数再算一遍，
  // 两边同源才不会因「表达式内空格」「cooked 段被二次解转义」等差异比不相等而中止转换。
  const originalText = buildTemplateExpressionOriginal(node, sourceFile);
  let processedText = '`' + node.head.text;
  const templateVariables: string[] = [];
  const nestedChineseTexts: string[] = [];

  for (const span of node.templateSpans) {
    const expression = span.expression;
    const expressionText = nodeToText(expression, sourceFile);

    const isLiteral =
      ts.isStringLiteral(expression) ||
      ts.isNumericLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression) ||
      expression.kind === ts.SyntaxKind.TrueKeyword ||
      expression.kind === ts.SyntaxKind.FalseKeyword ||
      expression.kind === ts.SyntaxKind.NullKeyword;

    if (isLiteral) {
      // 处理后的文本内联字面量值（原始文本保持 ${...}，见上方 buildTemplateExpressionOriginal）
      let literalValue = expressionText;
      if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
        literalValue = expression.text;
      }
      processedText += literalValue + span.literal.text;
    } else {
      // 非字面量表达式整体当作占位符（{var}）。表达式子树内的中文字面量（如
      // `${cond ? '内部错误' : '网络异常'}` 的两个分支）既不会被提取、也不会被内联，
      // 而是作为运行时参数原样塞进占位符——切到非源语种后渲染出未翻译的中文（静默泄漏）。
      // 这里把它们收集出来，供 extractor 记入诊断（nested-interpolation-chinese），
      // 让 lint / doctor 显式暴露，而非自动改写（递归改三元风险高，交人工决策）。
      nestedChineseTexts.push(...collectNestedChineseLiterals(expression));
      templateVariables.push(expressionText);
      processedText += '${' + expressionText + '}' + span.literal.text;
    }
  }

  return {
    originalText,
    processedText: processedText + '`',
    templateVariables,
    nestedChineseTexts,
  };
}

/**
 * 「单个完整带引号字面量」判定。区别于 `/^['"`].*['"`]$/`（只看首尾字符）：
 *  - 字符串字面量：首尾引号之间不得出现未转义的同种引号，否则 `'(' + count + ')'`
 *    这类首尾恰为引号的【拼接表达式】会被误判为字面量（evalLiteralExpression 只切首尾字符
 *    → 产出坏文本 `(' + count + '`、真变量 count 丢失）。
 *  - 模板字符串：仅无插值 `${}` 的 NoSubstitutionTemplateLiteral 才算字面量；含 `${}`
 *    的模板（如 `` `${a}-${b}` ``）是变量表达式，必须落到真变量路径。
 */
const QUOTED_LITERAL_PATTERNS: readonly RegExp[] = [
  /^'(?:[^'\\]|\\.)*'$/,
  /^"(?:[^"\\]|\\.)*"$/,
  /^`(?:[^`\\$]|\\.|\$(?!\{))*`$/,
];

function isQuotedLiteral(trimmed: string): boolean {
  return QUOTED_LITERAL_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * 判断模板变量表达式是否是字面量（不需作为 i18n 参数传入）。
 * 字面量包括：字符串字面量、数字字面量、布尔值、null / undefined。
 */
export function isLiteralExpression(varExpr: string): boolean {
  const trimmed = varExpr.trim();
  if (isQuotedLiteral(trimmed)) return true;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return true;
  if (trimmed === 'true' || trimmed === 'false') return true;
  if (trimmed === 'null' || trimmed === 'undefined') return true;
  return false;
}

/**
 * 求值字面量表达式，返回其展开值（用于直接拼到 message 中）
 * - 字符串/无插值模板字面量去掉外层引号/反引号
 * - 其它字面量保持原文
 */
export function evalLiteralExpression(varExpr: string): string {
  const trimmed = varExpr.trim();
  if (isQuotedLiteral(trimmed)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * 过滤掉 templateVariables 中的字面量值，只保留真正的变量表达式
 * 框架无关，Vue/React 共用
 */
export function filterLiterals(templateVariables: string[]): string[] {
  return templateVariables.filter((varExpr) => !isLiteralExpression(varExpr));
}

/**
 * 非语义后缀集合：这些属性名/方法名不适合作为占位符名称
 */
const NON_SEMANTIC_SUFFIXES = new Set([
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
function isLowSignalIdentifier(name: string): boolean {
  if (!name) return true;
  if (name.startsWith('_')) return true;
  if (name.length <= 2 && /^[a-z]+$/.test(name)) return true;
  return false;
}

export function getVariableNameFromExpression(expressionText: string): string {
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

  // 用否定字符类 `[^)]*` 移除函数调用参数，避免 `.*` 贪婪地把 (a * b).toFixed(2) 整体吃掉
  // 剥掉 `[...]` 让 `progressMap[item.pathId]` 退回 `progressMap` —— 下标里的
  // key 名描述的是字典 key，与字典值语义无关，作为占位符名会误导译者。
  let baseName = expressionText.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
  baseName = baseName.replace(/\?\.|\?/g, '.');
  const parts = baseName.split('.').filter((p) => p.trim() !== '');

  // 从后往前找第一个有语义的部分（跳过 .value、.toFixed 等）
  for (let i = parts.length - 1; i >= 0; i--) {
    let part = parts[i] ?? '';
    part = part.replace(/^['"`]|['"`]$/g, '');
    // 中文区间拼 CHINESE_CHAR_RANGE，与 CHINESE_CHAR_RE / containsChinese 同源：
    // 曾在此写死上界 U+9FA5，把 U+9FA6-U+9FFF 扩充汉字当非中文剔除，判定口径与提取端不一致。
    part = part.replace(NON_IDENT_OR_CHINESE_RE, '');

    if (part && !NON_SEMANTIC_SUFFIXES.has(part)) {
      if (isLowSignalIdentifier(part)) return 'value';
      return /^[0-9]/.test(part) ? `val_${part}` : part;
    }
  }

  // 兜底：从原始表达式中提取第一个标识符
  const idMatch = expressionText.match(/([a-zA-Z_$][\w$]*)/);
  if (idMatch?.[1] && !NON_SEMANTIC_SUFFIXES.has(idMatch[1])) {
    if (isLowSignalIdentifier(idMatch[1])) return 'value';
    return idMatch[1];
  }

  return 'val';
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
export function createMessageWithOptions(
  originalText: string,
  templateVariables?: string[],
): { message: string; placeholderMap: Map<string, string> } {
  const placeholderMap = new Map<string, string>();
  // 仅剥模板反引号：入参是「合成的 backtick template」或去定界符的内容值，
  // 内容里的 ASCII 引号（如 `点击"提交"`）必须原样保留，不能当定界符删掉。
  let message = stripMatchedDelimiters(originalText, ['`']);

  if (templateVariables && templateVariables.length > 0) {
    // 1. 先展开字面量插值：${'active'} → active
    templateVariables
      .filter((expr) => isLiteralExpression(expr))
      .forEach((expr) => {
        const literalValue = evalLiteralExpression(expr);
        message = message.split(`\${${expr}}`).join(literalValue);
      });

    // 2. 再为真实变量生成占位符
    const actualVariables = templateVariables.filter((expr) => !isLiteralExpression(expr));
    const usedNames = new Set<string>();

    actualVariables.forEach((variableExpr) => {
      let key = getVariableNameFromExpression(variableExpr);

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

/**
 * 把含单花括号占位符的文案切分为字面段与占位符名两个列表。
 * `共 {a} 项 {b}` → `{ literalParts: ['共 ', ' 项 ', ''], placeholderNames: ['a', 'b'] }`。
 * 不变式：`literalParts.length === placeholderNames.length + 1`（首尾必有字面段，可为空串）。
 *
 * createStringOrTemplateNode（模板字面量）与 createJsxFragmentFromTemplate（JSX 片段）
 * 共用此切分，确保两条 restore 路径占位符解析口径一致。
 */
export function parseTemplatePlaceholders(messageText: string): {
  literalParts: string[];
  placeholderNames: string[];
} {
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
  return { literalParts, placeholderNames };
}

/**
 * 占位符名匹配：标识符 / 含点的路径（如 `count`、`user.name`）。
 * 与 createMessageWithOptions 写入的占位符名（来自 getVariableNameFromExpression）保持一致——
 * 后者有意保留中文标识符（CHINESE_CHAR_RANGE，中文变量名是合法 JS），故这里必须同字符集，
 * 否则 `共{{数量}}个` 在 restore 归一时不被识别，双花括号库往返丢变量。
 * 字符集与 placeholder-utils 的 IDENT_RE 同源，见 PLACEHOLDER_NAME_CHARS 注释。
 */
const PLACEHOLDER_NAME = `[${PLACEHOLDER_NAME_CHARS}]+`;

/**
 * 双花括号 `{{name}}` → 单花括号 `{name}`。
 * 用于 i18next 系库 restore 时把 locale 文本归一回内部规范形式，
 * 复用既有的单花括号还原逻辑（React createStringOrTemplateNode / Vue 占位符正则）。
 */
export function toSingleBracePlaceholders(message: string): string {
  return message.replace(new RegExp(`\\{\\{\\s*(${PLACEHOLDER_NAME})\\s*\\}\\}`, 'g'), '{$1}');
}

/**
 * 单条消息的 restore 归一（normalizeRestoreLocaleMap 的逐值实现）。
 * 供 restore 兜底路径（locale 缺 key 时用源码 defaultMessage 当模板）复用同一口径，
 * 避免双花括号 / 转义字面量花括号未归一就喂给单花括号解析逻辑而丢失占位符。
 */
export function normalizeRestoreMessage(
  message: string,
  library: {
    usesDoubleBracePlaceholders: boolean;
    unescapeLiteralText(text: string): string;
  },
): string {
  const single = library.usesDoubleBracePlaceholders ? toSingleBracePlaceholders(message) : message;
  return library.unescapeLiteralText(single);
}

/**
 * restore 读回 locale 时的值归一：i18next 系（双花括号）库先把占位符转单花括号，
 * 再 unescape 写盘时转义的字面量花括号。与写盘的 finalizeLocaleMessage 对称。
 *
 * React/Vue 的 RestoreTransformer 共用，消除两端逐字节重复的私有 normalizeLocaleMap。
 * library 仅需暴露 usesDoubleBracePlaceholders / unescapeLiteralText（BaseI18nLibrary 子集），
 * 用结构化入参解耦，避免 utils 反向依赖 strategies 层。
 */
export function normalizeRestoreLocaleMap(
  localeMap: LocaleMap,
  library: {
    usesDoubleBracePlaceholders: boolean;
    unescapeLiteralText(text: string): string;
  },
): LocaleMap {
  const result: LocaleMap = {};
  for (const [key, value] of Object.entries(localeMap)) {
    if (typeof value !== 'string') {
      result[key] = value;
      continue;
    }
    result[key] = normalizeRestoreMessage(value, library);
  }
  return result;
}

/**
 * 把内部规范消息（真占位符为单花括号 `{name}`）定稿成某 i18n 库的 locale 写入值。
 *
 * **占位符感知**（区别于纯正则的盲转换）：只有 `placeholderNames` 里的名字才算真占位符，
 * 其余 `{...}` 一律视为源文案里的字面量花括号。由此同时解决两类问题：
 *  - 双花括号库（react-i18next / vue-i18next）：只把真占位符转 `{{name}}`，字面量 `{x}`
 *    保持单花括号（i18next 单花括号即字面量），不再误把 `{config}` 这类文本转成插值。
 *  - 单花括号库（vue-i18n / react-intl）：真占位符保持 `{name}`，字面量花括号经
 *    `library.escapeLiteralText` 转义（vue-i18n→`{'{'}`，react-intl→ICU `'{'`），
 *    避免运行时把正文里的 `{大括号}` 当成具名插值。
 *
 * restore 时由 `library.unescapeLiteralText` 反向还原。
 */
export function finalizeLocaleMessage(
  message: string,
  placeholderNames: Iterable<string>,
  library: { usesDoubleBracePlaceholders: boolean; escapeLiteralText: (text: string) => string },
): string {
  const names = new Set<string>(placeholderNames);
  let out = '';
  let cursor = 0;
  const tokenRe = /\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(message)) !== null) {
    // 非真占位符：留在字面量段里，后续随该段一并转义
    if (!names.has(m[1]!)) continue;
    out += library.escapeLiteralText(message.slice(cursor, m.index));
    out += library.usesDoubleBracePlaceholders ? `{{${m[1]}}}` : `{${m[1]}}`;
    cursor = m.index + m[0]!.length;
  }
  out += library.escapeLiteralText(message.slice(cursor));
  return out;
}

/**
 * 把一条提取结果规整为「最终 locale 形态」的文案：
 *  - 模板串的 ${var} 占位符 → {var}（按 i18n 库做方言适配）、字面量插值内联；
 *  - 普通字符串去除两端反引号定界符；
 *  - 提供 library 时再做花括号方言适配与字面量转义（finalizeLocaleMessage）。
 *
 * Why（关键）：复用查找（IdReuseResolver 建表 / resolveSemanticId）与 locale 落盘必须使用
 * 同一 canonical 形态，否则模板/占位符串两边形态不一致——反查永远 miss，跨运行重复生成 _N
 * 后缀 key（旧 key 带译文成孤儿、源码改指向无译文新 key）。GenerateProcessor.toLocaleMessage 与
 * LanguageFileManager.updateLanguageFiles 两处共用本方法，杜绝形态漂移。
 */
export function buildLocaleMessage(
  extracted: Pick<
    ExtractedString,
    'original' | 'processedMessage' | 'isTemplateString' | 'templateVariables'
  >,
  library?: { usesDoubleBracePlaceholders: boolean; escapeLiteralText: (text: string) => string },
): string {
  const raw = extracted.processedMessage || extracted.original;
  const built =
    extracted.isTemplateString && extracted.templateVariables
      ? createMessageWithOptions(raw, extracted.templateVariables)
      : {
          // 仅「模板形态」的 raw 才剥反引号定界符：无变量 / 变量全是字面量的模板串（如
          // JSX 混合内容合成的 `` `共3项` ``）走到本分支时 raw 仍带反引号。普通字符串的 raw
          // 是裸内容，其内容本身可以合法地以反引号开头结尾（源码 `'\`代码\`'`），无条件剥会
          // 让 locale 值永久少两个反引号、且 restore 回不去原文。isTemplateString 即该旗标。
          message: extracted.isTemplateString ? stripMatchedDelimiters(raw, ['`']) : raw,
          placeholderMap: new Map<string, string>(),
        };
  return library
    ? finalizeLocaleMessage(built.message, built.placeholderMap.values(), library)
    : built.message;
}
