import { mount } from '@vue/test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { h } from 'vue';
import MarkdownRenderer from '../src/components/MarkdownRenderer.vue';
import { __resetMarkdownEngineCache } from '../src/composables/useMarkdownRenderer';
import type { MarkdownRenderContext } from '../src/utils/markdownWalker';

// 组件级渐进加载契约：
// 1) 富文本骨架不等待 hljs/mermaid——基础引擎就绪即脱离纯文本降级态；
// 2) hljs 后到时，已 committed（冻结 memo）的代码块自动补上高亮（渲染器版本号破除块级 memo）；
// 3) 版本号与流式 chunk 无关：流式追加期间 committed 块不重渲染（核心增量优化不被破坏）；
// 4) mermaid 惰性：无 mermaid 围栏的内容全程不 import mermaid，首个围栏渲染时才加载。
const state = vi.hoisted(() => {
  let resolveHljs!: (mod: unknown) => void;
  return {
    hljsPromise: new Promise((r) => {
      resolveHljs = r;
    }),
    resolveHljs,
    hljsResolved: false,
    mermaidImported: false,
  };
});

vi.mock('highlight.js', () => state.hljsPromise);
vi.mock('mermaid', () => {
  state.mermaidImported = true;
  return {
    default: {
      initialize: () => {},
      parse: async () => true,
      render: async (_id: string, code: string) => ({
        svg: `<svg data-mermaid-mock="${encodeURIComponent(code)}"></svg>`,
      }),
    },
  };
});

describe('MarkdownRenderer 渐进加载（基础先行 + 增强增量生效）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  // 注意：本文件内测试顺序有依赖——hljs deferred 是文件级共享 mock，
  // 前两个测试在「hljs 未就绪」窗口内断言，第二个测试中途才 resolve 它。

  it('基础引擎就绪即渲染富文本骨架，不等待 hljs；代码块先以纯 pre>code 呈现', async () => {
    const w = mount(MarkdownRenderer, {
      props: { content: '# 标题\n\n```js\nconst x = 1\n```' },
    });
    // hljs import 仍挂起，富文本（标题 + 代码块）必须已可渲染
    await vi.waitFor(() => {
      expect(w.html()).toContain('<h1>标题</h1>');
      expect(w.find('pre').exists()).toBe(true);
    });
    // 未高亮：走 walker 默认 fence（纯 pre>code），无 hljs 外壳
    expect(w.find('code.hljs').exists()).toBe(false);
    expect(w.find('.aix-md-codeblock').exists()).toBe(false);
    expect(w.text()).toContain('const x = 1');
    // 无 mermaid 围栏 → 全程不触发 import('mermaid')
    expect(state.mermaidImported).toBe(false);
  });

  it('hljs 后到：已 committed 的代码块自动补上高亮（渲染器版本号破除块级 memo）', async () => {
    // 渲染计数探针：观察第一个段落块的重渲染次数（验证版本号 bump 恰好触发一轮重渲染，
    // 且后续流式 chunk 不再触发 committed 块重渲染）
    let firstBlockRenders = 0;
    const probe = {
      // paragraph 是容器 token（content 为空），按渲染出的子文本区分是哪个块
      paragraph: ({ renderChildren }: MarkdownRenderContext) => {
        const children = renderChildren();
        if (JSON.stringify(children).includes('第一段')) firstBlockRenders += 1;
        return h('p', children);
      },
    };
    const w = mount(MarkdownRenderer, {
      props: {
        content: '第一段\n\n```js\nconst x = 1\n```\n\n尾段',
        streaming: true,
        markdownRenderers: probe,
      },
    });
    // 基础引擎就绪：三个块均已渲染，代码块（非末块 → committed）为纯 pre>code
    await vi.waitFor(() => expect(w.findAll('p').length).toBe(2));
    expect(w.find('code.hljs').exists()).toBe(false);

    // hljs 此刻才就绪
    state.resolveHljs({
      default: {
        getLanguage: (name: string) => (name === 'js' ? {} : null),
        highlight: (code: string) => ({ value: `<span class="hljs-keyword">${code}</span>` }),
        highlightAuto: (code: string) => ({ value: code }),
      },
    });
    state.hljsResolved = true;
    // committed 的代码块必须自动补上高亮（无 content 变化，仅渲染器版本号 bump）
    await vi.waitFor(() => expect(w.find('code.hljs').exists()).toBe(true));
    expect(w.html()).toContain('hljs-keyword');

    // —— 版本号与流式无关：增强合入完成后，流式追加 chunk 不得重渲染 committed 首块 ——
    const rendersAfterMerge = firstBlockRenders;
    await w.setProps({ content: '第一段\n\n```js\nconst x = 1\n```\n\n尾段追加中' });
    await vi.waitFor(() => expect(w.text()).toContain('尾段追加中'));
    expect(firstBlockRenders).toBe(rendersAfterMerge);
  });

  it('mermaid 惰性：首个 ```mermaid 围栏渲染时才 import，并最终成图', async () => {
    // 前两个测试未渲染 mermaid 围栏，import 不应已发生
    expect(state.mermaidImported).toBe(false);
    const w = mount(MarkdownRenderer, {
      props: { content: '```mermaid\ngraph TD\n  A --> B\n```' },
    });
    await vi.waitFor(() => expect(state.mermaidImported).toBe(true));
    await vi.waitFor(() => expect(w.find('.aix-md-mermaid svg').exists()).toBe(true));
  });
});
