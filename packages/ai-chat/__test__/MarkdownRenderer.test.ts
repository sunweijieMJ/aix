import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import MarkdownRenderer from '../src/components/MarkdownRenderer.vue';
import { __resetMarkdownEngineCache } from '../src/composables/useMarkdownRenderer';

// 新架构：token→VNode walker + 块级渲染 + 数学；冷启动需等引擎动态 import，用 vi.waitFor 轮询。
describe('MarkdownRenderer（块级 + walker + 数学）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('渲染标题与段落', async () => {
    const w = mount(MarkdownRenderer, { props: { content: '# 标题\n\n正文' } });
    await vi.waitFor(() => {
      expect(w.html()).toContain('<h1>标题</h1>');
      expect(w.html()).toContain('<p>正文</p>');
    });
  });

  it('块级公式 $$...$$ 渲染为 KaTeX', async () => {
    const w = mount(MarkdownRenderer, { props: { content: '$$E=mc^2$$' } });
    await vi.waitFor(() => expect(w.html()).toContain('katex'));
  });

  it('\\[...\\] 定界符公式（归一化后）渲染为 KaTeX', async () => {
    const w = mount(MarkdownRenderer, { props: { content: '\\[ E=mc^2 \\]' } });
    await vi.waitFor(() => expect(w.html()).toContain('katex'));
  });

  it('自定义 markdownRenderers 覆盖内置（扩展性核心）', async () => {
    const w = mount(MarkdownRenderer, {
      props: {
        content: '```js\nx\n```',
        markdownRenderers: { fence: ({ token }) => h('div', { class: 'my-code' }, token.content) },
      },
    });
    await vi.waitFor(() => {
      expect(w.html()).toContain('class="my-code"');
      expect(w.html()).not.toContain('<pre>');
    });
  });

  it('多个顶层块渲染为独立元素（块级）', async () => {
    const w = mount(MarkdownRenderer, { props: { content: '第一段\n\n第二段' } });
    await vi.waitFor(() => {
      const ps = w.findAll('p');
      expect(ps.length).toBe(2);
    });
  });

  it('content 变化时重渲染（流式）', async () => {
    const w = mount(MarkdownRenderer, { props: { content: '旧内容', streaming: true } });
    await vi.waitFor(() => expect(w.html()).toContain('旧内容'));
    await w.setProps({ content: '旧内容\n\n新内容' });
    await vi.waitFor(() => expect(w.html()).toContain('新内容'));
  });

  it('allowHtml=true 渲染消毒后的块级 HTML', async () => {
    const w = mount(MarkdownRenderer, {
      props: { content: '<div class="card">卡片内容</div>', allowHtml: true },
    });
    await vi.waitFor(() => expect(w.find('div.card').exists()).toBe(true));
    expect(w.find('div.card').text()).toContain('卡片内容');
  });

  it('allowHtml=false（默认）原始 HTML 被转义为文本，不生成元素', async () => {
    const w = mount(MarkdownRenderer, { props: { content: '<div class="card">卡片内容</div>' } });
    await vi.waitFor(() => expect(w.text()).toContain('卡片内容'));
    expect(w.find('div.card').exists()).toBe(false);
  });

  it('allowHtml=true 仍消毒 XSS（块级 HTML 内的 onerror 去除）', async () => {
    const w = mount(MarkdownRenderer, {
      props: {
        content: '<div class="danger"><img src=y onerror="alert(1)"></div>',
        allowHtml: true,
      },
    });
    // 等块级 HTML 消毒渲染就绪（div.danger 出现），再断言危险属性已去除
    await vi.waitFor(() => expect(w.find('div.danger').exists()).toBe(true));
    expect(w.html()).not.toContain('onerror');
  });
});
