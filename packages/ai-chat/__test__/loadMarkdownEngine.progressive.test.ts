import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

// 渐进加载契约：基础引擎（markdown-it + katex 插件 + dompurify）就绪即返回，
// 不等待重量级增强依赖（highlight.js / katex 库）；增强项后台 settle 后增量合入并递增版本号；
// mermaid 更进一步——引擎装配阶段完全不 import，首个 ```mermaid 围栏真正渲染时才发起。
// 通过「手动 resolve 的 deferred 模块 mock」精确控制增强依赖的落定时机。
const state = vi.hoisted(() => {
  let resolveHljs!: (mod: unknown) => void;
  let resolveKatex!: (mod: unknown) => void;
  return {
    hljsPromise: new Promise((r) => {
      resolveHljs = r;
    }),
    katexPromise: new Promise((r) => {
      resolveKatex = r;
    }),
    resolveHljs,
    resolveKatex,
    mermaidImported: false,
  };
});

// vi.mock 工厂返回 Promise：动态 import('highlight.js') 在 deferred resolve 前一直挂起
vi.mock('highlight.js', () => state.hljsPromise);
vi.mock('katex', () => state.katexPromise);
vi.mock('mermaid', () => {
  state.mermaidImported = true;
  return {
    default: {
      initialize: () => {},
      parse: async () => true,
      render: async () => ({ svg: '<svg></svg>' }),
    },
  };
});

describe('loadMarkdownEngine 渐进加载（基础先行 + 增强增量合入）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('基础引擎先行返回，不等待 hljs/katex；增强后到时增量合入并递增版本号', async () => {
    // hljs / katex 的 import 仍挂起（永不超时），引擎必须先行 resolve——否则本 await 卡死、测试超时失败
    const engine = await loadMarkdownEngine();
    expect(engine).not.toBeNull();

    // 基础能力就绪：markdown 可正常解析
    const tokens = engine!.md.parse('# 标题', {});
    expect(tokens.some((t) => t.type === 'heading_open')).toBe(true);

    // 增强渲染器尚未合入：集合为空、版本号 0
    expect(engine!.codeRenderers).toEqual({});
    expect(engine!.mathRenderers).toEqual({});
    expect(engine!.renderersVersion.value).toBe(0);

    // mermaid 惰性：fence:mermaid 懒加载包装已注册，但 mermaid 模块未被 import
    expect(engine!.diagramRenderers['fence:mermaid']).toBeTypeOf('function');
    expect(state.mermaidImported).toBe(false);

    // hljs 后到：codeRenderers 增量合入，版本号 +1
    state.resolveHljs({
      default: {
        getLanguage: () => ({}),
        highlight: (code: string) => ({ value: code }),
        highlightAuto: (code: string) => ({ value: code }),
      },
    });
    await vi.waitFor(() => expect(engine!.codeRenderers.fence).toBeTypeOf('function'));
    expect(engine!.renderersVersion.value).toBe(1);

    // katex 后到：mathRenderers 增量合入，版本号再 +1
    state.resolveKatex({
      default: { renderToString: (tex: string) => `<span class="katex">${tex}</span>` },
    });
    await vi.waitFor(() => expect(engine!.mathRenderers.math_inline).toBeTypeOf('function'));
    expect(engine!.renderersVersion.value).toBe(2);

    // 全部增强 settle 后 ready 兑现（预热/测试同步点）
    await expect(engine!.ready).resolves.toBeUndefined();

    // 引擎全程未 import mermaid（无 mermaid 围栏渲染发生）
    expect(state.mermaidImported).toBe(false);
  });
});
