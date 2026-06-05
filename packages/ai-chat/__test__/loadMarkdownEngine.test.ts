import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

describe('loadMarkdownEngine（装配引擎）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('返回引擎：md.parse 产出带 level/map 的顶层块 token', async () => {
    const engine = await loadMarkdownEngine();
    expect(engine).not.toBeNull();
    const tokens = engine!.md.parse('# 标题\n\n正文', {});
    const heading = tokens.find((t) => t.type === 'heading_open');
    expect(heading?.level).toBe(0);
    expect(heading?.map).toBeTruthy();
  });

  it('katex 可用时 mathRenderers 含 math_inline / math_block', async () => {
    const engine = await loadMarkdownEngine();
    expect(engine!.mathRenderers.math_inline).toBeTypeOf('function');
    expect(engine!.mathRenderers.math_block).toBeTypeOf('function');
  });

  it('结果被缓存：重复调用返回同一引擎实例', async () => {
    const a = await loadMarkdownEngine();
    const b = await loadMarkdownEngine();
    expect(a).toBe(b);
  });
});
