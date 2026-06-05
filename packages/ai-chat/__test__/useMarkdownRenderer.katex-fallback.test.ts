import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟 KaTeX 插件未安装：import 时抛错，loader 应降级为「纯 markdown，公式留原样文本」，
// 不影响 markdown-it 本身（markdown-it 不 mock，仍真实加载）。
vi.mock('@vscode/markdown-it-katex', () => {
  throw new Error('Cannot find module @vscode/markdown-it-katex');
});

import { loadMarkdownRenderer, __resetMarkdownCache } from '../src/composables/useMarkdownRenderer';

describe('KaTeX 插件缺失时的降级', () => {
  beforeEach(() => __resetMarkdownCache());

  it('插件缺失不影响 markdown：返回渲染函数且普通 markdown 正常', async () => {
    const render = await loadMarkdownRenderer();
    expect(render).toBeTypeOf('function');
    expect(render!('# 标题')).toContain('<h1>');
  });

  it('公式降级为原样文本（不含 katex 类）', async () => {
    const render = await loadMarkdownRenderer();
    const html = render!('$$E=mc^2$$');
    expect(html).not.toContain('katex');
    expect(html).toContain('mc^2');
  });
});
