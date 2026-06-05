import { h } from 'vue';
import type { MarkdownRenderers } from './markdownWalker';

/** KaTeX 的最小渲染能力（避免静态耦合 katex 类型，katex 仍按需动态注入） */
export interface KatexLike {
  renderToString(tex: string, options?: Record<string, unknown>): string;
}

/**
 * 据注入的 katex 产出 `math_inline` / `math_block` 两个 markdown 渲染器。
 *
 * - 把 walker 分发到的数学 token 用 KaTeX 渲染为真 VNode（行内 span / 块级 div），
 *   于是公式成为独立块、可被上层 TransitionGroup 做入场淡入。
 * - `throwOnError:false`：残缺/非法公式（含流式中途）以提示呈现而非抛错。
 * - katex 输出为受信 HTML（不含脚本），经 innerHTML 注入。
 */
export function createMathRenderers(katex: KatexLike): MarkdownRenderers {
  const renderTo = (tex: string, displayMode: boolean): string =>
    katex.renderToString(tex, { displayMode, throwOnError: false });
  return {
    math_inline: ({ token }) =>
      h('span', {
        class: 'aix-md-katex-inline',
        innerHTML: renderTo(token.content, false),
      }),
    math_block: ({ token }) =>
      h('div', {
        class: 'aix-md-katex-block',
        // math_block token 内容常带尾随换行，去掉避免影响渲染
        innerHTML: renderTo(token.content.trim(), true),
      }),
  };
}
