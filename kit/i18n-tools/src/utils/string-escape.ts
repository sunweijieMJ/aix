/**
 * 纯字符串 / 正则层工具：不依赖 TypeScript AST，也不认识 i18n 语义。
 *
 * 职责边界：只做「文本进、文本出」的转义、解码、定界符处理与文本拼装。
 * 任何需要 ts.Node、locale 形态或 i18n 库方言知识的逻辑都不属于这里
 * （分别归 ast-core / message-shape）。
 */

/**
 * 对字符串做正则元字符转义，用于把任意文本嵌入 `new RegExp(...)` 模板。
 *
 * Why: React/Vue 多个 ImportManager / Transformer / RestoreTransformer 共用，
 *      避免各自内联 `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` 导致字符集不一致
 *      （个别位置漏掉 `*` `?`）。
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把「表达式 → 占位符名」映射（createMessageWithOptions 产出的 placeholderMap，
 * key 是源码表达式、value 是占位符名）拼成运行时参数对象字面量 `{ 占位符名: 表达式 }`。
 *
 * `wrap=true`（默认）产出 `{ a: x, b: y }`；`wrap=false` 产出去花括号的内层
 * `a: x, b: y`（react-i18next 函数调用路径的 inline 形态用）。
 *
 * Why: VueTransformer / react-i18next / react-intl 共用，避免各自复制一份
 *      forEach + `${k}: ${v}` 拼接（react-i18next 还有去花括号的 inline 变体）导致漂移；
 *      间距/转义改动只需改一处。
 */
export function formatValuesMapping(
  values: Map<string, string>,
  options?: { wrap?: boolean },
): string {
  const mappings: string[] = [];
  // forEach 回调是 (value, key)：value 即占位符名、key 即表达式。
  values.forEach((placeholder, expression) => {
    mappings.push(`${placeholder}: ${expression}`);
  });
  const body = mappings.join(', ');
  return options?.wrap === false ? body : `{ ${body} }`;
}

/**
 * 该码位的 `\uXXXX` 转义可否安全地还原成字面字符（写回源码文本）。
 *
 * 只放行「排版上可见、且在字符串字面量里原样出现不会改变语义」的非 ASCII 字符：
 *  - `< 0x80`：ASCII 区。单双引号、反斜杠、换行的转义一旦还原成字面字符，
 *    会直接把所在字符串字面量截断 —— 整个文件语法错。
 *  - U+00A0（NBSP）/ U+200B–U+200F（零宽）/ U+FEFF：还原成不可见字符后，源码里看不出
 *    与普通空格的区别，diff / review / 后续提取都会把它当空格处理。
 *  - U+2028 / U+2029：行/段分隔符，在字符串字面量中是合法换行符，还原即断行。
 */
function isRestorableUnicodeEscape(codeUnit: number): boolean {
  if (codeUnit < 0x80) return false;
  if (codeUnit === 0x00a0 || codeUnit === 0x2028 || codeUnit === 0x2029) return false;
  if (codeUnit >= 0x200b && codeUnit <= 0x200f) return false;
  if (codeUnit === 0xfeff) return false;
  return true;
}

/**
 * 把源码文本中引号/反引号字符串字面量里的 `\uXXXX` 转义还原回字面字符。
 *
 * 语义限定为「撤销 printer 对非 ASCII 字符的转义」：ts.createPrinter 打印字符串时会把
 * 中文等非 ASCII 字符输出成 `\uXXXX`，restore 产出的文件因此满屏转义、不可读。本函数只
 * 还原这一类，不可安全还原的码位（见 isRestorableUnicodeEscape）保持转义形态。
 *
 * JSX 表达式容器 `{'…'}` 的内层就是普通引号字符串，由引号分支覆盖，无需单独处理。
 *
 * @param code 源代码文本
 */
