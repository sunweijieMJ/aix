import { createLocale, LOCALE_INJECTION_KEY } from '@aix/hooks';
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import ImagePreview from '../src/components/ImagePreview.vue';
import type { ImageItem } from '../src/types';

const IMAGES: ImageItem[] = [
  { url: 'https://a.com/1.png', alt: '图一' },
  { url: 'https://a.com/2.png', alt: '图二' },
  { url: 'https://a.com/3.png', alt: '图三' },
];

const mountPreview = (props: Record<string, unknown> = {}) => {
  const loc = createLocale('zh-CN');
  return mount(ImagePreview, {
    props: { images: IMAGES, open: true, index: 0, ...props },
    attachTo: document.body,
    global: { provide: { [LOCALE_INJECTION_KEY]: loc.localeContext } },
  });
};

describe('ImagePreview（图片预览 Modal）', () => {
  it('open=false 时不渲染 dialog', () => {
    const w = mountPreview({ open: false });
    expect(document.querySelector('.aix-image-preview')).toBeNull();
    w.unmount();
  });

  it('open=true 时渲染 dialog，展示当前下标对应的图片', () => {
    const w = mountPreview({ index: 1 });
    const img = document.querySelector('.aix-image-preview__image') as HTMLImageElement;
    expect(img.src).toBe('https://a.com/2.png');
    expect(img.alt).toBe('图二');
    w.unmount();
  });

  it('点击遮罩层触发 close 与 update:open(false)', async () => {
    const w = mountPreview();
    document.querySelector<HTMLElement>('.aix-image-preview__mask')!.click();
    await nextTick();
    expect(w.emitted('close')).toHaveLength(1);
    expect(w.emitted('update:open')?.[0]).toEqual([false]);
    w.unmount();
  });

  it('Esc 键触发 close', async () => {
    const w = mountPreview();
    await document
      .querySelector('.aix-image-preview')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });

  it('多图时右箭头切下一张，emit update:index；到最后一张禁用', async () => {
    const w = mountPreview({ index: 0 });
    const nextBtn = document.querySelector<HTMLButtonElement>('.aix-image-preview__nav-next')!;
    nextBtn.click();
    await nextTick();
    expect(w.emitted('update:index')?.[0]).toEqual([1]);
    // 非受控/受控由父组件决定，本用例走非受控（未再传 index prop 更新），故手动模拟父组件回填
    await w.setProps({ index: 2 });
    expect(
      document.querySelector<HTMLButtonElement>('.aix-image-preview__nav-next')!.disabled,
    ).toBe(true);
    w.unmount();
  });

  it('第一张时左箭头禁用', () => {
    const w = mountPreview({ index: 0 });
    expect(
      document.querySelector<HTMLButtonElement>('.aix-image-preview__nav-prev')!.disabled,
    ).toBe(true);
    w.unmount();
  });

  it('单图时不渲染左右箭头与计数器', () => {
    const w = mountPreview({ images: [IMAGES[0]!], index: 0 });
    expect(document.querySelector('.aix-image-preview__nav-prev')).toBeNull();
    expect(document.querySelector('.aix-image-preview__counter')).toBeNull();
    w.unmount();
  });

  it('下载按钮为 <a> 且携带 href 与 download 属性', () => {
    const w = mountPreview({ index: 0 });
    const a = document.querySelector<HTMLAnchorElement>('.aix-image-preview__action[href]')!;
    expect(a.getAttribute('href')).toBe('https://a.com/1.png');
    expect(a.hasAttribute('download')).toBe(true);
    w.unmount();
  });

  it('打开时焦点移入对话框，关闭时焦点归还触发元素', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const w = mountPreview({ open: false });
    await w.setProps({ open: true });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(document.querySelector('.aix-image-preview'));

    await w.setProps({ open: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger);

    w.unmount();
    trigger.remove();
  });

  it('焦点陷阱：末个可聚焦元素上按 Tab 循环回首个；首个元素上按 Shift+Tab 循环到末个', async () => {
    const w = mountPreview({ index: 0 }); // 多图：下载/关闭/prev/next 共 4 个可聚焦元素
    const dialog = document.querySelector<HTMLElement>('.aix-image-preview')!;
    const focusables = dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    last.focus();
    expect(document.activeElement).toBe(last);
    await dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    first.focus();
    expect(document.activeElement).toBe(first);
    await dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(last);

    w.unmount();
  });

  // 回归：连点「下一张」到末张时按钮变 disabled，浏览器把焦点抛回 body——
  // dialog 根上的 keydown（Esc/←/→/Tab）全部失效，Esc 关不掉、焦点陷阱破口
  it('导航到边界使按钮 disabled 后，焦点移回对话框内可聚焦处，键盘不失效', async () => {
    const w = mountPreview({ index: undefined }); // 非受控 index，点击可自增
    const nextBtn = document.querySelector<HTMLButtonElement>('.aix-image-preview__nav-next')!;
    nextBtn.focus();
    nextBtn.click(); // 0 → 1
    await nextTick();
    nextBtn.click(); // 1 → 2（末张）→ 按钮 disabled
    await nextTick();
    await nextTick();
    const ae = document.activeElement as HTMLElement;
    expect((ae as HTMLButtonElement).disabled ?? false).toBe(false);
    expect(document.querySelector('.aix-image-preview')!.contains(ae)).toBe(true);
    w.unmount();
  });
});
