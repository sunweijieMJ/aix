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

  it('并发调用共享同一次装配（Promise 级锁）：返回同一引擎实例', async () => {
    const [a, b] = await Promise.all([loadMarkdownEngine(), loadMarkdownEngine()]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  describe('mdPlugins（注入原始 markdown-it 插件）', () => {
    it('应用注入的插件：插件函数被调用并作用于 md', async () => {
      const plugin = (md: {
        core: {
          ruler: { push: (n: string, f: (s: { env: Record<string, unknown> }) => void) => void };
        };
      }) => {
        md.core.ruler.push('aix_test_marker', (state) => {
          state.env.aixPluginApplied = true;
        });
      };
      const engine = await loadMarkdownEngine(false, [plugin]);
      expect(engine).not.toBeNull();
      const env: Record<string, unknown> = {};
      engine!.md.parse('hello', env);
      expect(env.aixPluginApplied).toBe(true);
    });

    it('[插件, 选项] 元组形态：选项透传给 md.use', async () => {
      let received: unknown;
      const plugin = (_md: unknown, opts: unknown) => {
        received = opts;
      };
      await loadMarkdownEngine(false, [[plugin, { foo: 1 }]]);
      expect(received).toEqual({ foo: 1 });
    });

    it('单个插件抛错被隔离：跳过该插件，markdown 仍可用', async () => {
      const bad = () => {
        throw new Error('boom');
      };
      const engine = await loadMarkdownEngine(false, [bad]);
      expect(engine).not.toBeNull();
      expect(engine!.md.parse('# h', {}).length).toBeGreaterThan(0);
    });

    it('同一插件数组（引用）跨调用共享引擎，避免每个气泡重复装配', async () => {
      const plugins = [() => {}];
      const a = await loadMarkdownEngine(false, plugins);
      const b = await loadMarkdownEngine(false, plugins);
      expect(a).not.toBeNull();
      expect(a).toBe(b);
    });

    it('不同插件数组各自独立引擎（互不污染）', async () => {
      const a = await loadMarkdownEngine(false, [() => {}]);
      const b = await loadMarkdownEngine(false, [() => {}]);
      expect(a).not.toBe(b);
    });
  });
});
