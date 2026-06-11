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

  // 时序调整说明：渐进装配后引擎在基础项就绪时即返回，katex/hljs 渲染器改为后台增量合入，
  // 断言前需 await engine.ready（全部增强 settle 的同步点）。能力契约本身（可用即注册）不变。
  it('katex 可用时 mathRenderers 含 math_inline / math_block', async () => {
    const engine = await loadMarkdownEngine();
    await engine!.ready;
    expect(engine!.mathRenderers.math_inline).toBeTypeOf('function');
    expect(engine!.mathRenderers.math_block).toBeTypeOf('function');
  });

  it('highlight.js 可用时 codeRenderers 含通用 fence 渲染器', async () => {
    const engine = await loadMarkdownEngine();
    await engine!.ready;
    expect(engine!.codeRenderers.fence).toBeTypeOf('function');
  });

  it('diagramRenderers 含 fence:mermaid 懒加载包装（装配期不 import mermaid，围栏渲染时才加载）', async () => {
    const engine = await loadMarkdownEngine();
    expect(engine!.diagramRenderers['fence:mermaid']).toBeTypeOf('function');
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
