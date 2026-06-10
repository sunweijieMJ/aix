import { mount } from '@vue/test-utils';
import katex from 'katex';
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

describe('createMathRenderers（KaTeX 数学渲染器）', () => {
  it('行内公式 math_inline → 渲染为 KaTeX', () => {
    expect(renderMath('math_inline', 'E=mc^2')).toContain('katex');
  });

  it('块级公式 math_block → 渲染为 KaTeX 块（displayMode）', () => {
    const html = renderMath('math_block', 'E=mc^2');
    expect(html).toContain('katex');
    expect(html).toContain('katex-display');
  });

  it('块级公式内容的尾随换行被去除（不破坏渲染）', () => {
    expect(renderMath('math_block', 'E=mc^2\n')).toContain('katex');
  });

  it('残缺/非法公式不抛错（throwOnError:false）', () => {
    expect(() => renderMath('math_block', '\\frac{a}{')).not.toThrow();
  });
});
