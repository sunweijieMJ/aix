import { describe, it, expect, beforeEach, vi } from 'vitest';
// 模拟 KaTeX 插件未安装：import 时抛错，引擎应降级为「纯 markdown，公式留原样文本」，
// 不影响 markdown-it 本身（markdown-it 不 mock，仍真实加载）。
vi.mock('@vscode/markdown-it-katex', () => {
  throw new Error('Cannot find module @vscode/markdown-it-katex');
});
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

describe('loadMarkdownEngine 降级（KaTeX 插件缺失）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('插件缺失不影响 markdown：引擎可用且普通 markdown 正常解析', async () => {
    const engine = await loadMarkdownEngine();
    expect(engine).not.toBeNull();
    const tokens = engine!.md.parse('# 标题', {});
    expect(tokens.some((t) => t.type === 'heading_open')).toBe(true);
  });

  it('mathRenderers 为空，公式不产生 math token、内容留作原样文本', async () => {
    const engine = await loadMarkdownEngine();
    expect(engine!.mathRenderers).toEqual({});
    const tokens = engine!.md.parse('$$E=mc^2$$', {});
    expect(tokens.some((t) => t.type === 'math_block')).toBe(false);
    expect(tokens.some((t) => t.content?.includes('E=mc^2'))).toBe(true);
  });
});
