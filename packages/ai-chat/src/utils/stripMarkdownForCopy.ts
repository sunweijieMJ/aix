/**
 * 将 markdown 文本轻量剥离为适合复制/粘贴到普通文本场景的纯文本：
 * 去标题井号、强调符、行内代码反引号、链接/图片保留文字、列表/引用符号、水平线，收敛空行。
 * 仅做复制体验优化，非完备 markdown 解析。
 *
 * 与 stripMarkdownForSpeech 的关键差异：围栏代码块只去掉围栏标记行，代码内容原样保留、
 * 完全不经过下方的语法剥离流水线——朗读场景丢代码块是合理的（代码不适合逐字朗读），但复制
 * 场景代码往往正是用户想要的内容，整段丢弃是不可接受的信息丢失；而如果只去围栏标记、代码
 * 内容仍混在同一个字符串里跑剩余正则，行内的反引号/下划线/井号注释等合法代码字符会被
 * 误当 markdown 语法吃掉（如 `__init__`、`# comment`、模板字符串反引号），因此必须先把代码
 * 内容摘出来，跳过语法剥离，最后再原样拼回。
 */
const CLOSED_FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^[ \t]{0,3}\1[^\n]*$\n?/gm;
// 未闭合围栏（流式中断）：只在某一段"非代码文本"里查找一次，用来把该段尾部的
// "开围栏行 + 已产出但未闭合的代码" 拆开——开围栏行之前的散文仍要剥离，代码部分原样保留。
const UNCLOSED_FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*)$/m;

const stripProse = (text: string): string =>
  text
    // 图片 ![alt](url) → alt（须先于链接处理）
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 链接 [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 行内代码 `code` → code（限单行内配对）
    .replace(/`([^`\n]+)`/g, '$1')
    // 加粗 **x** → x：要求内容首尾非空白，避免把两侧带空格的 ** 当成强调符号误吃
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '$1')
    // 加粗 __x__ → x：额外要求左右不紧贴字母数字/下划线，避免误吃双下划线标识符（如 __init__）
    .replace(/(?<![\w_])__(\S(?:.*?\S)?)__(?![\w_])/g, '$1')
    // 斜体 *x* → x：要求内容首尾非空白，避免把两侧带空格的乘号当成强调符号（如 "1 * 2 * 3"）
    .replace(/\*([^\s*](?:.*?[^\s*])?)\*/g, '$1')
    // 斜体 _x_ → x：额外要求左右不紧贴字母数字/下划线，避免误吃 snake_case 标识符（如 my_var_name）
    .replace(/(?<![\w_])_([^\s_](?:.*?[^\s_])?)_(?![\w_])/g, '$1')
    // 删除线 ~~x~~ → x
    .replace(/~~(.*?)~~/g, '$1')
    // 标题井号（行首 # ~ ###### ）
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // 引用符号（行首 > ）
    .replace(/^\s{0,3}>\s?/gm, '')
    // 无序列表符号（行首 - * + ）
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    // 有序列表序号（行首 1. ）
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    // 水平分割线（--- *** ___）
    .replace(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, '');

// 一段"非代码文本"里可能尾随一个未闭合围栏（流式中断）：围栏之前的散文照常剥离，
// 围栏本身连同其后已产出的代码原样保留，不进入 stripProse。
const stripTextSegment = (text: string): string => {
  const unclosed = text.match(UNCLOSED_FENCE_RE);
  if (!unclosed || unclosed.index === undefined) return stripProse(text);
  return stripProse(text.slice(0, unclosed.index)) + unclosed[2];
};

export const stripMarkdownForCopy = (md: string): string => {
  // split 配合带捕获组的正则：结果数组形如 [文本, 围栏符, 代码, 文本, 围栏符, 代码, ...]，
  // 代码段（每 3 项里的第 3 项）原样保留、完全跳过 stripProse，避免代码内容被语法剥离误伤。
  const parts = md.split(CLOSED_FENCE_RE);
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    out += stripTextSegment(parts[i] ?? '');
    if (i + 2 < parts.length) out += parts[i + 2];
  }
  // 多余空白行收敛为至多一个空行
  return out.replace(/\n{3,}/g, '\n\n').trim();
};
