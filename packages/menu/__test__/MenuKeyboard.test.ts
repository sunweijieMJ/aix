import type { VueWrapper } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ITEMS,
  cleanupBody,
  dom,
  groupTitle,
  itemButton,
  mountMenu,
  patchOffsetParent,
  subMenuTitle,
} from './helpers';

let wrapper: VueWrapper | undefined;
let restoreOffsetParent: () => void;

beforeAll(() => {
  restoreOffsetParent = patchOffsetParent();
});

afterAll(() => {
  restoreOffsetParent();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  cleanupBody();
});

function pressOnList(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  wrapper!.find('.aix-menu__list').element.dispatchEvent(event);
  return event;
}

describe('Menu 根列表键盘导航', () => {
  it('无焦点时 ArrowDown 聚焦第一个可聚焦控件，ArrowUp 聚焦最后一个', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    (document.activeElement as HTMLElement | null)?.blur();

    pressOnList('ArrowDown');
    expect(document.activeElement).toBe(itemButton(wrapper.element, '首页'));

    (document.activeElement as HTMLElement).blur();
    pressOnList('ArrowUp');
    expect(document.activeElement).toBe(subMenuTitle(wrapper.element, '子菜单'));
  });

  it('ArrowDown 依次经过叶子、分组标题、SubMenu 触发器并跳过禁用项', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const root = wrapper.element;
    const order = [
      itemButton(root, '首页'),
      groupTitle(root, '分组 A'),
      itemButton(root, 'A1'),
      groupTitle(root, '嵌套分组'),
      itemButton(root, 'A3'),
      groupTitle(root, '分组 B'),
      itemButton(root, 'B1'),
      subMenuTitle(root, '子菜单'),
    ];

    order[0]!.focus();
    for (const expected of order.slice(1)) {
      pressOnList('ArrowDown');
      expect(document.activeElement).toBe(expected);
    }
  });

  it('首尾循环：末项 ArrowDown 回到首项，首项 ArrowUp 跳到末项', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const first = itemButton(wrapper.element, '首页');
    const last = subMenuTitle(wrapper.element, '子菜单');

    last.focus();
    pressOnList('ArrowDown');
    expect(document.activeElement).toBe(first);

    pressOnList('ArrowUp');
    expect(document.activeElement).toBe(last);
  });

  it('Home / End 直接跳到首尾', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    itemButton(wrapper.element, 'A1').focus();

    pressOnList('End');
    expect(document.activeElement).toBe(subMenuTitle(wrapper.element, '子菜单'));

    pressOnList('Home');
    expect(document.activeElement).toBe(itemButton(wrapper.element, '首页'));
  });

  it('折叠分组内的项不参与焦点移动', () => {
    wrapper = mountMenu({ props: { items: ITEMS, defaultOpenKeys: ['group-b'] } });
    groupTitle(wrapper.element, '分组 A').focus();

    pressOnList('ArrowDown');
    expect(document.activeElement).toBe(groupTitle(wrapper.element, '分组 B'));
  });

  it('方向键事件被消费（preventDefault），其他按键不处理', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    itemButton(wrapper.element, '首页').focus();

    expect(pressOnList('ArrowDown').defaultPrevented).toBe(true);
    expect(pressOnList('Tab').defaultPrevented).toBe(false);
    expect(pressOnList('Enter').defaultPrevented).toBe(false);
  });

  it('在控件上按键时事件冒泡到列表同样生效', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const home = itemButton(wrapper.element, '首页');
    home.focus();

    await dom(home).trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(groupTitle(wrapper.element, '分组 A'));
  });
});
