import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('markdown-it', () => ({
  default: class {
    render(src: string) {
      return `<strong>${src}</strong>`;
    }
  },
}));

import MarkdownRenderer from '../src/components/MarkdownRenderer.vue';

describe('MarkdownRenderer', () => {
  it('依赖存在时渲染 HTML', async () => {
    const w = mount(MarkdownRenderer, { props: { content: 'hi' } });
    // 冷启动时渲染器链路含真实的 katex 插件动态 import（跨宏任务），
    // flushPromises 只刷微任务等不到，用 waitFor 轮询直到就绪
    await vi.waitFor(() => {
      expect(w.html()).toContain('<strong>hi</strong>');
    });
  });

  it('content 变化时重渲染（流式场景）', async () => {
    const w = mount(MarkdownRenderer, { props: { content: '旧内容' } });
    await flushPromises();
    expect(w.html()).toContain('<strong>旧内容</strong>');
    await w.setProps({ content: '新内容' });
    await flushPromises();
    await nextTick();
    expect(w.html()).toContain('<strong>新内容</strong>');
    expect(w.html()).not.toContain('<strong>旧内容</strong>');
  });

  it('content 挂载即提供时，renderer 就绪后渲染为 HTML', async () => {
    const wrapper = mount(MarkdownRenderer, { props: { content: '**bold**' } });
    await new Promise((r) => setTimeout(r, 0)); // 等动态 import 的 renderer 就绪
    await nextTick();
    expect(wrapper.html()).toContain('<strong>');
  });
});
