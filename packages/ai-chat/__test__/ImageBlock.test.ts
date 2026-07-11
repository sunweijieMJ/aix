import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ImageBlock from '../src/components/blocks/ImageBlock.vue';
import type { BubbleContentInfo } from '../src/types';
import { imageBlock } from '../src/utils/helpers';

const info: BubbleContentInfo = { role: 'ai', key: 'm1' };

describe('ImageBlock（结构化图片块）', () => {
  it('state=loading：渲染骨架占位，不出图', () => {
    const w = mount(ImageBlock, {
      props: { block: imageBlock([], { state: 'loading' }), info },
    });
    expect(w.find('.aix-skeleton').exists()).toBe(true);
    expect(w.find('img').exists()).toBe(false);
  });

  it('state=error：降级为文案，展示 errorText', () => {
    const w = mount(ImageBlock, {
      props: {
        block: imageBlock([], { state: 'error', errorText: '生成失败，请重试' }),
        info,
      },
    });
    expect(w.find('.aix-image-block__fallback').text()).toContain('生成失败，请重试');
  });

  it('单图：渲染一个可点击按钮', () => {
    const block = imageBlock([{ url: 'https://a.com/1.png', alt: '示意图' }]);
    const w = mount(ImageBlock, { props: { block, info } });
    expect(w.findAll('.aix-image-block__trigger')).toHaveLength(1);
  });

  it('多图：渲染 N 个可点击缩略图按钮', () => {
    const block = imageBlock([
      { url: 'https://a.com/1.png' },
      { url: 'https://a.com/2.png' },
      { url: 'https://a.com/3.png' },
    ]);
    const w = mount(ImageBlock, { props: { block, info } });
    expect(w.findAll('.aix-image-block__trigger')).toHaveLength(3);
  });

  it('点击第 2 张缩略图后，ImagePreview 以 index=1 打开', async () => {
    const block = imageBlock([
      { url: 'https://a.com/1.png', alt: '一' },
      { url: 'https://a.com/2.png', alt: '二' },
    ]);
    const w = mount(ImageBlock, { props: { block, info }, attachTo: document.body });
    expect(document.querySelector('.aix-image-preview')).toBeNull();

    await w.findAll('.aix-image-block__trigger')[1]!.trigger('click');
    await w.vm.$nextTick();

    const img = document.querySelector('.aix-image-preview__image') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.alt).toBe('二');
    w.unmount();
  });

  it('images 为空且未设置 state（既非 loading 也非 error）：降级为文案，不渲染空网格', () => {
    const w = mount(ImageBlock, { props: { block: imageBlock([]), info } });
    expect(w.find('.aix-image-block__fallback').exists()).toBe(true);
    expect(w.find('.aix-image-block__grid').exists()).toBe(false);
  });

  // 回归：预览打开期间宿主行被 virtua 回收会连同 Teleport Modal 一起销毁——
  // ImageBlock 须上抛 keep-mounted-change，经 Bubble 转发到 BubbleList 的 keepMounted
  it('打开预览上抛 keep-mounted-change(true)，关闭上抛 false', async () => {
    const w = mount(ImageBlock, {
      props: { block: imageBlock([{ url: 'https://a.com/1.png' }]), info },
      attachTo: document.body,
    });
    await w.find('.aix-image-block__trigger').trigger('click');
    expect(w.emitted('keep-mounted-change')?.[0]).toEqual([true]);
    document.querySelector<HTMLElement>('.aix-image-preview__mask')!.click();
    await w.vm.$nextTick();
    expect(w.emitted('keep-mounted-change')?.[1]).toEqual([false]);
    w.unmount();
  });

  it('点击缩略图后 block 转为 loading（如复用同一 block id 重新生成）：已打开的预览自动收起', async () => {
    const block = imageBlock([
      { url: 'https://a.com/1.png', alt: '一' },
      { url: 'https://a.com/2.png', alt: '二' },
    ]);
    const w = mount(ImageBlock, { props: { block, info }, attachTo: document.body });
    await w.findAll('.aix-image-block__trigger')[0]!.trigger('click');
    await w.vm.$nextTick();
    expect(document.querySelector('.aix-image-preview')).not.toBeNull();

    await w.setProps({ block: imageBlock([], { state: 'loading' }) });
    await w.vm.$nextTick();
    expect(document.querySelector('.aix-image-preview')).toBeNull();
    w.unmount();
  });

  it('点击缩略图打开又关闭预览：焦点回归到被点击的那个缩略图按钮（Safari 焦点归还兜底）', async () => {
    // openAt 显式 focus 被点击的 <button>，弥补 Safari 鼠标点击默认不赋焦点的平台差异——
    // 否则 ImagePreview 打开时 lastActive 捕获到的不是这个按钮，关闭后焦点会归还错位置。
    const block = imageBlock([{ url: 'https://a.com/1.png', alt: '一' }]);
    const w = mount(ImageBlock, { props: { block, info }, attachTo: document.body });
    const trigger = w.find('.aix-image-block__trigger').element as HTMLElement;

    await w.find('.aix-image-block__trigger').trigger('click');
    await w.vm.$nextTick();
    await w.vm.$nextTick();
    expect(document.querySelector('.aix-image-preview')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('button.aix-image-preview__action')!.click();
    await w.vm.$nextTick();
    expect(document.querySelector('.aix-image-preview')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    w.unmount();
  });
});
