import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { createHighlightRenderers, __resetHighlightCache } from '../src/utils/codeRenderers';
import type { MdToken, MarkdownRenderInfo } from '../src/utils/markdownWalker';

// hljs 经依赖注入（非模块 mock），纯对象假实现即可
const makeHljs = () => ({
  getLanguage: vi.fn((name: string) => (name === 'js' ? {} : null)),
  highlight: vi.fn((code: string, opts: { language: string }) => ({
    value: `<span class="hljs-keyword">${opts.language}</span>${code}`,
  })),
  highlightAuto: vi.fn((code: string) => ({ value: `<span class="hljs-auto">${code}</span>` })),
});

const fenceToken = (content: string, lang: string): MdToken => ({
  type: 'fence',
  tag: 'code',
  nesting: 0,
  level: 0,
  content,
  info: lang,
  map: null,
  children: null,
  attrs: null,
});

const mountFence = (
  renderers: ReturnType<typeof createHighlightRenderers>,
  content: string,
  lang: string,
  info: MarkdownRenderInfo,
) => {
  const vnode = renderers.fence!({
    token: fenceToken(content, lang),
    renderChildren: () => [],
    info,
  });
  return mount(defineComponent({ render: () => h('div', vnode as never) }));
};

describe('createHighlightRenderers（代码高亮渲染器）', () => {
  beforeEach(() => __resetHighlightCache());

  it('块未固化（流式中）：渲染纯代码块逐字可见，不触发高亮', async () => {
    const hljs = makeHljs();
    const w = mountFence(createHighlightRenderers(hljs), 'const x=1', 'js', {
      streaming: true,
      committed: false,
    });
    await nextTick();
    expect(w.find('code.hljs').exists()).toBe(false);
    expect(w.text()).toContain('const x=1');
    expect(hljs.highlight).not.toHaveBeenCalled();
    expect(hljs.highlightAuto).not.toHaveBeenCalled();
  });

  it('块固化 + 已知语言：用 hljs.highlight(language) 上色', async () => {
    const hljs = makeHljs();
    const w = mountFence(createHighlightRenderers(hljs), 'const x=1', 'js', {
      streaming: true,
      committed: true,
    });
    await nextTick();
    expect(hljs.highlight).toHaveBeenCalledWith(
      'const x=1',
      expect.objectContaining({ language: 'js' }),
    );
    expect(w.find('code.hljs').exists()).toBe(true);
    expect(w.html()).toContain('hljs-keyword');
    expect(w.find('code').classes()).toContain('language-js');
  });

  it('块固化 + 未知/无语言：回落 highlightAuto 自动检测', async () => {
    const hljs = makeHljs();
    const w = mountFence(createHighlightRenderers(hljs), 'foo bar', 'unknownlang', {
      streaming: false,
    });
    await nextTick();
    expect(hljs.highlightAuto).toHaveBeenCalledWith('foo bar');
    expect(hljs.highlight).not.toHaveBeenCalled();
    expect(w.html()).toContain('hljs-auto');
  });

  it('committed 未注入时按非流式即固化处理（直接使用 walker 的场景）', async () => {
    const hljs = makeHljs();
    const w = mountFence(createHighlightRenderers(hljs), 'const x=1', 'js', { streaming: false });
    await nextTick();
    expect(w.find('code.hljs').exists()).toBe(true);
  });

  it('高亮抛错：降级为纯代码块，不抛错破坏渲染', async () => {
    const hljs = makeHljs();
    hljs.highlight.mockImplementation(() => {
      throw new Error('highlight failed');
    });
    const w = mountFence(createHighlightRenderers(hljs), 'const x=1', 'js', { streaming: false });
    await nextTick();
    expect(w.find('code.hljs').exists()).toBe(false);
    expect(w.text()).toContain('const x=1');
  });

  it('同 code+lang 命中缓存：第二次挂载不再调用 hljs.highlight', async () => {
    const hljs = makeHljs();
    const renderers = createHighlightRenderers(hljs);
    const a = mountFence(renderers, 'const x=1', 'js', { streaming: false });
    await nextTick();
    const b = mountFence(renderers, 'const x=1', 'js', { streaming: false });
    await nextTick();
    expect(b.find('code.hljs').exists()).toBe(true);
    expect(hljs.highlight).toHaveBeenCalledTimes(1);
    a.unmount();
    b.unmount();
  });

  describe('代码块头部（语言标签 + 复制按钮）', () => {
    it('块固化：渲染头部语言标签与复制按钮', async () => {
      const hljs = makeHljs();
      const w = mountFence(createHighlightRenderers(hljs), 'const x=1', 'js', { streaming: false });
      await nextTick();
      expect(w.find('.aix-md-codeblock').exists()).toBe(true);
      expect(w.find('.aix-md-codeblock__lang').text()).toBe('js');
      const btn = w.find('.aix-md-codeblock__copy');
      expect(btn.exists()).toBe(true);
      expect(btn.attributes('title')).toBe('复制');
    });

    it('流式中（未固化）：不渲染复制按钮，避免复制半截代码', async () => {
      const hljs = makeHljs();
      const w = mountFence(createHighlightRenderers(hljs), 'const x=1', 'js', {
        streaming: true,
        committed: false,
      });
      await nextTick();
      expect(w.find('.aix-md-codeblock__copy').exists()).toBe(false);
      expect(w.text()).toContain('const x=1');
    });

    it('无语言且流式中：维持纯 <pre> 代码块，不加外壳头部', async () => {
      const hljs = makeHljs();
      const w = mountFence(createHighlightRenderers(hljs), 'plain text', '', {
        streaming: true,
        committed: false,
      });
      await nextTick();
      expect(w.find('.aix-md-codeblock').exists()).toBe(false);
      expect(w.find('pre.aix-md-code').exists()).toBe(true);
    });

    it('点击复制：把原始代码写入剪贴板并切到「已复制」', async () => {
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
      const hljs = makeHljs();
      const w = mountFence(createHighlightRenderers(hljs), 'const x=1', 'js', { streaming: false });
      await nextTick();
      await w.find('.aix-md-codeblock__copy').trigger('click');
      await nextTick();
      // 复制的是原始代码而非高亮后的 HTML
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x=1');
      expect(w.find('.aix-md-codeblock__copy').attributes('title')).toBe('已复制');
    });

    it('无 Clipboard API（HTTP / 旧浏览器）时点击复制经 execCommand 兜底仍切「已复制」', async () => {
      Object.assign(navigator, { clipboard: undefined });
      // 本 jsdom 未实现 execCommand，直接赋值 mock
      const exec = vi.fn().mockReturnValue(true);
      (document as unknown as { execCommand?: unknown }).execCommand = exec;
      const hljs = makeHljs();
      const w = mountFence(createHighlightRenderers(hljs), 'const x=1', 'js', { streaming: false });
      await nextTick();
      await w.find('.aix-md-codeblock__copy').trigger('click');
      await nextTick();
      expect(exec).toHaveBeenCalledWith('copy');
      expect(w.find('.aix-md-codeblock__copy').attributes('title')).toBe('已复制');
      delete (document as unknown as { execCommand?: unknown }).execCommand;
    });
  });
});
