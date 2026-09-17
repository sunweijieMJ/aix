import { mount, type VueWrapper } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { Menu, MenuGroup, MenuItem, SubMenu, type MenuSelectPayload } from '../src';
import {
  ITEMS,
  cleanupBody,
  click,
  dom,
  groupList,
  groupTitle,
  isShown,
  itemButton,
  itemLi,
  mountMenu,
  patchOffsetParent,
  pointerDown,
  popup,
  popups,
  subMenuLi,
  subMenuTitle,
} from './helpers';

const SHOW_DELAY = 100;
const HIDE_DELAY = 150;

let wrapper: VueWrapper | undefined;
let restoreOffsetParent: () => void;

beforeAll(() => {
  restoreOffsetParent = patchOffsetParent();
});

afterAll(() => {
  restoreOffsetParent();
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  cleanupBody();
  vi.useRealTimers();
});

async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await nextTick();
}

async function hoverOpen(root: ParentNode, label: string) {
  await dom(subMenuLi(root, label)).trigger('mouseenter');
  await advance(SHOW_DELAY);
}

describe('SubMenu 悬停展开', () => {
  it('mouseenter 触发器 100ms 后弹层 Teleport 到 body，触发器 aria 状态同步', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const li = subMenuLi(wrapper.element, '子菜单');
    const title = subMenuTitle(wrapper.element, '子菜单');

    await dom(li).trigger('mouseenter');
    await advance(SHOW_DELAY - 1);
    expect(popup()).toBeNull();

    await advance(1);
    const el = popup()!;
    expect(el).not.toBeNull();
    expect(document.body.contains(el)).toBe(true);
    expect(wrapper.element.contains(el)).toBe(false);
    expect(el.classList).toContain('aix-menu-popup--gray');
    expect(el.querySelector('ul.aix-menu-popup__list')).not.toBeNull();
    expect(title.getAttribute('aria-expanded')).toBe('true');
    expect(title.getAttribute('aria-controls')).toBe(el.id);
    expect(li.classList).toContain('aix-menu-submenu--open');
  });

  it('弹层内的叶子带 popup 修饰类且层级为 0', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');

    const li = itemLi(popup()!, 'S1');
    expect(li.classList).toContain('aix-menu-item--popup');
    expect(li.classList).toContain('aix-menu-item--level-0');
    expect(wrapper.element.querySelector('.aix-menu-item--popup')).toBeNull();
  });

  it('mouseleave 触发器 150ms 后关闭弹层', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');

    await dom(subMenuLi(wrapper.element, '子菜单')).trigger('mouseleave');
    await advance(HIDE_DELAY - 1);
    expect(popup()).not.toBeNull();

    await advance(1);
    expect(popup()).toBeNull();
    expect(subMenuTitle(wrapper.element, '子菜单').getAttribute('aria-expanded')).toBe('false');
  });

  it('离开触发器前进入弹层会取消关闭，离开弹层后再关闭', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');

    await dom(subMenuLi(wrapper.element, '子菜单')).trigger('mouseleave');
    await dom(popup()!).trigger('mouseenter');
    await advance(HIDE_DELAY * 2);
    expect(popup()).not.toBeNull();

    await dom(popup()!).trigger('mouseleave');
    await advance(HIDE_DELAY);
    expect(popup()).toBeNull();
  });

  it('展开前离开触发器会取消展开', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const li = subMenuLi(wrapper.element, '子菜单');

    await dom(li).trigger('mouseenter');
    await advance(SHOW_DELAY / 2);
    await dom(li).trigger('mouseleave');
    await advance(SHOW_DELAY);
    expect(popup()).toBeNull();
  });

  it('disabled 的 SubMenu 悬停与点击均不展开', async () => {
    wrapper = mountMenu({
      props: {
        items: [
          { key: 'sub', label: '禁用', disabled: true, children: [{ key: 'c', label: 'C' }] },
        ],
      },
    });
    const li = subMenuLi(wrapper.element, '禁用');
    const title = subMenuTitle(wrapper.element, '禁用');
    expect(title.disabled).toBe(true);
    expect(li.classList).toContain('aix-menu-submenu--disabled');

    await dom(li).trigger('mouseenter');
    await advance(SHOW_DELAY);
    expect(popup()).toBeNull();

    // 走 dispatchEvent：jsdom 对 disabled 控件的 HTMLElement.click() 不派发事件，打不到组件内的守卫
    await click(title);
    expect(popup()).toBeNull();
  });

  it('卸载 Menu 时弹层随之移除', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    expect(popup()).not.toBeNull();

    wrapper.unmount();
    wrapper = undefined;
    expect(popup()).toBeNull();
  });
});

