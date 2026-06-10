import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { imageRenderers, __resetImageCache } from '../src/utils/imageRenderers';
import type { MdToken } from '../src/utils/markdownWalker';

const imageToken = (src: string, alt = '示意图'): MdToken => ({
  type: 'image',
  tag: 'img',
  nesting: 0,
  level: 0,
  content: alt,
  info: '',
  map: null,
  children: null,
  attrs: [
    ['src', src],
    ['alt', alt],
  ],
});

const mountImage = (src: string, alt?: string) => {
  const vnode = imageRenderers.image!({
    token: imageToken(src, alt),
    renderChildren: () => [],
    info: { streaming: false },
  });
  return mount(defineComponent({ render: () => h('div', vnode as never) }));
};

describe('imageRenderers（内置图片骨架）', () => {
  beforeEach(() => __resetImageCache());

  it('初始为骨架态：shimmer 占位可见，图片隐藏预加载中', () => {
    const w = mountImage('https://a.com/x.png');
    expect(w.find('.aix-skeleton').exists()).toBe(true);
    // 预加载 img 存在（用于触发 onload）但不可见展示
    expect(w.find('img').exists()).toBe(true);
  });

  it('load 事件后切换为图片展示并写入缓存', async () => {
    const w = mountImage('https://a.com/x.png');
    await w.find('img').trigger('load');
    await nextTick();
    expect(w.find('.aix-skeleton').exists()).toBe(false);
    const img = w.find('img.aix-md-image__img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://a.com/x.png');
    expect(img.attributes('alt')).toBe('示意图');
  });

  it('同 src 二次挂载命中缓存：直接出图不再闪骨架', async () => {
    const a = mountImage('https://a.com/cached.png');
    await a.find('img').trigger('load');
    const b = mountImage('https://a.com/cached.png');
    expect(b.find('.aix-skeleton').exists()).toBe(false);
    expect(b.find('img.aix-md-image__img').exists()).toBe(true);
    a.unmount();
    b.unmount();
  });

  it('error 事件后渲染失败占位（含 alt 文案），不裂图', async () => {
    const w = mountImage('https://a.com/broken.png', '销量走势');
    await w.find('img').trigger('error');
    await nextTick();
    expect(w.find('.aix-md-image--error').exists()).toBe(true);
    expect(w.text()).toContain('销量走势');
    expect(w.find('img.aix-md-image__img').exists()).toBe(false);
  });

  it('无 src 的异常 token 渲染失败占位，不抛错', () => {
    const vnode = imageRenderers.image!({
      token: { ...imageToken('', ''), attrs: null },
      renderChildren: () => [],
      info: { streaming: false },
    });
    const w = mount(defineComponent({ render: () => h('div', vnode as never) }));
    expect(w.find('.aix-md-image--error').exists()).toBe(true);
    // 无 alt/src 时兜底文案取自 locale.imageLoadError（默认 zh-CN）
    expect(w.text()).toContain('图片加载失败');
  });
});
