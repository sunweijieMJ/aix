import { h, type VNode } from 'vue';
import { safeImageSrc, safeUrl } from './url';

/**
 * markdown-it token 的最小结构（walker 与块切分共用；真实 Token 结构兼容）。
 * `level`/`map` 供 splitMarkdownBlocks 做顶层块行范围切片；walker 本身只用其余字段。
 */
export interface MdToken {
  type: string;
  tag: string;
  nesting: number;
  level: number;
  content: string;
  info: string;
  map: [number, number] | null;
  children: MdToken[] | null;
  attrs: [string, string][] | null;
}

export interface MarkdownRenderInfo {
  /** 是否流式渲染中 */
  streaming: boolean;
  /** 当前顶层块是否已固化（非活跃末块，或整条消息已完成）——原子渲染器（图表等）据此成图 */
  committed?: boolean;
}

export interface MarkdownRenderContext {
  /** 当前 token */
  token: MdToken;
  /** 渲染子节点（容器 token 的内部 / inline 子 token） */
  renderChildren: () => (VNode | string)[];
  info: MarkdownRenderInfo;
}

/** markdown token 渲染器：返回 VNode / 字符串（文本节点） */
export type MarkdownRenderer = (ctx: MarkdownRenderContext) => VNode | (VNode | string)[] | string;

/** 注册表：归一化后的 token 名（去 `_open`）→ 渲染器 */
export type MarkdownRenderers = Record<string, MarkdownRenderer>;

/** 取 token 属性值（imageRenderers 等 token 级渲染器复用，勿在各处手写副本） */
export function attr(token: MdToken, name: string): string | undefined {
  return token.attrs?.find((a) => a[0] === name)?.[1];
}

/**
 * 内置渲染器：覆盖常见块级 / 行内 token。用户注册表优先级更高，可覆盖。
 * 仅本模块内部消费（见下方 walk 的 `renderers[key] ?? builtinMarkdownRenderers[key]`），
 * 不导出——扩展走 `markdownRenderers` 注册表，无需也不应直接引用这份内置表。
 */
const builtinMarkdownRenderers: MarkdownRenderers = {
  text: ({ token }) => token.content,
  softbreak: () => h('br'),
  hardbreak: () => h('br'),
  paragraph: ({ renderChildren }) => h('p', renderChildren()),
  heading: ({ token, renderChildren }) => h(token.tag, renderChildren()),
  em: ({ renderChildren }) => h('em', renderChildren()),
  strong: ({ renderChildren }) => h('strong', renderChildren()),
  s: ({ renderChildren }) => h('s', renderChildren()),
  link: ({ token, renderChildren }) => {
    // 协议白名单纵深防护：不再隐式依赖 markdown-it 默认 validateLink（mdPlugins 可能放宽它），
    // 由 walker 自有不变量兜底。不安全协议（javascript: 等）降级为纯文本，保留链接文案不渲染 href。
    // 注：链接无 data: 合法场景，故对 href 直接套 safeUrl；image 的 src 需放行 data:image，
    // 走 safeImageSrc 这个同源变体（见下方 image 渲染器），两处口径一致。
    const href = safeUrl(attr(token, 'href'));
    return href
      ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, renderChildren())
      : h('span', renderChildren());
  },
  code_inline: ({ token }) => h('code', token.content),
  fence: ({ token }) => h('pre', h('code', token.content)),
  code_block: ({ token }) => h('pre', h('code', token.content)),
  bullet_list: ({ renderChildren }) => h('ul', renderChildren()),
  ordered_list: ({ renderChildren }) => h('ol', renderChildren()),
  list_item: ({ renderChildren }) => h('li', renderChildren()),
  blockquote: ({ renderChildren }) => h('blockquote', renderChildren()),
  hr: () => h('hr'),
  table: ({ renderChildren }) => h('table', renderChildren()),
  thead: ({ renderChildren }) => h('thead', renderChildren()),
  tbody: ({ renderChildren }) => h('tbody', renderChildren()),
  tr: ({ renderChildren }) => h('tr', renderChildren()),
  th: ({ renderChildren }) => h('th', renderChildren()),
  td: ({ renderChildren }) => h('td', renderChildren()),
  // src 过图片白名单（放行 data:image/*）：与上方 link 的理由相同——不再隐式依赖
  // markdown-it 默认 validateLink（mdPlugins 可能放宽它），由 walker 自有不变量兜底。
  // 不安全协议降级为纯 alt 文本，与 link 降级为 span 同构。
  image: ({ token }) => {
    const src = safeImageSrc(attr(token, 'src'));
    return src ? h('img', { src, alt: token.content }) : token.content;
  },
};