describe('SubMenu 点击', () => {
  it('点击触发器立即展开，再次点击保持展开', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const title = subMenuTitle(wrapper.element, '子菜单');

    await click(title);
    expect(popup()).not.toBeNull();

    await click(title);
    expect(popup()).not.toBeNull();
  });

  it('键盘激活触发器（detail 为 0）展开并聚焦弹层第一项', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await click(subMenuTitle(wrapper.element, '子菜单'), 0);
    await nextTick();

    expect(document.activeElement).toBe(itemButton(popup()!, 'S1'));
  });

  it('点击弹层内叶子触发 select 并关闭弹层，触发器带 active 修饰', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');

    itemButton(popup()!, 'S2').click();
    await nextTick();

    const [payload] = wrapper.emitted<[MenuSelectPayload]>('select')![0]!;
    expect(payload).toEqual({ key: 's2', keyPath: ['sub', 's2'], data: ITEMS[4]!.children![1] });
    expect(popup()).toBeNull();
    expect(subMenuLi(wrapper.element, '子菜单').classList).toContain('aix-menu-submenu--active');
  });

  it('选中项位于弹层内时触发器在弹层关闭状态下仍保持 active', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, selectedKey: 'n1' } });
    expect(subMenuLi(wrapper.element, '子菜单').classList).toContain('aix-menu-submenu--active');

    await wrapper.setProps({ selectedKey: 'home' });
    expect(subMenuLi(wrapper.element, '子菜单').classList).not.toContain(
      'aix-menu-submenu--active',
    );
  });
});

describe('SubMenu 弹层样式', () => {
  it('弹层带主题修饰类，子项含图标时带 with-icon 修饰', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, theme: 'white' } });
    await hoverOpen(wrapper.element, '子菜单');

    expect(popup()!.classList).toContain('aix-menu-popup--white');
    expect(popup()!.classList).toContain('aix-menu-popup--with-icon');
  });

  it('子项均无图标时不带 with-icon 修饰', async () => {
    wrapper = mountMenu({
      props: { items: [{ key: 'sub', label: '子菜单', children: [{ key: 'c', label: 'C' }] }] },
    });
    await hoverOpen(wrapper.element, '子菜单');
    expect(popup()!.classList).not.toContain('aix-menu-popup--with-icon');
  });

  it('Menu 的 popupClass 与 SubMenu 的 popupClass 同时追加到弹层', async () => {
    wrapper = mount(Menu, {
      attachTo: document.body,
      props: { popupClass: 'from-menu' },
      slots: {
        default: () =>
          h(
            SubMenu,
            { itemKey: 'sub', label: '子菜单', popupClass: 'from-sub', popupWithIcon: true },
            () => [h(MenuItem, { itemKey: 'c', label: 'C' })],
          ),
      },
    });
    await hoverOpen(wrapper.element, '子菜单');

    expect(popup()!.classList).toContain('from-menu');
    expect(popup()!.classList).toContain('from-sub');
    expect(popup()!.classList).toContain('aix-menu-popup--with-icon');
  });

  it('popupMaxVisible 写入弹层列表的 CSS 变量，默认 9', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    const list = popup()!.querySelector<HTMLElement>('.aix-menu-popup__list')!;
    expect(list.style.getPropertyValue('--aix-menu-popup-max-visible')).toBe('9');

    await wrapper.setProps({ popupMaxVisible: 5 });
    expect(list.style.getPropertyValue('--aix-menu-popup-max-visible')).toBe('5');
  });

  it('后打开的弹层 z-index 高于先打开的', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    const outer = Number(popup()!.style.zIndex);
    expect(Number.isFinite(outer)).toBe(true);

    await hoverOpen(popup()!, '二级子菜单');
    const [first, second] = popups().map((el) => Number(el.style.zIndex));
    expect(second).toBeGreaterThan(first!);
  });
});

