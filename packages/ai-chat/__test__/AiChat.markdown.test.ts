import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
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
    await vi.waitFor(() => expect(w.text()).toContain('卡片内容'));
    expect(w.find('div.card').exists()).toBe(false);
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
