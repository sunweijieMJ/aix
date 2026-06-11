import { mount } from '@vue/test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { h } from 'vue';
import MarkdownRenderer from '../src/components/MarkdownRenderer.vue';
import { __resetMarkdownEngineCache } from '../src/composables/useMarkdownRenderer';
import type { MarkdownRenderContext } from '../src/utils/markdownWalker';

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

  it('streaming 时根节点加 is-streaming 修饰类（驱动流式尾光标）', () => {
    const on = mount(MarkdownRenderer, { props: { content: 'hi', streaming: true } });
    expect(on.find('.aix-markdown').classes()).toContain('is-streaming');
    const off = mount(MarkdownRenderer, { props: { content: 'hi', streaming: false } });
    expect(off.find('.aix-markdown').classes()).not.toContain('is-streaming');
  });

  // 集成层只验证「数学渲染器已接入渲染链」；$$..$$ 与 \[..\] 两种定界符各取一例，
  // 后者顺带覆盖归一化已接线（归一化函数本身的细节断言在 normalizeMathDelimiters.test.ts）。
  it.each([['$$E=mc^2$$'], ['\\[ E=mc^2 \\]']])('数学公式 %s 渲染为 KaTeX', async (content) => {
    const w = mount(MarkdownRenderer, { props: { content } });
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

  it('引用式链接：定义行与使用处分属不同块也能解析（回归：按块独立解析丢失引用表）', async () => {
    const w = mount(MarkdownRenderer, {
      props: { content: '见 [示例][ex]\n\n[ex]: https://example.com' },
    });
    await vi.waitFor(() => {
      const a = w.find('a');
      expect(a.exists()).toBe(true);
      expect(a.attributes('href')).toBe('https://example.com');
    });
  });

  it('流式中引用定义后到：已渲染块中的引用链接随定义补全', async () => {
    const w = mount(MarkdownRenderer, { props: { content: '见 [示例][ex]', streaming: true } });
    await vi.waitFor(() => expect(w.find('p').exists()).toBe(true));
    expect(w.find('a').exists()).toBe(false);
    await w.setProps({ content: '见 [示例][ex]\n\n[ex]: https://example.com' });
    await vi.waitFor(() => expect(w.find('a').attributes('href')).toBe('https://example.com'));
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
    // 引擎就绪须以结构性标志（<p> 出现）判定——纯文本降级态 text() 同样含原文，会提前假通过
    await vi.waitFor(() => expect(w.find('p').exists()).toBe(true));
    expect(w.find('div.card').exists()).toBe(false);
    expect(w.text()).toContain('卡片内容');
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

  it('流式时非末块 info.committed=true、末块 false；流式结束后全部 true', async () => {
    const probe = {
      paragraph: ({ renderChildren, info }: MarkdownRenderContext) =>
        h('p', { 'data-committed': String(info.committed) }, renderChildren()),
    };
    const w = mount(MarkdownRenderer, {
      props: { content: '第一段\n\n第二段', streaming: true, markdownRenderers: probe },
    });
    // 等引擎加载完毕、块级渲染就绪（纯文本降级态也含"第二段"文本，须以 <p> 数量为准）
    await vi.waitFor(() => expect(w.findAll('p').length).toBe(2));
    const ps = w.findAll('p');
    expect(ps[0]!.attributes('data-committed')).toBe('true');
    expect(ps[1]!.attributes('data-committed')).toBe('false');

    // 流式结束：全部固化
    await w.setProps({ streaming: false });
    await vi.waitFor(() => {
      expect(w.findAll('p')[1]!.attributes('data-committed')).toBe('true');
    });
  });

  it('图片 token 渲染为骨架占位组件（内置 imageRenderers 已接入合并链）', async () => {
    const w = mount(MarkdownRenderer, {
      props: { content: '看图：![示意](https://a.com/x.png)' },
    });
    await vi.waitFor(() => expect(w.find('.aix-md-image').exists()).toBe(true));
    // 未触发 load 前为骨架态
    expect(w.find('.aix-skeleton').exists()).toBe(true);
  });

  it('用户 markdownRenderers.image 覆盖内置图片骨架（注册表优先级）', async () => {
    const w = mount(MarkdownRenderer, {
      props: {
        content: '![示意](https://a.com/x.png)',
        markdownRenderers: { image: () => h('span', { class: 'my-img' }, '自定义图片') },
      },
    });
    await vi.waitFor(() => expect(w.find('.my-img').exists()).toBe(true));
    expect(w.find('.aix-md-image').exists()).toBe(false);
  });

  // 非流式 mermaid → SVG 的纯净态由下方流式用例的「流式结束后成图」尾段一并覆盖，故不再单列。
  it('流式中 ```mermaid 围栏维持代码块逐字可见，流式结束后成图', async () => {
    const content = '```mermaid\ngraph TD\n  A --> B\n```';
    const w = mount(MarkdownRenderer, { props: { content, streaming: true } });
    await vi.waitFor(() => expect(w.find('pre').exists()).toBe(true));
    expect(w.text()).toContain('graph TD');
    expect(w.find('.aix-md-mermaid').exists()).toBe(false);

    await w.setProps({ streaming: false });
    await vi.waitFor(() => expect(w.find('.aix-md-mermaid svg').exists()).toBe(true));
  });
});