describe('SubMenu 键盘', () => {
  it('触发器上按 ArrowRight 展开并聚焦弹层第一项', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const title = subMenuTitle(wrapper.element, '子菜单');
    title.focus();

    await dom(title).trigger('keydown', { key: 'ArrowRight' });
    await nextTick();
    expect(popup()).not.toBeNull();
    expect(document.activeElement).toBe(itemButton(popup()!, 'S1'));
  });

  it('弹层内按 ArrowLeft 关闭并回焦触发器', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const title = subMenuTitle(wrapper.element, '子菜单');
    await dom(title).trigger('keydown', { key: 'ArrowRight' });
    await nextTick();

    await dom(itemButton(popup()!, 'S1')).trigger('keydown', { key: 'ArrowLeft' });
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(title);
  });

  it('弹层内按 Escape 关闭并回焦触发器', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const title = subMenuTitle(wrapper.element, '子菜单');
    await dom(title).trigger('keydown', { key: 'ArrowRight' });
    await nextTick();

    await dom(itemButton(popup()!, 'S2')).trigger('keydown', { key: 'Escape' });
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(title);
  });

  it('弹层内 ArrowDown / ArrowUp 在子项间循环移动焦点', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await dom(subMenuTitle(wrapper.element, '子菜单')).trigger('keydown', { key: 'ArrowRight' });
    await nextTick();
    const el = popup()!;
    const s1 = itemButton(el, 'S1');
    const s2 = itemButton(el, 'S2');
    const nested = subMenuTitle(el, '二级子菜单');

    await dom(s1).trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(s2);
    await dom(s2).trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(nested);
    await dom(nested).trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(s1);
    await dom(s1).trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(nested);
  });

  it('触发器已展开时按 Escape 关闭弹层', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const title = subMenuTitle(wrapper.element, '子菜单');
    await click(title);
    expect(popup()).not.toBeNull();

    await dom(title).trigger('keydown', { key: 'Escape' });
    expect(popup()).toBeNull();
  });

  it('焦点移出弹层到外部元素时关闭，移到弹层内部时保持', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    const el = popup()!;

    await dom(el).trigger('focusout', { relatedTarget: itemButton(el, 'S2') });
    expect(popup()).not.toBeNull();

    await dom(el).trigger('focusout', { relatedTarget: itemButton(wrapper.element, '首页') });
    expect(popup()).toBeNull();
  });
});

describe('SubMenu 多级嵌套', () => {
  it('弹层内的 SubMenu 带 popup 修饰，悬停后打开第二层弹层', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    const nestedLi = subMenuLi(popup()!, '二级子菜单');
    expect(nestedLi.classList).toContain('aix-menu-submenu--popup');

    await hoverOpen(popup()!, '二级子菜单');
    expect(popups()).toHaveLength(2);
    expect(itemButton(popups()[1]!, 'N1')).toBeTruthy();
  });

  it('停留在第二层弹层时第一层不会被关闭', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    await dom(subMenuLi(wrapper.element, '子菜单')).trigger('mouseleave');
    await dom(popup()!).trigger('mouseenter');
    await hoverOpen(popup()!, '二级子菜单');

    await dom(popups()[0]!).trigger('mouseleave');
    await dom(popups()[1]!).trigger('mouseenter');
    await advance(HIDE_DELAY * 2);
    expect(popups()).toHaveLength(2);
  });

  it('离开第二层弹层后两层依次全部关闭', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    await hoverOpen(popup()!, '二级子菜单');

    await dom(popups()[1]!).trigger('mouseleave');
    await advance(HIDE_DELAY);
    expect(popups()).toHaveLength(0);
  });

  it('点击第二层弹层的叶子关闭所有层级，keyPath 含两级 SubMenu', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    await hoverOpen(popup()!, '二级子菜单');

    itemButton(popups()[1]!, 'N1').click();
    await nextTick();

    const [payload] = wrapper.emitted<[MenuSelectPayload]>('select')![0]!;
    expect(payload.keyPath).toEqual(['sub', 'sub-nested', 'n1']);
    expect(popups()).toHaveLength(0);
    expect(subMenuLi(wrapper.element, '子菜单').classList).toContain('aix-menu-submenu--active');
  });

  it('第二层弹层内按 Escape 只关闭第二层并回焦其触发器', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    const nestedTitle = subMenuTitle(popup()!, '二级子菜单');
    await dom(nestedTitle).trigger('keydown', { key: 'ArrowRight' });
    await nextTick();
    expect(popups()).toHaveLength(2);
    expect(document.activeElement).toBe(itemButton(popups()[1]!, 'N1'));

    await dom(itemButton(popups()[1]!, 'N1')).trigger('keydown', { key: 'Escape' });
    expect(popups()).toHaveLength(1);
    expect(document.activeElement).toBe(nestedTitle);
  });

  it('焦点从第一层弹层移入第二层弹层时第一层保持打开', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    await hoverOpen(popup()!, '二级子菜单');

    await dom(popups()[0]!).trigger('focusout', { relatedTarget: itemButton(popups()[1]!, 'N1') });
    expect(popups()).toHaveLength(2);
  });

  it('指针离开弹层内嵌套 SubMenu 的触发项只关闭第二层，第一层保持打开', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    await hoverOpen(popup()!, '二级子菜单');
    expect(popups()).toHaveLength(2);

    await dom(subMenuLi(popups()[0]!, '二级子菜单')).trigger('mouseleave');
    await advance(HIDE_DELAY * 2);
    expect(popups()).toHaveLength(1);
    expect(subMenuTitle(popups()[0]!, '二级子菜单').getAttribute('aria-expanded')).toBe('false');
  });

  it('在嵌套 SubMenu 触发项上快速进出不影响第一层弹层', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    const nestedLi = subMenuLi(popup()!, '二级子菜单');

    await dom(nestedLi).trigger('mouseenter');
    await advance(SHOW_DELAY / 2);
    await dom(nestedLi).trigger('mouseleave');
    await advance(HIDE_DELAY * 2);
    expect(popups()).toHaveLength(1);
    expect(itemButton(popups()[0]!, 'S1')).toBeTruthy();
  });
});

