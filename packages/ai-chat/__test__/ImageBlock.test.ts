import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
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

  // 回归：BubbleList 的 keepMounted 计数只在收到 false 时回落。块在预览打开期间被卸载
  // （如 updateBlock 把该块换成别的类型，而宿主消息仍在列表里）时不补发 false，
  // 那一行就永久留在 keepMounted 集合里——消息还在，列表层的 prune 也清不掉它。
  // 注：这两例经真实监听器 prop 观察，而不是 wrapper.emitted()——后者在 unmount() 之后
  // 取到的记录不完整（实测只剩卸载那一次），跨卸载的断言不可靠。
  it('预览打开期间组件被卸载：补发 keep-mounted-change(false)，不让计数悬空', async () => {
    const onKeepMountedChange = vi.fn();
    const w = mount(ImageBlock, {
      props: { block: imageBlock([{ url: 'https://a.com/1.png' }]), info, onKeepMountedChange },
      attachTo: document.body,
    });
    await w.find('.aix-image-block__trigger').trigger('click');
    expect(onKeepMountedChange.mock.calls).toEqual([[true]]);
    w.unmount();
    expect(onKeepMountedChange.mock.calls).toEqual([[true], [false]]);
  });

  it('预览未打开时卸载：不发多余的 keep-mounted-change', () => {
    const onKeepMountedChange = vi.fn();
    const w = mount(ImageBlock, {
      props: { block: imageBlock([{ url: 'https://a.com/1.png' }]), info, onKeepMountedChange },
      attachTo: document.body,
    });
    w.unmount();
    expect(onKeepMountedChange).not.toHaveBeenCalled();
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

  // 防回归：注册表统一透传 typing（boolean | BubbleTypingConfig），收窄为 boolean 会触发 dev 警告
  it('typing 透传配置对象不触发 prop 类型校验警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount(ImageBlock, {
        props: {
          block: imageBlock([{ url: 'https://x.test/a.png' }]),
          info,
          typing: { step: 2, interval: 20 },
        },
      });
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('Invalid prop'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
