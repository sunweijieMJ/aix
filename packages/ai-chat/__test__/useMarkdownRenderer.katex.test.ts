import { describe, it, expect, beforeEach } from 'vitest';
import { loadMarkdownRenderer, __resetMarkdownCache } from '../src/composables/useMarkdownRenderer';

// 真实加载 markdown-it + @vscode/markdown-it-katex（不 mock），验证数学公式渲染能力。
describe('loadMarkdownRenderer + KaTeX 数学公式', () => {
  beforeEach(() => __resetMarkdownCache());

  it('块级 $$...$$ 渲染为 KaTeX 输出（不再是裸 LaTeX）', async () => {
    const render = await loadMarkdownRenderer();
    const html = render!('$$E = mc^2$$');
    expect(html).toContain('katex');
    expect(html).not.toContain('$$');
  });

  it('行内 $...$ 渲染为 KaTeX 输出', async () => {
    const render = await loadMarkdownRenderer();
    expect(render!('能量 $E=mc^2$ 公式')).toContain('katex');
  });

  it('块级 \\[...\\]（OpenAI 系定界符）经归一化后渲染为 KaTeX', async () => {
    const render = await loadMarkdownRenderer();
    const html = render!('\\[ \\frac{\\partial \\mathcal{L}}{\\partial q} = 0 \\]');
    expect(html).toContain('katex');
    expect(html).not.toContain('\\[');
  });

  it('行内 \\(...\\) 经归一化后渲染为 KaTeX', async () => {
    const render = await loadMarkdownRenderer();
    expect(render!('其中 \\( \\mathcal{L} \\) 是拉氏量')).toContain('katex');
  });

  it('残缺/非法公式不抛错（throwOnError:false 兜底，保障流式安全）', async () => {
    const render = await loadMarkdownRenderer();
    expect(() => render!('$$ \\frac{a}{ $$')).not.toThrow();
  });

  it('普通 markdown 仍正常渲染', async () => {
    const render = await loadMarkdownRenderer();
    expect(render!('# 标题')).toContain('<h1>');
  });
});