describe('SubMenu 点击外部关闭', () => {
  it('弹层打开时在 body 空白处 pointerdown 立即关闭', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');

    await pointerDown(document.body, {});
    expect(popup()).toBeNull();
    expect(subMenuTitle(wrapper.element, '子菜单').getAttribute('aria-expanded')).toBe('false');
  });

  it('在弹层内或触发器上 pointerdown 不关闭', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');

    await pointerDown(itemButton(popup()!, 'S1'), {});
    expect(popup()).not.toBeNull();

    await pointerDown(subMenuTitle(wrapper.element, '子菜单'), {});
    expect(popup()).not.toBeNull();
  });

  it('点击外部关闭后再次打开，点击外部仍然关闭', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    await pointerDown(document.body, {});
    expect(popup()).toBeNull();

    await hoverOpen(wrapper.element, '子菜单');
    expect(popup()).not.toBeNull();
    await pointerDown(document.body, {});
    expect(popup()).toBeNull();
  });

  it('多级场景下在子级弹层内 pointerdown 不关闭父级，点击外部则全部关闭', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await hoverOpen(wrapper.element, '子菜单');
    await hoverOpen(popup()!, '二级子菜单');
    expect(popups()).toHaveLength(2);

    await pointerDown(itemButton(popups()[1]!, 'N1'), {});
    expect(popups()).toHaveLength(2);

    await pointerDown(subMenuTitle(popups()[0]!, '二级子菜单'), {});
    expect(popups()).toHaveLength(2);

    await pointerDown(document.body, {});
    expect(popups()).toHaveLength(0);
  });
});

