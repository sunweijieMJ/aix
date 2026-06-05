import { h } from 'vue';
import type { MarkdownRenderers } from './markdownWalker';

/** DOMPurify 的最小消毒能力（避免静态耦合 dompurify 类型，按需动态注入） */
export interface DomPurifyLike {
  sanitize(dirty: string): string;
}

/**
 * 据注入的 DOMPurify 产出原始 HTML 渲染器（仅 allowHtml 开启时启用）。
 *
 * - `html_block`：整块原始 HTML 经 DOMPurify 消毒后以 innerHTML 渲染（去除 script / on* 等 XSS 向量）。
 * - `html_inline`：行内裸标签（markdown-it 把 `<b>`/`</b>` 拆成独立 token，无法各自成节点）
 *   P1 直接丢弃、保留周边文本（安全可读）；行内 HTML→组件映射列为 P2。
 */
export function createHtmlRenderers(purify: DomPurifyLike): MarkdownRenderers {
  return {
    html_block: ({ token }) =>
      h('div', { class: 'aix-md-html', innerHTML: purify.sanitize(token.content) }),
    html_inline: () => '',
  };
}