export function convertUnicodeToChineseInCode(code: string): string {
  // 先吃掉 `\\`（转义的反斜杠）再匹配 `\uXXXX`，与 decodeJsStringEscapes 同款单遍扫描口径：
  // 源码里的 `'\\u4e2d'` 表示「反斜杠 + u4e2d」六个字符，不是 Unicode 转义；逐条 replace 版本
  // 会把它解码成「反斜杠 + 中」，静默改变字符串语义。`\\` 原样回写（本函数改写的是源码文本）。
  const decode = (str: string): string =>
    str.replace(/\\\\|\\u([0-9a-fA-F]{4})/g, (match, hex: string | undefined) => {
      if (hex === undefined) return match;
      const codeUnit = parseInt(hex, 16);
      return isRestorableUnicodeEscape(codeUnit) ? String.fromCharCode(codeUnit) : match;
    });

  const replaceQuoted = (input: string, quote: string): string => {
    // 匹配同种引号内含 \uXXXX 的字符串字面量（引号三种字符都不是正则元字符，无需转义）
    const regex = new RegExp(`${quote}([^${quote}]*\\\\u[0-9a-fA-F]{4}[^${quote}]*)${quote}`, 'g');
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
  return out;
}

/** ASCII 空白（空格 / 制表 / 换行 / 回车 / 换页 / 垂直制表），不含任何排版空白。 */
const ASCII_WHITESPACE_RE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;

/**
 * 只去首尾 **ASCII** 空白的 trim。
 *
 * Why 不用 String.prototype.trim：它按 Unicode WhiteSpace 口径，会把 `&nbsp;`(U+00A0)、
 * 全角空格(U+3000)、窄空格等**排版字符**当空白剃掉。这些字符是文案的一部分：提取端一旦
 * 把它们 trim 掉，locale 值与被替换的源码区间就不再对应（源码里的 `&nbsp;` 仍在替换区间内），
 * 往返后原文永久丢失这些空白。首尾的 ASCII 空白才是源码缩进/换行，去掉才是对的。
 */
export function trimAsciiWhitespace(text: string): string {
  return text.replace(ASCII_WHITESPACE_RE, '');
}

/** trimAsciiWhitespace 的「只去前导」变体：用于按长度换算被跳过的前导空白偏移。 */
export function trimStartAsciiWhitespace(text: string): string {
  return text.replace(/^[ \t\n\r\f\v]+/, '');
}

/**
 * 剥除「成对」的首尾定界符：仅当首尾是同一个定界符时才剥一层。
 *
 * Why 成对判定而非 `replace(/^['"`]|['"`]$/g, '')`（首尾各无条件删一个字符）：
 * 提取出的 original / JSX 文本本身不带定界引号，其内容若以 ASCII 引号收尾
 * （如 `点击"提交"`），无条件删首尾会把内容里的引号误删 —— 导致替换阶段两侧归一化
 * 后不相等而静默跳过（locale 写了源码没改），或 locale 值永久丢字符。
 * 成对判定（首尾必须同字符）对无定界符的内容值是 no-op。
 *
 * @param allow 允许作为定界符的字符集合，默认引号与反引号都认；locale 文案路径
 *              传 `['`']` 只剥模板反引号（其入参是去定界符的内容或反引号模板）。
 */
export function stripMatchedDelimiters(
  text: string,
  allow: readonly string[] = ['"', "'", '`'],
): string {
  if (text.length < 2) return text;
  const first = text[0]!;
  if (first === text[text.length - 1] && allow.includes(first)) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * 把字符串字面量内部文本按 JavaScript 常用转义语义还原为运行时值。
 * 覆盖 unicode（\uXXXX / \u{...}）、hex（\xNN）、换行续接和常见单字符转义；
 * 未知转义按 JavaScript 非严格字符串的行为保留被转义字符（含 `\\` → `\`、`` \` `` → `` ` ``）。
 * 单遍扫描（非逐条 replace 串行），天然区分 `\\n`（字面反斜杠+n）与 `\n`（换行）。
 * shouldReplaceNode 的源码侧归一与 source-key-scanner 的 key 解码必须共用本实现：
 * 两套解码器一旦覆盖面漂移（比如某一侧缺 `\\` 规则），含转义反斜杠的字符串会静默漏替换。
 */
export function decodeJsStringEscapes(content: string): string {
  return content.replace(
    /\\(?:\r\n|[\n\r\u2028\u2029]|u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g,
    (
      _match,
      codePoint: string | undefined,
      unicode: string | undefined,
      hex: string | undefined,
      escaped: string | undefined,
    ) => {
      if (codePoint !== undefined) return String.fromCodePoint(Number.parseInt(codePoint, 16));
      if (unicode !== undefined) return String.fromCharCode(Number.parseInt(unicode, 16));
      if (hex !== undefined) return String.fromCharCode(Number.parseInt(hex, 16));
      if (escaped === undefined) return ''; // 反斜杠 + 换行：字符串续行
      const simpleEscapes: Record<string, string> = {
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v',
        '0': '\0',
      };
      return simpleEscapes[escaped] ?? escaped;
    },
  );
}
