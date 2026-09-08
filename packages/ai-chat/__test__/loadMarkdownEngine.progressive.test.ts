import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

// 渐进加载契约：基础引擎（markdown-it + katex 插件）就绪即返回，
// 不等待重量级增强依赖（highlight.js / katex 库）；增强项后台 settle 后增量合入并递增版本号；
// mermaid 更进一步——引擎装配阶段完全不 import，首个 ```mermaid 围栏真正渲染时才发起。
// 增强依赖的落定时机由「模块属性访问门控」精确控制（见下）。
const state = vi.hoisted(() => ({
  hljsReady: false,
  katexReady: false,
  hljsStub: {
    getLanguage: () => ({}),
    highlight: (code: string) => ({ value: code }),
    highlightAuto: (code: string) => ({ value: code }),
  },
  katexStub: { renderToString: (tex: string) => `<span class="katex">${tex}</span>` },
  mermaidImported: false,
}));

// 「依赖未就绪」窗口由 default getter 门控，而非挂起的 import：mock 工厂返回 pending Promise
// 只对该 specifier 的首次 import 生效，第二次 import（每个新引擎都会重新加载增强项）会拿到
// 真实模块，窗口随即失效。门控落在属性访问上才对每次 import 都成立——未就绪时抛错，被
// loadCodeRenderers / loadMathRenderers 的 catch 收敛为空渲染器集合（与「依赖未安装」同一路径）。
vi.mock('highlight.js', () => ({
  get default() {
    if (!state.hljsReady) throw new Error('highlight.js 尚未就绪');
    return state.hljsStub;
  },
}));
vi.mock('katex', () => ({
  get default() {
    if (!state.katexReady) throw new Error('katex 尚未就绪');
    return state.katexStub;
  },
}));
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
  beforeEach(() => {
    __resetMarkdownEngineCache();
    state.hljsReady = false;
    state.katexReady = false;
  });

  // 本用例用满引擎的重试额度（attemptsLeft 上界 3）：装配轮两项皆落空集，
  // 此后每次开门各触发一轮重试。额度调小会让下面的 waitFor 超时——是响亮的失败，不是静默通过。
  it('基础引擎先行返回，不等待 hljs/katex；增强后到时增量合入并递增版本号', async () => {
    // 两个增强依赖都被门控挡下，引擎必须先行 resolve——否则本 await 卡死、测试超时失败
    const engine = await loadMarkdownEngine();
    expect(engine).not.toBeNull();

    // 基础能力就绪：markdown 可正常解析
    const tokens = engine!.md.parse('# 标题', {});
    expect(tokens.some((t) => t.type === 'heading_open')).toBe(true);

    // 装配轮的增强加载已 settle（两项皆落空集合），此后集合不会再自行变化
    await engine!.ready;
    // 增强渲染器尚未合入：集合为空、版本号 0（空集合不 bump）
    expect(engine!.codeRenderers).toEqual({});
    expect(engine!.mathRenderers).toEqual({});
    expect(engine!.renderersVersion.value).toBe(0);

    // mermaid 惰性：fence:mermaid 懒加载包装已注册，但 mermaid 模块未被 import
    expect(engine!.diagramRenderers['fence:mermaid']).toBeTypeOf('function');
    expect(state.mermaidImported).toBe(false);

    // hljs 后到：开门后命中缓存即触发增强重试（retryEnhancements，fire-and-forget 无对外句柄，
    // 故等待目标态而非固定时长）→ codeRenderers 增量合入，版本号 +1
    state.hljsReady = true;
    void loadMarkdownEngine();
    await vi.waitFor(() => expect(engine!.codeRenderers.fence).toBeTypeOf('function'));
    expect(engine!.renderersVersion.value).toBe(1);
    // 互不连累：katex 仍被挡下，math 集合不受 code 合入影响
    expect(engine!.mathRenderers).toEqual({});

    // katex 后到：mathRenderers 增量合入，版本号再 +1
    state.katexReady = true;
    void loadMarkdownEngine();
    await vi.waitFor(() => expect(engine!.mathRenderers.math_inline).toBeTypeOf('function'));
    expect(engine!.renderersVersion.value).toBe(2);

    // 引擎全程未 import mermaid（无 mermaid 围栏渲染发生）
    expect(state.mermaidImported).toBe(false);
  });
});
