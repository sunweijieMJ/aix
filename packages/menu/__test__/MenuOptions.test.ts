import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import type { MenuItemData } from '../src';
import {
  ITEMS,
  cleanupBody,
  click,
  groupList,
  groupTitle,
  isShown,
  mountMenu,
  pointerDown,
  popup,
  subMenuLi,
  subMenuTitle,
} from './helpers';

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  cleanupBody();
  localStorage.clear();
});

describe('flyout 挂载目标', () => {
  it('默认 Teleport 到 body', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await click(subMenuTitle(wrapper.element, '子菜单'));
    const el = popup()!;
    expect(el).not.toBeNull();
    expect(wrapper.element.contains(el)).toBe(false);
  });

  it('popupTeleportTo 为选择器时挂到对应容器', async () => {
    const host = document.createElement('div');
    host.id = 'menu-popup-host';
    document.body.appendChild(host);
    wrapper = mountMenu({ props: { items: ITEMS, popupTeleportTo: '#menu-popup-host' } });
    await click(subMenuTitle(wrapper.element, '子菜单'));
    expect(host.querySelector('.aix-menu-popup')).not.toBeNull();
  });

  it('popupTeleportTo 为 false 时弹层就地渲染在触发项所在 li 内并按 fixed 定位', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, popupTeleportTo: false } });
    await click(subMenuTitle(wrapper.element, '子菜单'));
    const li = subMenuLi(wrapper.element, '子菜单');
    const el = li.querySelector<HTMLElement>('.aix-menu-popup')!;
    expect(el).not.toBeNull();
    expect(el.style.position).toBe('fixed');
    expect(document.body.querySelector(':scope > .aix-menu-popup')).toBeNull();
  });
});

describe('defaultOpenKeys 异步到达', () => {
  it('挂载后才传入 defaultOpenKeys 时按新值应用展开状态', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);

    await wrapper.setProps({ defaultOpenKeys: ['group-b'] });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(false);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
  });

  it('defaultOpenKeys 到达时仍会展开选中项所在的分组', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, selectedKey: 'a1' } });
    await wrapper.setProps({ defaultOpenKeys: ['group-b'] });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
  });

  it('用户手动折叠或展开过分组后，defaultOpenKeys 的变化不再覆盖', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, defaultOpenKeys: ['group-a'] } });
    await click(groupTitle(wrapper.element, '分组 B'));
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);

    await wrapper.setProps({ defaultOpenKeys: [] });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
  });

  it('后到达的 defaultOpenKeys 之后注册的分组不再自动展开', async () => {
    wrapper = mountMenu({ props: { items: [] as MenuItemData[] } });
    await wrapper.setProps({ defaultOpenKeys: ['group-a'], items: ITEMS });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(false);
  });

  it('后到达的 defaultOpenKeys 收起分组时通知外部', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await wrapper.setProps({ defaultOpenKeys: ['group-b'] });
    expect(wrapper.emitted('update:openKeys')?.at(-1)).toEqual([['group-b']]);
    expect(wrapper.emitted('open-change')?.at(-1)).toEqual([['group-b']]);
  });

  it('同内容的新 defaultOpenKeys 数组不再重复应用', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await wrapper.setProps({ defaultOpenKeys: ['group-b'] });
    const emitCount = wrapper.emitted('open-change')!.length;

    await wrapper.setProps({ defaultOpenKeys: ['group-b'] });
    expect(wrapper.emitted('open-change')).toHaveLength(emitCount);
  });

  it('受控 openKeys 下 defaultOpenKeys 的变化被忽略', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, openKeys: ['group-a'] } });
    await wrapper.setProps({ defaultOpenKeys: ['group-b'] });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(false);
    expect(wrapper.emitted('update:openKeys')).toBeUndefined();
  });
});

describe('宽度持久化', () => {
  it('挂载时读回 localStorage 里的宽度并通知外部', () => {
    localStorage.setItem('menu-width', '240');
    wrapper = mountMenu({ props: { resizable: true, widthStorageKey: 'menu-width' } });
    expect(wrapper.element.style.width).toBe('240px');
    expect(wrapper.emitted('update:width')?.[0]).toEqual([240]);
  });

  it('存储值不是数字时忽略，沿用默认宽度', () => {
    localStorage.setItem('menu-width', 'abc');
    wrapper = mountMenu({ props: { resizable: true, widthStorageKey: 'menu-width' } });
    expect(wrapper.element.style.width).toBe('200px');
  });

  it('存储值为空白时忽略，沿用默认宽度', () => {
    localStorage.setItem('menu-width', '   ');
    wrapper = mountMenu({ props: { resizable: true, widthStorageKey: 'menu-width' } });
    expect(wrapper.element.style.width).toBe('200px');
  });

  it('widthStorageKey 异步到达时按新 key 读回，不覆盖已存的宽度', async () => {
    localStorage.setItem('menu-width', '240');
    wrapper = mountMenu({ props: { resizable: true } });
    expect(wrapper.element.style.width).toBe('200px');

    await wrapper.setProps({ widthStorageKey: 'menu-width' });
    expect(wrapper.element.style.width).toBe('240px');
    expect(localStorage.getItem('menu-width')).toBe('240');
  });

  it('拖拽期间不写 localStorage，松手后落盘一次', async () => {
    wrapper = mountMenu({ props: { resizable: true, widthStorageKey: 'menu-width' } });
    await pointerDown(wrapper.find('.aix-menu__resize-handle').element, {
      button: 0,
      clientX: 100,
    });
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 140, bubbles: true }));
    await nextTick();
    expect(wrapper.element.style.width).toBe('240px');
    expect(localStorage.getItem('menu-width')).toBeNull();

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await nextTick();
    expect(localStorage.getItem('menu-width')).toBe('240');
  });

  it('宽度变化后写入 localStorage', async () => {
    wrapper = mountMenu({ props: { resizable: true, widthStorageKey: 'menu-width' } });
    await wrapper.setProps({ width: 260 });
    expect(localStorage.getItem('menu-width')).toBe('260');
  });

  it('未传 widthStorageKey 时不读也不写 localStorage', async () => {
    localStorage.setItem('menu-width', '240');
    wrapper = mountMenu({ props: { resizable: true } });
    expect(wrapper.element.style.width).toBe('200px');
    await wrapper.setProps({ width: 260 });
    expect(localStorage.getItem('menu-width')).toBe('240');
  });
});
