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
    props: ['data', 'keepMounted'],
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

  it('allowHtml 透传到气泡内的 MarkdownRenderer → 渲染为 sandbox iframe', async () => {
    const w = mount(AiChat, {
      props: {
        request,
        defaultMessages: [aiMsg('<div class="card">卡片内容</div>')],
        allowHtml: true,
      },
    });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));
    expect(w.find('iframe').attributes('srcdoc')).toContain('卡片内容');
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

  // markdown 级配置经 provideAiChatConfig 下发，AiChat 持有其 shallowReactive 引用并持续同步，
  // 故运行时改 props 即刻生效——不再是挂载时快照，也不再需要 :key 重建实例（那会丢整棵对话树）。
  it('运行时切换 allowHtml：双向都即刻生效，无需重建实例', async () => {
    const w = mount(AiChat, {
      props: { request, defaultMessages: [aiMsg('<div class="card">卡片内容</div>')] },
    });
    await vi.waitFor(() => expect(w.find('p').exists()).toBe(true));
    expect(w.find('iframe').exists()).toBe(false);

    await w.setProps({ allowHtml: true });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));

    // 切回去同样生效（引擎按模式缓存，来回切不会卡在某一模式）
    await w.setProps({ allowHtml: false });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(false));
    expect(w.text()).toContain('卡片内容');
  });

  it('运行时替换 markdownRenderers：新渲染器即刻接管', async () => {
    const w = mount(AiChat, {
      props: { request, defaultMessages: [aiMsg('```js\nconst a = 1\n```')] },
    });
    await vi.waitFor(() => expect(w.find('pre').exists()).toBe(true));
    expect(w.find('div.my-code').exists()).toBe(false);

    await w.setProps({
      markdownRenderers: { fence: ({ token }) => h('div', { class: 'my-code' }, token.content) },
    });
    await vi.waitFor(() => expect(w.find('div.my-code').exists()).toBe(true));
  });

  it('运行时切换 reasoningVariant：经同一条注入通道下发到 ReasoningBlock', async () => {
    const reasoning: ChatMessage = {
      id: 'a2',
      role: 'ai',
      status: 'success',
      content: [{ id: 'r1', type: 'reasoning', text: '想一想' }],
    };
    const w = mount(AiChat, { props: { request, defaultMessages: [reasoning] } });
    await vi.waitFor(() => expect(w.find('.aix-thinking').exists()).toBe(true));
    expect(w.find('.aix-thinking--capsule').exists()).toBe(false);

    await w.setProps({ reasoningVariant: 'capsule' });
    await vi.waitFor(() => expect(w.find('.aix-thinking--capsule').exists()).toBe(true));
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
