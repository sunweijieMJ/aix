import { mount } from '@vue/test-utils';
import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
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

  // 防回归：无 key 的同位置 patch 会复用组件实例（消息编辑/重新生成后同位置图片不同 src），
  // status 必须随 src 复位，否则旧图 error 态粘住、新图连预加载 img 都不渲染且无任何恢复手段
  it('src 变化后复位加载状态：旧图 error 态不粘到新图（与 diagramRenderers 复位模式一致）', async () => {
    const src = ref('https://a.com/broken.png');
    const w = mount(
      defineComponent({
        setup: () => () =>
          h(
            'div',
            imageRenderers.image!({
              token: imageToken(src.value, '图'),
              renderChildren: () => [],
              info: { streaming: false },
            }) as never,
          ),
      }),
    );
    await w.find('img').trigger('error');
    expect(w.find('.aix-md-image--error').exists()).toBe(true);
    src.value = 'https://a.com/ok.png';
    await nextTick();
    // 新 src 应回到骨架预加载态，而不是停留在旧图的失败占位
    expect(w.find('.aix-md-image--error').exists()).toBe(false);
    expect(w.find('.aix-skeleton').exists()).toBe(true);
    expect(w.find('img.aix-md-image__preload').attributes('src')).toBe('https://a.com/ok.png');
  });

  it('src 变化且新图已在缓存：直接出图不闪骨架', async () => {
    const cached = mountImage('https://a.com/cached2.png');
    await cached.find('img').trigger('load');
    const src = ref('https://a.com/first.png');
    const w = mount(
      defineComponent({
        setup: () => () =>
          h(
            'div',
            imageRenderers.image!({
              token: imageToken(src.value, '图'),
              renderChildren: () => [],
              info: { streaming: false },
            }) as never,
          ),
      }),
    );
    expect(w.find('.aix-skeleton').exists()).toBe(true);
    src.value = 'https://a.com/cached2.png';
    await nextTick();
    expect(w.find('.aix-skeleton').exists()).toBe(false);
    expect(w.find('img.aix-md-image__img').attributes('src')).toBe('https://a.com/cached2.png');
  });

  it('缓存命中后实际加载失败：切换失败占位并清除缓存（兑现「不裂图」承诺）', async () => {
    const a = mountImage('https://a.com/evicted.png');
    await a.find('img').trigger('load'); // 首次成功，写入缓存
    // 二次挂载命中缓存直出 <img>；但缓存只代表「本会话加载过」，实际可能已失效（CDN 过期/网络变化）
    const b = mountImage('https://a.com/evicted.png');
    await b.find('img.aix-md-image__img').trigger('error');
    expect(b.find('.aix-md-image--error').exists()).toBe(true);
    expect(b.find('img.aix-md-image__img').exists()).toBe(false);
    // 缓存同步清除：后续挂载回到骨架态重试预加载，而不是再次直出裂图
    const c = mountImage('https://a.com/evicted.png');
    expect(c.find('.aix-skeleton').exists()).toBe(true);
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
