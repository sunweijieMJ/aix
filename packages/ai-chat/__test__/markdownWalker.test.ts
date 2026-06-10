import { mount } from '@vue/test-utils';
import MarkdownIt from 'markdown-it';
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import {
  renderMarkdownTokens,
  type MarkdownRenderers,
  type MdToken,
} from '../src/utils/markdownWalker';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

/** 把一段 markdown 经 walker 渲染成 DOM，返回 wrapper.html() */
const render = (src: string, renderers: MarkdownRenderers = {}) => {
  const tokens = md.parse(src, {}) as unknown as MdToken[];
  const Harness = defineComponent({
    render: () => h('div', renderMarkdownTokens(tokens, { renderers, info: { streaming: false } })),
  });
  return mount(Harness).html();
};

describe('renderMarkdownTokens（token→VNode walker）', () => {
  it('段落 + 文本 → <p>', () => {
    expect(render('hello world')).toContain('<p>hello world</p>');
  });

  it('加粗与斜体 → <strong> / <em>', () => {
    const html = render('**粗** 和 *斜*');
    expect(html).toContain('<strong>粗</strong>');
    expect(html).toContain('<em>斜</em>');
  });

  it('标题 → <h2>', () => {
    expect(render('## 标题')).toContain('<h2>标题</h2>');
  });

  it('链接 → <a href>', () => {
    const html = render('[谷歌](https://g.cn)');
    expect(html).toContain('href="https://g.cn"');
    expect(html).toContain('>谷歌</a>');
  });

  it('行内代码 → <code>', () => {
    expect(render('用 `code` 表示')).toContain('<code>code</code>');
  });

  it('围栏代码块 → <pre><code>', () => {
    const html = render('```js\nconst a = 1\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code>');
    expect(html).toContain('const a = 1');
  });

  it('无序列表 → <ul><li>', () => {
    const html = render('- a\n- b');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('a');
    expect(html).toContain('b');
  });

  it('表格 → <table> 含单元格', () => {
    const html = render('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('注册表可覆盖内置渲染器（扩展性核心）', () => {
    const html = render('```js\nx\n```', {
      fence: ({ token }) => h('div', { class: 'my-code' }, token.content),
    });
    expect(html).toContain('class="my-code"');
    expect(html).not.toContain('<pre>');
  });

  it('未注册的 token 类型安全降级（不崩溃，渲染其内容/子节点）', () => {
    // 伪造一个未知自闭合 token
    const tokens = [
      {
        type: 'unknown_thing',
        tag: '',
        nesting: 0,
        content: '兜底文本',
        info: '',
        children: null,
        attrs: null,
      },
    ] as unknown as MdToken[];
    const Harness = defineComponent({
      render: () =>
        h('div', renderMarkdownTokens(tokens, { renderers: {}, info: { streaming: false } })),
    });
    expect(mount(Harness).html()).toContain('兜底文本');
  });

  describe('fence:<lang> 语言分发', () => {
    it('注册了 fence:mermaid 时，mermaid 围栏走语言渲染器', () => {
      const html = render('```mermaid\ngraph TD\n```', {
        'fence:mermaid': ({ token }) => h('div', { class: 'diagram' }, token.content),
      });
      expect(html).toContain('diagram');
      expect(html).toContain('graph TD');
      expect(html).not.toContain('<pre>');
    });

    it('未注册语言渲染器时回落通用 fence（默认代码块）', () => {
      const html = render('```mermaid\ngraph TD\n```');
      expect(html).toContain('<pre>');
      expect(html).not.toContain('diagram');
    });

    it('语言分发不影响其它语言围栏', () => {
      const html = render('```js\nconst a = 1\n```', {
        'fence:mermaid': () => h('div', { class: 'diagram' }),
      });
      expect(html).toContain('<pre>');
      expect(html).not.toContain('diagram');
    });

    it('info 含附加参数时只取首个词作为语言', () => {
      const html = render('```mermaid {theme}\ngraph TD\n```', {
        'fence:mermaid': () => h('div', { class: 'diagram' }),
      });
      expect(html).toContain('diagram');
    });

    it('用户注册的通用 fence 渲染器优先级低于语言渲染器、高于内置', () => {
      const html = render('```mermaid\ngraph TD\n```', {
        fence: ({ token }) => h('div', { class: 'generic' }, token.content),
        'fence:mermaid': () => h('div', { class: 'diagram' }),
      });
      expect(html).toContain('diagram');
      expect(html).not.toContain('generic');
    });
  });
});