/**
 * 从 openIdx 起找到配对的 close token 下标（按 nesting 计深度）。
 * 未配对（流式半截，markdown-it 通常会在 EOF 自动补闭合，此为防御分支）返回 tokens.length，
 * 使上层 `slice(open+1, closeIdx)` 把剩余 token 全部纳入子渲染，避免吞掉末个 token。
 */
function findClose(tokens: MdToken[], openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < tokens.length; j++) {
    depth += tokens[j]!.nesting;
    if (depth === 0) return j;
  }
  return tokens.length;
}

function renderNode(
  token: MdToken,
  renderChildren: () => (VNode | string)[],
  renderers: MarkdownRenderers,
  info: MarkdownRenderInfo,
): (VNode | string)[] {
  let key = token.type.replace(/_open$/, '');
  // fence 按围栏语言优先分发 fence:<lang>（如 fence:mermaid），未注册则回落通用 fence。
  // 只查用户注册表：fence:<lang> 键全部来自注册侧（mermaid/chart/html 等），内置表不含
  // 也不预留这类键
  if (token.type === 'fence') {
    const lang = token.info.trim().split(/\s+/)[0];
    const langKey = lang ? `fence:${lang}` : '';
    if (langKey && renderers[langKey]) key = langKey;
  }
  const renderer = renderers[key] ?? builtinMarkdownRenderers[key];
  if (renderer) {
    const out = renderer({ token, renderChildren, info });
    return Array.isArray(out) ? out : [out];
  }
  // 未注册：容器渲染子节点，叶子渲染其文本内容 —— 安全降级，不崩溃
  return token.nesting === 1 ? renderChildren() : token.content ? [token.content] : [];
}

/**
 * 从 startIdx 起，返回连续 html_block token 游程的最后一个下标（含 startIdx 本身；
 * 其后紧邻的不是 html_block 则原样返回 startIdx）。splitMarkdownBlocks.ts 按顶层块的
 * 行号范围合并、这里再按 token 数组合并 content——两处操作的对象和产出物不同（源码切片
 * vs 合成 token），不能合并成一个函数，但"游程边界"是同一份定义，抽出来复用，避免两处
 * while 循环独立演化、日后只改一处导致重新裂开（见 mergeHtmlBlock 场景说明）。
 */
export function htmlBlockRunEnd(tokens: readonly { type: string }[], startIdx: number): number {
  let endIdx = startIdx;
  while (endIdx + 1 < tokens.length && tokens[endIdx + 1]!.type === 'html_block') {
    endIdx++;
  }
  return endIdx;
}

/**
 * 从 startIdx 起合并连续的 html_block token 为一个合成 token（content 以空行拼接，
 * 复原原始文档的段落间距）。单块（无相邻 html_block）时原样返回、不分配新对象。
 * 见 splitMarkdownBlocks.ts 同名注释：一份完整 HTML 文档独立重解析后仍会产出多个
 * html_block token（CommonMark 空行切割规则与切片粒度无关），故渲染时需再合并一次。
 */
function mergeHtmlBlock(tokens: MdToken[], startIdx: number): { token: MdToken; nextIdx: number } {
  const first = tokens[startIdx]!;
  const endIdx = htmlBlockRunEnd(tokens, startIdx);
  if (endIdx === startIdx) return { token: first, nextIdx: startIdx + 1 };
  const content = tokens
    .slice(startIdx, endIdx + 1)
    .map((t) => t.content)
    .join('\n\n');
  return { token: { ...first, content }, nextIdx: endIdx + 1 };
}

/**
 * 把 markdown-it 扁平 token 流（含 inline.children）渲染为 Vue VNode 列表。
 * 按 token.type（去 `_open`）查注册表分发，容器递归、inline 下钻、未注册降级。
 */
export function renderMarkdownTokens(
  tokens: MdToken[],
  ctx: { renderers: MarkdownRenderers; info: MarkdownRenderInfo },
): (VNode | string)[] {
  const { renderers, info } = ctx;
  const out: (VNode | string)[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.nesting === 1) {
      const closeIdx = findClose(tokens, i);
      const inner = tokens.slice(i + 1, closeIdx);
      out.push(...renderNode(token, () => renderMarkdownTokens(inner, ctx), renderers, info));
      i = closeIdx + 1;
    } else if (token.type === 'html_block') {
      const { token: merged, nextIdx } = mergeHtmlBlock(tokens, i);
      out.push(...renderNode(merged, () => [], renderers, info));
      i = nextIdx;
    } else {
      if (token.type === 'inline') {
        out.push(...renderMarkdownTokens(token.children ?? [], ctx));
      } else {
        out.push(...renderNode(token, () => [], renderers, info));
      }
      i += 1;
    }
  }
  return out;
}
