import { mount } from '@vue/test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { h } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import { __resetMarkdownEngineCache } from '../src/composables/useMarkdownRenderer';
import type { ChatMessage } from '../src/types';

// virtua 在 jsdom 下需要 ResizeObserver；用 stub 直渲 default slot（与 AiChat.test 一致）
vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data'],
    setup(
      props: { data: unknown[] },
      { slots }: { slots: Record<string, (p: unknown) => unknown> },
    ) {
      return () => props.data.map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

const request = () => Promise.resolve(new ReadableStream<Uint8Array>());

const aiMsg = (text: string): ChatMessage => ({
  id: 'a1',
  role: 'ai',
  status: 'success',
  content: [{ id: 'b1', type: 'text', text }],
});

describe('AiChat 贯通 allowHtml / markdownRenderers', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('allowHtml 透传到气泡内的 MarkdownRenderer → 渲染消毒后的块级 HTML', async () => {
    const w = mount(AiChat, {
      props: {
        request,
        defaultMessages: [aiMsg('<div class="card">卡片内容</div>')],
        allowHtml: true,
      },
    });
    await vi.waitFor(() => expect(w.find('div.card').exists()).toBe(true));
  });

  it('allowHtml 默认 false → 原始 HTML 不生成元素', async () => {
    const w = mount(AiChat, {
      props: { request, defaultMessages: [aiMsg('<div class="card">卡片内容</div>')] },
    });
    // 引擎就绪须以结构性标志（<p> 出现）判定——纯文本降级态 text() 同样含原文，会提前假通过
    await vi.waitFor(() => expect(w.find('p').exists()).toBe(true));
    expect(w.find('div.card').exists()).toBe(false);
    expect(w.text()).toContain('卡片内容');
  });

  it('运行时变更 markdown 级配置：告警一次提示快照语义', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = mount(AiChat, { props: { request, defaultMessages: [aiMsg('hi')] } });
    await w.setProps({ allowHtml: true });
    await w.setProps({ allowHtml: false });
    const calls = warnSpy.mock.calls.filter((c) => String(c[0]).includes('挂载时快照'));
    expect(calls).toHaveLength(1); // 仅告警一次，不逐次刷屏
    warnSpy.mockRestore();
  });

  it('markdownRenderers 透传 → 自定义渲染器生效', async () => {
    const w = mount(AiChat, {
      props: {
        request,
        defaultMessages: [aiMsg('```js\nconst a = 1\n```')],
        markdownRenderers: { fence: ({ token }) => h('div', { class: 'my-code' }, token.content) },
      },
    });
    await vi.waitFor(() => expect(w.find('div.my-code').exists()).toBe(true));
  });
});
