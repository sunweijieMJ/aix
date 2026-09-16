import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { cleanupBody, mountMenu, pointerDown } from './helpers';

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  cleanupBody();
});

function handle() {
  return wrapper!.find('.aix-menu__resize-handle');
}

function movePointer(clientX: number, init: PointerEventInit = {}) {
  document.dispatchEvent(new PointerEvent('pointermove', { clientX, bubbles: true, ...init }));
  return nextTick();
}

function releasePointer() {
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  return nextTick();
}

describe('Menu 宽度', () => {
  it('未传 width 且非 resizable 时不设置内联宽度，也不渲染把手', () => {
    wrapper = mountMenu();
    expect(wrapper.attributes('style')).toBeUndefined();
    expect(handle().exists()).toBe(false);
  });

  it('传入 width 时根节点带内联宽度', async () => {
    wrapper = mountMenu({ props: { width: 240 } });
    expect(wrapper.element.style.width).toBe('240px');
    expect(handle().exists()).toBe(false);

    await wrapper.setProps({ width: 260 });
    expect(wrapper.element.style.width).toBe('260px');
  });

  it('resizable 时渲染 separator 把手并按默认 200px 设置宽度', () => {
    wrapper = mountMenu({ props: { resizable: true } });
    expect(wrapper.classes()).toContain('aix-menu--resizable');
    expect(wrapper.element.style.width).toBe('200px');

    const h = handle();
    expect(h.attributes('role')).toBe('separator');
    expect(h.attributes('aria-orientation')).toBe('vertical');
    expect(h.attributes('tabindex')).toBe('0');
    expect(h.attributes('aria-valuenow')).toBe('200');
    expect(h.attributes('aria-valuemin')).toBe('150');
    expect(h.attributes('aria-valuemax')).toBe('300');
  });

  it('aria-valuemin / aria-valuemax 跟随 minWidth / maxWidth', () => {
    wrapper = mountMenu({ props: { resizable: true, minWidth: 100, maxWidth: 500, width: 320 } });
    const h = handle();
    expect(h.attributes('aria-valuenow')).toBe('320');
    expect(h.attributes('aria-valuemin')).toBe('100');
    expect(h.attributes('aria-valuemax')).toBe('500');
  });
});

