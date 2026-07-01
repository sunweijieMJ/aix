import { mount } from '@vue/test-utils';
import katex from 'katex';
// mhchem 副作用 import：给 katex 单例注册 \ce / \pu 宏。
// 生产链路在 loadMathRenderers 里于 katex 加载后 import 同一子路径（见 useMarkdownRenderer.ts）。
import 'katex/contrib/mhchem';
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import type { MdToken } from '../src/utils/markdownWalker';
import { createMathRenderers } from '../src/utils/mathRenderers';

const renderers = createMathRenderers(katex);

const renderMath = (key: 'math_inline' | 'math_block', content: string) => {
  const token = { type: key, content } as unknown as MdToken;
  const vnode = renderers[key]!({ token, renderChildren: () => [], info: { streaming: false } });
  const Harness = defineComponent({ render: () => h('div', vnode as never) });
  return mount(Harness).html();
};

describe('mhchem 化学式扩展（\\ce / \\pu）', () => {
  it('\\ce{H2O} → KaTeX 渲染且含下标（mhchem 已注册 \\ce 宏）', () => {
    const html = renderMath('math_inline', '\\ce{H2O}');
    expect(html).toContain('katex');
    // 下标 2 经 KaTeX 排版为 msub / vlist 结构；未接 mhchem 时 \ce 会渲染为未知宏提示（无下标）
    expect(html).toMatch(/msub|vlist/);
  });

  it('\\ce{2H2 + O2 -> 2H2O} 块级反应式不抛错并渲染为 KaTeX 块', () => {
    const html = renderMath('math_block', '\\ce{2H2 + O2 -> 2H2O}');
    expect(html).toContain('katex-display');
  });

  it('\\ce{SO4^2-} 离子电荷（上下标）正常渲染', () => {
    const html = renderMath('math_inline', '\\ce{SO4^2-}');
    expect(html).toContain('katex');
    expect(html).toMatch(/msubsup|msup|vlist/);
  });

  it('\\pu{123 J/mol} 物理量单位渲染为 KaTeX', () => {
    expect(renderMath('math_inline', '\\pu{123 J/mol}')).toContain('katex');
  });

  it('残缺化学式（流式中途）不抛错（throwOnError:false）', () => {
    expect(() => renderMath('math_block', '\\ce{2H2 + O2 ->')).not.toThrow();
  });
});