describe('SubMenu 复合组件写法祖先高亮', () => {
  function mountNested(selectedKey: string) {
    return mount(Menu, {
      attachTo: document.body,
      props: { selectedKey },
      slots: {
        default: () => [
          h(SubMenu, { itemKey: 's1', label: 'S1' }, () => [
            h(SubMenu, { itemKey: 's2', label: 'S2' }, () => [
              h(MenuItem, { itemKey: 'leaf', label: 'Leaf' }),
            ]),
          ]),
          h(SubMenu, { itemKey: 'other', label: 'Other' }, () => [
            h(MenuGroup, { groupKey: 'og', title: 'OG' }, () => [
              h(MenuItem, { itemKey: 'other-leaf', label: 'OtherLeaf' }),
            ]),
          ]),
        ],
      },
    });
  }

  it('选中项位于两层 SubMenu 内时，未打开弹层的祖先触发器带 active 修饰', async () => {
    wrapper = mountNested('leaf');
    expect(subMenuLi(wrapper.element, 'S1').classList).toContain('aix-menu-submenu--active');
    expect(subMenuLi(wrapper.element, 'Other').classList).not.toContain('aix-menu-submenu--active');

    await hoverOpen(wrapper.element, 'S1');
    expect(subMenuLi(popup()!, 'S2').classList).toContain('aix-menu-submenu--active');
  });

  it('选中项位于 SubMenu 内的 MenuGroup 时同样高亮祖先触发器', () => {
    wrapper = mountNested('other-leaf');
    expect(subMenuLi(wrapper.element, 'Other').classList).toContain('aix-menu-submenu--active');
    expect(subMenuLi(wrapper.element, 'S1').classList).not.toContain('aix-menu-submenu--active');
  });

  it('外部切换 selectedKey 到另一子菜单下的叶子后高亮随之切换', async () => {
    wrapper = mountNested('leaf');
    await wrapper.setProps({ selectedKey: 'other-leaf' });

    expect(subMenuLi(wrapper.element, 'S1').classList).not.toContain('aix-menu-submenu--active');
    expect(subMenuLi(wrapper.element, 'Other').classList).toContain('aix-menu-submenu--active');
  });

  it('SubMenu 卸载后选中其后代 key 时所在分组保持折叠', async () => {
    const Host = defineComponent({
      props: { show: Boolean, selectedKey: String },
      setup: (hostProps) => () =>
        h(Menu, { defaultOpenKeys: [], selectedKey: hostProps.selectedKey }, () => [
          h(MenuGroup, { groupKey: 'g', title: 'G' }, () => [
            hostProps.show
              ? h(SubMenu, { itemKey: 'sub', label: 'Sub' }, () => [
                  h(MenuItem, { itemKey: 'leaf', label: 'Leaf' }),
                ])
              : null,
          ]),
        ]),
    });
    const host = mount(Host, { attachTo: document.body, props: { show: true } });
    wrapper = host;
    expect(isShown(groupList(host.element, 'G'))).toBe(false);

    await host.setProps({ selectedKey: 'leaf' });
    await nextTick();
    expect(isShown(groupList(host.element, 'G'))).toBe(true);

    groupTitle(host.element, 'G').click();
    await nextTick();
    expect(isShown(groupList(host.element, 'G'))).toBe(false);

    await host.setProps({ show: false, selectedKey: 'none' });
    await host.setProps({ selectedKey: 'leaf' });
    await nextTick();
    expect(isShown(groupList(host.element, 'G'))).toBe(false);
  });
});

describe('SubMenu 登记随 props 与插槽更新', () => {
  it('运行时改 itemKey 后祖先高亮跟随新 key', async () => {
    const Host = defineComponent({
      props: { itemKey: { type: String, default: 'sub-a' } },
      setup: (hostProps) => () =>
        h(Menu, { selectedKey: 'leaf' }, () => [
          h(SubMenu, { itemKey: hostProps.itemKey, label: 'Sub' }, () => [
            h(MenuItem, { itemKey: 'leaf', label: 'Leaf' }),
          ]),
        ]),
    });
    const host = mount(Host, { attachTo: document.body });
    wrapper = host;
    expect(subMenuLi(host.element, 'Sub').classList).toContain('aix-menu-submenu--active');

    await host.setProps({ itemKey: 'sub-b' });
    expect(subMenuLi(host.element, 'Sub').classList).toContain('aix-menu-submenu--active');
  });

  it('插槽内容变化后后代 key 登记随之更新', async () => {
    const Host = defineComponent({
      props: { leafKey: { type: String, default: 'leaf-a' } },
      setup: (hostProps) => () =>
        h(Menu, { selectedKey: 'leaf-b' }, () => [
          h(SubMenu, { itemKey: 'sub', label: 'Sub' }, () => [
            h(MenuItem, { itemKey: hostProps.leafKey, label: 'Leaf' }),
          ]),
        ]),
    });
    const host = mount(Host, { attachTo: document.body });
    wrapper = host;
    expect(subMenuLi(host.element, 'Sub').classList).not.toContain('aix-menu-submenu--active');

    await host.setProps({ leafKey: 'leaf-b' });
    expect(subMenuLi(host.element, 'Sub').classList).toContain('aix-menu-submenu--active');
  });
});