describe('Menu 拖拽调宽', () => {
  it('pointerdown 进入拖拽态：body 光标 col-resize、禁选文本、根节点带 dragging 修饰', async () => {
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 0, clientX: 100 });

    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');
    expect(wrapper.classes()).toContain('aix-menu--dragging');
  });

  it('拖拽中宽度 = 起始宽度 + 水平位移，并触发 update:width', async () => {
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 0, clientX: 100 });

    await movePointer(150);
    expect(wrapper.element.style.width).toBe('250px');
    expect(handle().attributes('aria-valuenow')).toBe('250');

    await movePointer(80);
    expect(wrapper.element.style.width).toBe('180px');
    expect(wrapper.emitted('update:width')).toEqual([[250], [180]]);
  });

  it('拖拽宽度被夹在 minWidth 与 maxWidth 之间', async () => {
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 0, clientX: 0 });

    await movePointer(1000);
    expect(wrapper.element.style.width).toBe('300px');

    await movePointer(-1000);
    expect(wrapper.element.style.width).toBe('150px');
  });

  it('pointerup 后还原 body 样式并停止响应 pointermove', async () => {
    document.body.style.cursor = 'pointer';
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 0, clientX: 100 });
    await movePointer(120);
    await releasePointer();

    expect(document.body.style.cursor).toBe('pointer');
    expect(document.body.style.userSelect).toBe('');
    expect(wrapper.classes()).not.toContain('aix-menu--dragging');

    await movePointer(200);
    expect(wrapper.element.style.width).toBe('220px');
    expect(wrapper.emitted('update:width')).toEqual([[220]]);
  });

  it('pointercancel 同样结束拖拽', async () => {
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 0, clientX: 100 });
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    await nextTick();

    expect(wrapper.classes()).not.toContain('aix-menu--dragging');
    expect(document.body.style.cursor).toBe('');
  });

  it('非主键 pointerdown 不进入拖拽', async () => {
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 2, clientX: 100 });

    expect(wrapper.classes()).not.toContain('aix-menu--dragging');
    await movePointer(200);
    expect(wrapper.element.style.width).toBe('200px');
  });

  it('pointerdown 时把手捕获该指针', async () => {
    wrapper = mountMenu({ props: { resizable: true } });
    const setPointerCapture = vi.fn();
    Object.assign(handle().element, { setPointerCapture });

    await pointerDown(handle().element, { button: 0, clientX: 100, pointerId: 7 });
    expect(setPointerCapture).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('鼠标 pointermove 的 buttons 为 0 时视为释放：结束拖拽、还原 body 样式、后续移动不改宽', async () => {
    document.body.style.cursor = 'pointer';
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 0, clientX: 100 });

    await movePointer(150, { pointerType: 'mouse', buttons: 1 });
    expect(wrapper.element.style.width).toBe('250px');

    await movePointer(170, { pointerType: 'mouse', buttons: 0 });
    expect(wrapper.element.style.width).toBe('250px');
    expect(wrapper.classes()).not.toContain('aix-menu--dragging');
    expect(document.body.style.cursor).toBe('pointer');
    expect(document.body.style.userSelect).toBe('');

    await movePointer(200, { pointerType: 'mouse', buttons: 1 });
    expect(wrapper.element.style.width).toBe('250px');
    expect(wrapper.emitted('update:width')).toEqual([[250]]);
  });

  it('非鼠标指针的 buttons 为 0 时仍按拖拽处理', async () => {
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 0, clientX: 100 });

    await movePointer(150, { pointerType: 'touch', buttons: 0 });
    expect(wrapper.element.style.width).toBe('250px');
    expect(wrapper.classes()).toContain('aix-menu--dragging');
  });

  it('拖拽中卸载组件时还原 body 样式', async () => {
    document.body.style.cursor = 'pointer';
    wrapper = mountMenu({ props: { resizable: true } });
    await pointerDown(handle().element, { button: 0, clientX: 100 });
    expect(document.body.style.cursor).toBe('col-resize');

    wrapper.unmount();
    wrapper = undefined;
    expect(document.body.style.cursor).toBe('pointer');
    expect(document.body.style.userSelect).toBe('');
  });

  it('受控 width 下拖拽只触发 update:width，宽度跟随 prop', async () => {
    wrapper = mountMenu({ props: { resizable: true, width: 200 } });
    await pointerDown(handle().element, { button: 0, clientX: 100 });
    await movePointer(150);

    expect(wrapper.emitted('update:width')).toEqual([[250]]);
    expect(wrapper.element.style.width).toBe('200px');

    await wrapper.setProps({ width: 250 });
    expect(wrapper.element.style.width).toBe('250px');
  });
});

describe('Menu 把手键盘调宽', () => {
  it('ArrowRight / ArrowLeft 每次调整 10px 并触发 update:width', async () => {
    wrapper = mountMenu({ props: { resizable: true } });

    await handle().trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.element.style.width).toBe('210px');

    await handle().trigger('keydown', { key: 'ArrowLeft' });
    await handle().trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.element.style.width).toBe('190px');
    expect(wrapper.emitted('update:width')).toEqual([[210], [200], [190]]);
  });

  it('键盘调宽同样受 minWidth / maxWidth 约束', async () => {
    wrapper = mountMenu({ props: { resizable: true, minWidth: 195, maxWidth: 205 } });

    await handle().trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.element.style.width).toBe('205px');

    await handle().trigger('keydown', { key: 'ArrowLeft' });
    await handle().trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.element.style.width).toBe('195px');
  });

  it('其他按键不改变宽度', async () => {
    wrapper = mountMenu({ props: { resizable: true } });
    await handle().trigger('keydown', { key: 'ArrowUp' });
    await handle().trigger('keydown', { key: 'Enter' });

    expect(wrapper.element.style.width).toBe('200px');
    expect(wrapper.emitted('update:width')).toBeUndefined();
  });
});
