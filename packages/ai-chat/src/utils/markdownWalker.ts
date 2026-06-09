import { h, type VNode } from 'vue';

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

/** 取 token 属性值 */
function attr(token: MdToken, name: string): string | undefined {
  return token.attrs?.find((a) => a[0] === name)?.[1];
}

/** 内置渲染器：覆盖常见块级 / 行内 token。用户注册表优先级更高，可覆盖。 */
export const builtinMarkdownRenderers: MarkdownRenderers = {
  text: ({ token }) => token.content,
  softbreak: () => h('br'),
  hardbreak: () => h('br'),
  paragraph: ({ renderChildren }) => h('p', renderChildren()),
  heading: ({ token, renderChildren }) => h(token.tag, renderChildren()),
  em: ({ renderChildren }) => h('em', renderChildren()),
  strong: ({ renderChildren }) => h('strong', renderChildren()),
  s: ({ renderChildren }) => h('s', renderChildren()),
  link: ({ token, renderChildren }) =>
    h(
      'a',
      { href: attr(token, 'href'), target: '_blank', rel: 'noopener noreferrer' },
      renderChildren(),
    ),
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
  image: ({ token }) => h('img', { src: attr(token, 'src'), alt: token.content }),
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
  // fence 按围栏语言优先分发 fence:<lang>（如 fence:mermaid），未注册则回落通用 fence
  if (token.type === 'fence') {
    const lang = token.info.trim().split(/\s+/)[0];
    const langKey = lang ? `fence:${lang}` : '';
    if (langKey && (renderers[langKey] ?? builtinMarkdownRenderers[langKey])) key = langKey;
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
