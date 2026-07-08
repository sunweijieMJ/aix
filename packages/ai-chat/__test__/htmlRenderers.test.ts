import { mount } from '@vue/test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { createHtmlRenderers, __resetHtmlSandboxId } from '../src/utils/htmlRenderers';
import type { MdToken, MarkdownRenderInfo } from '../src/utils/markdownWalker';

const renderers = createHtmlRenderers();

const blockToken = (content: string): MdToken => ({
  type: 'html_block',
  tag: '',
  nesting: 0,
  level: 0,
  content,
  info: '',
  map: null,
  children: null,
  attrs: null,
});

const fenceToken = (content: string): MdToken => ({
  type: 'fence',
  tag: 'code',
  nesting: 0,
  level: 0,
  content,
  info: 'html',
  map: null,
  children: null,
  attrs: null,
});

const mountBlock = (key: 'html_block' | 'fence:html', token: MdToken, info: MarkdownRenderInfo) => {
  const vnode = renderers[key]!({ token, renderChildren: () => [], info });
  return mount(defineComponent({ render: () => h('div', vnode as never) }), {
    attachTo: document.body,
  });
};

describe('createHtmlRenderers（HTML Sandbox：iframe sandbox 渲染）', () => {
  beforeEach(() => {
    __resetHtmlSandboxId();
  });

  it('未固化（流式中）：维持原始代码展示，不渲染 iframe', () => {
    const w = mountBlock('html_block', blockToken('<div>内容</div>'), {
      streaming: true,
      committed: false,
    });
    expect(w.find('pre.aix-md-html-sandbox-source').exists()).toBe(true);
    expect(w.text()).toContain('<div>内容</div>');
    expect(w.find('iframe').exists()).toBe(false);
    w.unmount();
  });

  it('固化后：渲染 sandbox iframe，sandbox 仅含 allow-scripts（不含 allow-same-origin）', () => {
    const w = mountBlock('html_block', blockToken('<div>内容</div>'), { streaming: false });
    const iframe = w.find('iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('sandbox')).toBe('allow-scripts');
    expect(iframe.attributes('sandbox')).not.toContain('allow-same-origin');
    expect(iframe.attributes('srcdoc')).toContain('<div>内容</div>');
    w.unmount();
  });

  it('fence:html 围栏走同一渲染路径', () => {
    const w = mountBlock('fence:html', fenceToken('<p>fence</p>'), { streaming: false });
    expect(w.find('iframe').attributes('srcdoc')).toContain('<p>fence</p>');
    w.unmount();
  });

  it('committed 未注入时按非流式即固化处理（直接使用 walker 的场景）', () => {
    const w = mountBlock('html_block', blockToken('<span>x</span>'), { streaming: false });
    expect(w.find('iframe').exists()).toBe(true);
    w.unmount();
  });

  it('默认预览态；点击「代码」切换为源码展示，iframe 隐藏而非卸载（不重新加载）', async () => {
    const w = mountBlock('html_block', blockToken('<b>x</b>'), { streaming: false });
    const iframe = w.find('iframe');
    expect((iframe.element as HTMLElement).style.display).toBe('block');

    const tabs = w.findAll('.aix-md-html-sandbox__tab');
    await tabs[1]!.trigger('click'); // 「代码」
    expect((w.find('iframe').element as HTMLElement).style.display).toBe('none');
    expect(w.find('.aix-md-html-sandbox__code').text()).toContain('<b>x</b>');
    expect(w.find('iframe').exists()).toBe(true); // 仍在 DOM 中，隐藏而非销毁

    await tabs[0]!.trigger('click'); // 切回「预览」
    expect((w.find('iframe').element as HTMLElement).style.display).toBe('block');
    w.unmount();
  });

  it('postMessage 按 id 精确匹配更新 iframe 高度；id 不匹配的消息被忽略', async () => {
    const w = mountBlock('html_block', blockToken('<div>x</div>'), { streaming: false });
    const id = w.find('.aix-md-html-sandbox').attributes('data-sandbox-id')!;
    expect(id).toBeTruthy();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'aix-html-sandbox-resize', id: 'other-id', height: 999 },
      }),
    );
    await nextTick();
    expect((w.find('iframe').element as HTMLElement).style.height).not.toBe('999px');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'aix-html-sandbox-resize', id, height: 240 },
      }),
    );
    await nextTick();
    expect((w.find('iframe').element as HTMLElement).style.height).toBe('240px');
    w.unmount();
  });

  it('新窗口打开：window.open 后写入含 sandbox="allow-scripts" 的文档；弹窗被拦截时静默不抛错', async () => {
    const write = vi.fn();
    const original = window.open;
    window.open = vi.fn(() => ({
      document: { open: vi.fn(), write, close: vi.fn() },
    })) as unknown as typeof window.open;

    const w = mountBlock('html_block', blockToken('<em>x</em>'), { streaming: false });
    const actions = w.findAll('.aix-md-html-sandbox__action');
    await actions[0]!.trigger('click'); // 新窗口打开
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toContain('sandbox="allow-scripts"');
    expect(write.mock.calls[0]![0]).toContain('<em>x</em>');

    window.open = (() => null) as unknown as typeof window.open;
    await actions[0]!.trigger('click'); // 弹窗被拦截：不抛错
    window.open = original;
    w.unmount();
  });

  it('工具条只有代码/预览切换和新窗口打开，无全屏按钮', () => {
    const w = mountBlock('html_block', blockToken('<div>x</div>'), { streaming: false });
    expect(w.findAll('.aix-md-html-sandbox__action')).toHaveLength(1);
    w.unmount();
  });

  it('行内裸 HTML 标签仍被丢弃（P1 既有行为不变）', () => {
    const token: MdToken = { ...blockToken('<b>'), type: 'html_inline' };
    const out = renderers.html_inline!({
      token,
      renderChildren: () => [],
      info: { streaming: false },
    });
    expect(out).toBe('');
  });
});
