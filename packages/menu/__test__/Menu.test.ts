import { createLocale } from '@aix/hooks';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, toRaw, type PropType } from 'vue';
import MenuPlugin, {
  Menu,
  MenuGroup,
  MenuItem,
  SubMenu,
  menuEnUS,
  menuLocale,
  menuZhCN,
  type MenuItemData,
  type MenuItemSlotProps,
  type MenuSelectPayload,
} from '../src';
import {
  IconStub,
  ITEMS,
  cleanupBody,
  click,
  groupLi,
  groupList,
  groupTitle,
  isShown,
  itemButton,
  itemLi,
  mountMenu,
  subMenuLi,
  subMenuTitle,
} from './helpers';

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  cleanupBody();
});

describe('Menu 渲染', () => {
  it('根节点为 nav，带命名空间类与默认 gray 主题修饰', () => {
    wrapper = mountMenu();
    expect(wrapper.element.tagName).toBe('NAV');
    expect(wrapper.classes()).toContain('aix-menu');
    expect(wrapper.classes()).toContain('aix-menu--gray');
    expect(wrapper.find('ul.aix-menu__list').exists()).toBe(true);
  });

  it('theme 决定根节点修饰类，任意字符串同样生效', async () => {
    wrapper = mountMenu({ props: { theme: 'white' } });
    expect(wrapper.classes()).toContain('aix-menu--white');
    expect(wrapper.classes()).not.toContain('aix-menu--gray');

    await wrapper.setProps({ theme: 'brand' });
    expect(wrapper.classes()).toContain('aix-menu--brand');
  });

  it('items 中的叶子节点渲染为 li.aix-menu-item 内的 button', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const li = itemLi(wrapper.element, '首页');
    const button = li.querySelector('button.aix-menu-item__button')!;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent?.trim()).toBe('首页');
  });

  it('divider 节点渲染为 role=separator 的 li', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const divider = wrapper.find('li.aix-menu__divider');
    expect(divider.exists()).toBe(true);
    expect(divider.attributes('role')).toBe('separator');
  });

  it('group 节点渲染为分组：button 标题带 aria-expanded / aria-controls 指向列表', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const title = groupTitle(wrapper.element, '分组 A');
    const list = groupList(wrapper.element, '分组 A');
    expect(title.tagName).toBe('BUTTON');
    expect(title.getAttribute('aria-expanded')).toBe('true');
    expect(list.id).toBeTruthy();
    expect(title.getAttribute('aria-controls')).toBe(list.id);
    expect(
      groupLi(wrapper.element, '分组 A').querySelector('.aix-menu-group__arrow'),
    ).not.toBeNull();
  });

  it('带 children 的非 group 节点渲染为 SubMenu 触发器', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const title = subMenuTitle(wrapper.element, '子菜单');
    expect(title.getAttribute('aria-haspopup')).toBe('true');
    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(title.getAttribute('aria-controls')).toBeNull();
    expect(
      subMenuLi(wrapper.element, '子菜单').querySelector('.aix-menu-submenu__arrow'),
    ).not.toBeNull();
    expect(document.body.querySelector('.aix-menu-popup')).toBeNull();
  });

  it('叶子与分组按所在分组层级带 level 修饰类', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    expect(itemLi(wrapper.element, '首页').classList).toContain('aix-menu-item--level-0');
    expect(itemLi(wrapper.element, 'A1').classList).toContain('aix-menu-item--level-1');
    expect(itemLi(wrapper.element, 'A3').classList).toContain('aix-menu-item--level-2');
    expect(groupLi(wrapper.element, '分组 A').classList).toContain('aix-menu-group--level-1');
    expect(groupLi(wrapper.element, '嵌套分组').classList).toContain('aix-menu-group--level-2');
    expect(subMenuLi(wrapper.element, '子菜单').classList).toContain('aix-menu-submenu--level-0');
  });

  it('icon 渲染在 aria-hidden 的图标容器内，无 icon 时不渲染容器', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const iconBox = itemLi(wrapper.element, '首页').querySelector('.aix-menu-item-content__icon');
    expect(iconBox?.getAttribute('aria-hidden')).toBe('true');
    expect(iconBox?.querySelector('.icon-stub')).not.toBeNull();
    expect(itemLi(wrapper.element, 'A1').querySelector('.aix-menu-item-content__icon')).toBeNull();
  });

  it('分组箭头与 SubMenu 箭头由 MenuIcon 以 CSS 变量渲染', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    const groupArrow = groupLi(wrapper.element, '分组 A').querySelector<HTMLElement>(
      '.aix-menu-group__arrow',
    )!;
    const subArrow = subMenuLi(wrapper.element, '子菜单').querySelector<HTMLElement>(
      '.aix-menu-submenu__arrow',
    )!;
    for (const arrow of [groupArrow, subArrow]) {
      expect(arrow.tagName).toBe('SPAN');
      expect(arrow.classList).toContain('aix-menu-icon');
      expect(arrow.getAttribute('aria-hidden')).toBe('true');
      expect(arrow.style.getPropertyValue('--aix-menu-icon-src')).toMatch(/^url\(/);
    }
  });

  it('disabled 叶子的 button 被禁用并带 disabled 修饰类', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    expect(itemButton(wrapper.element, 'A2').disabled).toBe(true);
    expect(itemLi(wrapper.element, 'A2').classList).toContain('aix-menu-item--disabled');
    expect(itemLi(wrapper.element, 'A1').classList).not.toContain('aix-menu-item--disabled');
  });

  it('禁用且被选中的叶子与 SubMenu 同时带 active 与 disabled 修饰类', async () => {
    wrapper = mountMenu({
      props: {
        items: [
          { key: 'sub', label: '子菜单', disabled: true, children: [{ key: 'c', label: 'C' }] },
          { key: 'a2', label: 'A2', disabled: true },
        ],
        selectedKey: 'a2',
      },
    });
    const leaf = itemLi(wrapper.element, 'A2');
    expect(leaf.classList).toContain('aix-menu-item--active');
    expect(leaf.classList).toContain('aix-menu-item--disabled');

    await wrapper.setProps({ selectedKey: 'c' });
    const sub = subMenuLi(wrapper.element, '子菜单');
    expect(sub.classList).toContain('aix-menu-submenu--active');
    expect(sub.classList).toContain('aix-menu-submenu--disabled');
  });

  it('items 与默认插槽同时使用时插槽内容排在 items 之后', () => {
    wrapper = mountMenu({
      props: { items: [{ key: 'x', label: 'X' }] },
      slots: { default: () => h(MenuItem, { itemKey: 'y', label: 'Y' }) },
    });
    const labels = Array.from(
      (wrapper.element as HTMLElement).querySelectorAll('.aix-menu-item__button'),
    ).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['X', 'Y']);
  });
});

describe('Menu 选中', () => {
  it('点击叶子触发 update:selectedKey 与 select，payload 含 key / keyPath / data', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    await wrapper.find('.aix-menu-item__button').trigger('click');

    expect(wrapper.emitted('update:selectedKey')).toEqual([['home']]);
    expect(wrapper.emitted('select')).toEqual([
      [{ key: 'home', keyPath: ['home'], data: ITEMS[0] }],
    ]);
  });

  it('分组内叶子的 keyPath 包含全部祖先分组 key', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    itemButton(wrapper.element, 'A3').click();
    await nextTick();

    const [payload] = wrapper.emitted<[MenuSelectPayload]>('select')![0]!;
    expect(payload.keyPath).toEqual(['group-a', 'group-a-nested', 'a3']);
  });

  it('非受控模式下点击后自身高亮并带 aria-current=page', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    itemButton(wrapper.element, 'A1').click();
    await nextTick();

    expect(itemLi(wrapper.element, 'A1').classList).toContain('aix-menu-item--active');
    expect(itemButton(wrapper.element, 'A1').getAttribute('aria-current')).toBe('page');
    expect(itemButton(wrapper.element, '首页').getAttribute('aria-current')).toBeNull();

    itemButton(wrapper.element, '首页').click();
    await nextTick();
    expect(itemLi(wrapper.element, 'A1').classList).not.toContain('aix-menu-item--active');
    expect(itemLi(wrapper.element, '首页').classList).toContain('aix-menu-item--active');
  });

  it('受控 selectedKey 下点击只发事件，高亮跟随 prop', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, selectedKey: 'home' } });
    expect(itemLi(wrapper.element, '首页').classList).toContain('aix-menu-item--active');

    itemButton(wrapper.element, 'A1').click();
    await nextTick();
    expect(wrapper.emitted('update:selectedKey')).toEqual([['a1']]);
    expect(itemLi(wrapper.element, '首页').classList).toContain('aix-menu-item--active');
    expect(itemLi(wrapper.element, 'A1').classList).not.toContain('aix-menu-item--active');

    await wrapper.setProps({ selectedKey: 'a1' });
    expect(itemLi(wrapper.element, 'A1').classList).toContain('aix-menu-item--active');
  });

  it('再次点击已选中项不重复触发 update:selectedKey，但仍触发 select', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    itemButton(wrapper.element, '首页').click();
    itemButton(wrapper.element, '首页').click();
    await nextTick();

    expect(wrapper.emitted('update:selectedKey')).toHaveLength(1);
    expect(wrapper.emitted('select')).toHaveLength(2);
  });

  it('disabled 叶子点击不触发任何事件', async () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    // 走 dispatchEvent：jsdom 对 disabled 控件的 HTMLElement.click() 不派发事件，打不到组件内的守卫
    await click(itemButton(wrapper.element, 'A2'));

    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('update:selectedKey')).toBeUndefined();
  });

  it('挂载时选中项位于折叠分组内则自动展开其全部祖先分组', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, selectedKey: 'a3', defaultOpenKeys: [] } });
    await nextTick();

    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);
    expect(isShown(groupList(wrapper.element, '嵌套分组'))).toBe(true);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(false);
    expect(wrapper.emitted('update:openKeys')?.at(-1)).toEqual([['group-a', 'group-a-nested']]);
  });

  it('外部修改 selectedKey 时自动展开新选中项的祖先分组', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, defaultOpenKeys: [] } });
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(false);

    await wrapper.setProps({ selectedKey: 'b1' });
    await nextTick();
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
    expect(wrapper.emitted('open-change')?.at(-1)).toEqual([['group-b']]);
  });

  it('点击折叠分组内的叶子会展开该分组', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, defaultOpenKeys: [] } });
    itemButton(wrapper.element, 'B1').click();
    await nextTick();

    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
    expect(wrapper.emitted('update:openKeys')).toEqual([[['group-b']]]);
  });
});

describe('Menu 分组展开', () => {
  it('未传 openKeys 与 defaultOpenKeys 时所有可折叠分组默认展开', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    for (const title of ['分组 A', '嵌套分组', '分组 B']) {
      expect(isShown(groupList(wrapper.element, title))).toBe(true);
      expect(groupTitle(wrapper.element, title).getAttribute('aria-expanded')).toBe('true');
      expect(groupLi(wrapper.element, title).classList).toContain('aix-menu-group--open');
    }
  });

  it('defaultOpenKeys 只展开指定分组', () => {
    wrapper = mountMenu({ props: { items: ITEMS, defaultOpenKeys: ['group-b'] } });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(false);
    expect(groupTitle(wrapper.element, '分组 A').getAttribute('aria-expanded')).toBe('false');
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
  });

  it('点击标题切换展开并触发 update:openKeys 与 open-change', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, defaultOpenKeys: ['group-a'] } });

    groupTitle(wrapper.element, '分组 A').click();
    await nextTick();
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(false);
    expect(wrapper.emitted('update:openKeys')).toEqual([[[]]]);
    expect(wrapper.emitted('open-change')).toEqual([[[]]]);

    groupTitle(wrapper.element, '分组 B').click();
    await nextTick();
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
    expect(wrapper.emitted('update:openKeys')?.at(-1)).toEqual([['group-b']]);
  });

  it('受控 openKeys 下点击只发事件，展开状态跟随 prop', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, openKeys: ['group-a'] } });

    groupTitle(wrapper.element, '分组 A').click();
    await nextTick();
    expect(wrapper.emitted('update:openKeys')).toEqual([[[]]]);
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);

    await wrapper.setProps({ openKeys: [] });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(false);
  });

  it('accordion 下展开一个分组会收起同级其他分组', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, accordion: true, defaultOpenKeys: ['group-a'] } });

    groupTitle(wrapper.element, '分组 B').click();
    await nextTick();
    expect(wrapper.emitted('update:openKeys')).toEqual([[['group-b']]]);
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(false);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
  });

  it('accordion 只在同级之间互斥，展开子分组不影响父分组', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, accordion: true, defaultOpenKeys: ['group-a'] } });

    groupTitle(wrapper.element, '嵌套分组').click();
    await nextTick();
    expect(wrapper.emitted('update:openKeys')).toEqual([[['group-a', 'group-a-nested']]]);
  });

  it('accordion 下自动展开选中项祖先时同样收起同级分组', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, accordion: true, defaultOpenKeys: ['group-a'] } });

    await wrapper.setProps({ selectedKey: 'b1' });
    await nextTick();
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(false);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
  });
});

describe('Menu 复合组件', () => {
  function mountCompound(extra: Record<string, unknown> = {}) {
    return mount(Menu, {
      attachTo: document.body,
      props: extra,
      slots: {
        default: () => [
          h(MenuItem, { itemKey: 'home', label: '首页', icon: IconStub }),
          h(MenuGroup, { groupKey: 'g', title: '分组' }, () => [
            h(MenuItem, { itemKey: 'g1', label: 'G1' }),
          ]),
          h(MenuGroup, { groupKey: 'static', title: '固定分组', collapsible: false }, () => [
            h(MenuItem, { itemKey: 'st1', label: 'ST1' }),
          ]),
          h(SubMenu, { itemKey: 'sub', label: '子菜单' }, () => [
            h(MenuItem, { itemKey: 's1', label: 'S1' }),
          ]),
        ],
      },
    });
  }

  it('MenuGroup / MenuItem / SubMenu 组合渲染与数据驱动一致', () => {
    wrapper = mountCompound();
    expect(itemLi(wrapper.element, '首页').classList).toContain('aix-menu-item--level-0');
    expect(itemLi(wrapper.element, 'G1').classList).toContain('aix-menu-item--level-1');
    expect(groupTitle(wrapper.element, '分组').getAttribute('aria-expanded')).toBe('true');
    expect(subMenuTitle(wrapper.element, '子菜单').getAttribute('aria-haspopup')).toBe('true');
  });

  it('复合组件选中时 payload.data 为 undefined，keyPath 含分组 key', async () => {
    wrapper = mountCompound();
    itemButton(wrapper.element, 'G1').click();
    await nextTick();

    expect(wrapper.emitted('select')).toEqual([
      [{ key: 'g1', keyPath: ['g', 'g1'], data: undefined }],
    ]);
    expect(itemLi(wrapper.element, 'G1').classList).toContain('aix-menu-item--active');
  });

  it('collapsible=false 的分组标题为 div，始终展开且点击无效', async () => {
    wrapper = mountCompound({ defaultOpenKeys: [] });
    const title = groupTitle(wrapper.element, '固定分组');
    const li = groupLi(wrapper.element, '固定分组');

    expect(title.tagName).toBe('DIV');
    expect(title.getAttribute('aria-expanded')).toBeNull();
    expect(title.querySelector('.aix-menu-group__arrow')).toBeNull();
    expect(li.classList).toContain('aix-menu-group--static');
    expect(isShown(groupList(wrapper.element, '固定分组'))).toBe(true);

    title.click();
    await nextTick();
    expect(wrapper.emitted('update:openKeys')).toBeUndefined();
    expect(isShown(groupList(wrapper.element, '固定分组'))).toBe(true);
  });

  it('MenuGroup 的 title 插槽与 MenuItem 的 icon / 默认插槽可自定义内容', () => {
    wrapper = mountMenu({
      slots: {
        default: () => [
          h(
            MenuGroup,
            { groupKey: 'g' },
            {
              title: () => h('em', { class: 'custom-title' }, '自定义标题'),
              default: () =>
                h(
                  MenuItem,
                  { itemKey: 'a', label: '标签' },
                  {
                    icon: () => h('i', { class: 'custom-icon' }),
                    default: () => h('b', { class: 'custom-label' }, '自定义文案'),
                  },
                ),
            },
          ),
        ],
      },
    });

    expect(wrapper.find('.aix-menu-group__title-text .custom-title').text()).toBe('自定义标题');
    expect(wrapper.find('.aix-menu-item-content__icon .custom-icon').exists()).toBe(true);
    expect(wrapper.find('.aix-menu-item-content__label .custom-label').text()).toBe('自定义文案');
  });

  it('运行时把 collapsible 从 false 改为 true 后分组参与 accordion 互斥，改回 false 后退出', async () => {
    const Host = defineComponent({
      props: { collapsible: { type: Boolean, default: false } },
      setup: (hostProps) => () =>
        h(Menu, { accordion: true, defaultOpenKeys: ['g1'] }, () => [
          h(MenuGroup, { groupKey: 'g1', title: 'G1' }, () =>
            h(MenuItem, { itemKey: 'a', label: 'A' }),
          ),
          h(MenuGroup, { groupKey: 'g2', title: 'G2', collapsible: hostProps.collapsible }, () =>
            h(MenuItem, { itemKey: 'b', label: 'B' }),
          ),
        ]),
    });
    const host = mount(Host, { attachTo: document.body });
    wrapper = host;
    const menu = host.findComponent(Menu);
    expect(groupTitle(host.element, 'G2').tagName).toBe('DIV');

    await host.setProps({ collapsible: true });
    expect(groupTitle(host.element, 'G2').tagName).toBe('BUTTON');
    expect(isShown(groupList(host.element, 'G2'))).toBe(false);

    groupTitle(host.element, 'G2').click();
    await nextTick();
    expect(menu.emitted('update:openKeys')?.at(-1)).toEqual([['g2']]);
    expect(isShown(groupList(host.element, 'G1'))).toBe(false);

    await host.setProps({ collapsible: false });
    groupTitle(host.element, 'G1').click();
    await nextTick();
    expect(menu.emitted('update:openKeys')?.at(-1)).toEqual([['g2', 'g1']]);
  });

  it('运行时改 groupKey 后，分组内叶子项的 keyPath 与展开登记跟随新 key', async () => {
    const Host = defineComponent({
      props: { groupKey: { type: String, default: 'g1' } },
      setup: (hostProps) => () =>
        h(Menu, { defaultOpenKeys: [] }, () => [
          h(MenuGroup, { groupKey: hostProps.groupKey, title: 'G' }, () => [
            h(MenuItem, { itemKey: 'leaf', label: 'Leaf' }),
          ]),
        ]),
    });
    const host = mount(Host, { attachTo: document.body });
    wrapper = host;
    const menu = host.findComponent(Menu);

    await host.setProps({ groupKey: 'g2' });
    await click(itemButton(host.element, 'Leaf'));

    const [payload] = menu.emitted<[MenuSelectPayload]>('select')!.at(-1)!;
    expect(payload.keyPath).toEqual(['g2', 'leaf']);
    expect(menu.emitted('update:openKeys')?.at(-1)).toEqual([['g2']]);
  });

  it('同级两个分组互换 groupKey 后，新 key 的登记不被对方注销', async () => {
    const Host = defineComponent({
      props: { swap: Boolean },
      setup: (hostProps) => () =>
        h(Menu, { defaultOpenKeys: [] }, () => [
          h(MenuGroup, { groupKey: hostProps.swap ? 'g2' : 'g1', title: 'A' }, () => [
            h(MenuItem, { itemKey: 'a', label: 'A1' }),
          ]),
          h(MenuGroup, { groupKey: hostProps.swap ? 'g1' : 'g2', title: 'B' }, () => [
            h(MenuItem, { itemKey: 'b', label: 'B1' }),
          ]),
        ]),
    });
    const host = mount(Host, { attachTo: document.body });
    wrapper = host;
    const menu = host.findComponent(Menu);

    await host.setProps({ swap: true });
    await click(itemButton(host.element, 'A1'));

    expect(menu.emitted('update:openKeys')?.at(-1)).toEqual([['g2']]);
  });

  it('祖先 groupKey 变化不会重新展开用户已折叠的内层分组', async () => {
    const Host = defineComponent({
      props: { outerKey: { type: String, default: 'o1' } },
      setup: (hostProps) => () =>
        h(Menu, null, () => [
          h(MenuGroup, { groupKey: hostProps.outerKey, title: 'Outer' }, () => [
            h(MenuGroup, { groupKey: 'inner', title: 'Inner' }, () => [
              h(MenuItem, { itemKey: 'leaf', label: 'Leaf' }),
            ]),
          ]),
        ]),
    });
    const host = mount(Host, { attachTo: document.body });
    wrapper = host;
    expect(isShown(groupList(host.element, 'Inner'))).toBe(true);

    await click(groupTitle(host.element, 'Inner'));
    expect(isShown(groupList(host.element, 'Inner'))).toBe(false);

    await host.setProps({ outerKey: 'o2' });
    expect(isShown(groupList(host.element, 'Inner'))).toBe(false);
  });

  it('两个同 key 的 MenuItem 卸载其一后，选中该 key 仍能展开另一项所在分组', async () => {
    const Host = defineComponent({
      props: { showRoot: Boolean, selectedKey: String },
      setup: (hostProps) => () =>
        h(Menu, { defaultOpenKeys: [], selectedKey: hostProps.selectedKey }, () => [
          hostProps.showRoot ? h(MenuItem, { itemKey: 'dup', label: 'RootDup' }) : null,
          h(MenuGroup, { groupKey: 'g', title: 'G' }, () => [
            h(MenuItem, { itemKey: 'dup', label: 'GroupDup' }),
          ]),
        ]),
    });
    const host = mount(Host, { attachTo: document.body, props: { showRoot: true } });
    wrapper = host;
    expect(isShown(groupList(host.element, 'G'))).toBe(false);

    await host.setProps({ showRoot: false });
    expect(host.element.querySelectorAll('.aix-menu-item')).toHaveLength(1);

    await host.setProps({ selectedKey: 'dup' });
    await nextTick();
    expect(isShown(groupList(host.element, 'G'))).toBe(true);
    expect(itemLi(host.element, 'GroupDup').classList).toContain('aix-menu-item--active');
  });

  it('MenuItem 的 data 换成新对象后 select 事件透出新对象', async () => {
    const first: MenuItemData = { key: 'x', label: 'X', meta: { v: 1 } };
    const second: MenuItemData = { key: 'x', label: 'X', meta: { v: 2 } };
    const Host = defineComponent({
      props: { data: { type: Object as PropType<MenuItemData>, required: true } },
      setup: (hostProps) => () =>
        h(Menu, null, () => [h(MenuItem, { itemKey: 'x', label: 'X', data: hostProps.data })]),
    });
    const host = mount(Host, { attachTo: document.body, props: { data: first } });
    wrapper = host;

    await host.setProps({ data: second });
    itemButton(host.element, 'X').click();
    await nextTick();

    const [payload] = host.findComponent(Menu).emitted<[MenuSelectPayload]>('select')![0]!;
    expect(toRaw(payload.data)).toBe(second);
    expect(payload.data?.meta).toEqual({ v: 2 });
  });

  it('MenuItem 的 itemKey 变化后选中新 key 展开所在分组，选中旧 key 无效', async () => {
    const Host = defineComponent({
      props: { itemKey: { type: String, required: true }, selectedKey: String },
      setup: (hostProps) => () =>
        h(Menu, { defaultOpenKeys: [], selectedKey: hostProps.selectedKey }, () => [
          h(MenuGroup, { groupKey: 'g', title: 'G' }, () => [
            h(MenuItem, { itemKey: hostProps.itemKey, label: 'Item' }),
          ]),
        ]),
    });
    const host = mount(Host, { attachTo: document.body, props: { itemKey: 'a' } });
    wrapper = host;

    await host.setProps({ itemKey: 'b' });
    await host.setProps({ selectedKey: 'a' });
    await nextTick();
    expect(isShown(groupList(host.element, 'G'))).toBe(false);
    expect(itemLi(host.element, 'Item').classList).not.toContain('aix-menu-item--active');

    await host.setProps({ selectedKey: 'b' });
    await nextTick();
    expect(isShown(groupList(host.element, 'G'))).toBe(true);
    expect(itemLi(host.element, 'Item').classList).toContain('aix-menu-item--active');
  });

  it('MenuItem 脱离 Menu 单独挂载时抛出错误', () => {
    expect(() => mount(MenuItem, { props: { itemKey: 'x' } })).toThrow(/AixMenu/);
  });

  it('MenuGroup 脱离 Menu 单独挂载时抛出错误', () => {
    expect(() => mount(MenuGroup, { props: { groupKey: 'x' } })).toThrow(/AixMenu/);
  });
});

describe('Menu 插槽', () => {
  it('header / footer 插槽渲染在对应容器内，未提供时不渲染容器', () => {
    wrapper = mountMenu({
      slots: {
        header: () => h('div', { class: 'logo' }, 'LOGO'),
        footer: () => h('div', { class: 'user' }, 'USER'),
      },
    });
    expect(wrapper.find('.aix-menu__header .logo').text()).toBe('LOGO');
    expect(wrapper.find('.aix-menu__footer .user').text()).toBe('USER');

    const plain = mountMenu();
    expect(plain.find('.aix-menu__header').exists()).toBe(false);
    expect(plain.find('.aix-menu__footer').exists()).toBe(false);
    plain.unmount();
  });

  it('item 作用域插槽接收 item / groupLevel / inPopup / active', async () => {
    const received: MenuItemSlotProps[] = [];
    wrapper = mountMenu({
      props: { items: ITEMS, selectedKey: 'a1' },
      slots: {
        item: (props: MenuItemSlotProps) => {
          received.push({ ...props });
          return h(
            'span',
            { class: 'custom-item' },
            `${props.item.label}${props.active ? '*' : ''}`,
          );
        },
      },
    });
    await nextTick();

    const texts = Array.from((wrapper.element as HTMLElement).querySelectorAll('.custom-item')).map(
      (el) => el.textContent,
    );
    expect(texts).toContain('首页');
    expect(texts).toContain('A1*');

    const a1 = received.find((p) => p.item.key === 'a1')!;
    expect(a1.groupLevel).toBe(1);
    expect(a1.inPopup).toBe(false);
    expect(a1.active).toBe(true);
    const home = received.find((p) => p.item.key === 'home')!;
    expect(home.groupLevel).toBe(0);
    expect(home.active).toBe(false);
  });

  it('icon 作用域插槽替换带 icon 节点的图标，无 icon 的节点不渲染图标容器', () => {
    wrapper = mountMenu({
      props: {
        items: [
          { key: 'a', label: 'A', icon: IconStub },
          { key: 'b', label: 'B' },
          {
            key: 'g',
            type: 'group',
            label: 'G',
            icon: 'icon-g',
            children: [{ key: 'g1', label: 'G1' }],
          },
        ],
      },
      slots: {
        icon: ({ item }: { item: { key: string } }) => h('i', { class: `slot-icon-${item.key}` }),
      },
    });
    expect(wrapper.find('.aix-menu-item-content__icon .slot-icon-a').exists()).toBe(true);
    expect(wrapper.find('.slot-icon-b').exists()).toBe(false);
    expect(itemLi(wrapper.element, 'B').querySelector('.aix-menu-item-content__icon')).toBeNull();
    expect(wrapper.find('.aix-menu-group__icon .slot-icon-g').exists()).toBe(true);
    expect(wrapper.find('.icon-stub').exists()).toBe(false);
  });

  it('group-title 作用域插槽替换分组标题', () => {
    wrapper = mountMenu({
      props: { items: ITEMS },
      slots: {
        'group-title': ({ item }: { item: { label?: string } }) =>
          h('strong', { class: 'custom-group-title' }, `[${item.label}]`),
      },
    });
    const titles = Array.from(
      (wrapper.element as HTMLElement).querySelectorAll('.custom-group-title'),
    ).map((el) => el.textContent);
    expect(titles).toEqual(['[分组 A]', '[嵌套分组]', '[分组 B]']);
  });
});

describe('Menu 国际化与安装', () => {
  it('拖拽把手的 aria-label 默认中文，跟随应用级 locale 切换英文', () => {
    wrapper = mountMenu({ props: { resizable: true } });
    expect(wrapper.find('.aix-menu__resize-handle').attributes('aria-label')).toBe(
      menuZhCN.resizeHandle,
    );

    const en = mountMenu({
      props: { resizable: true },
      global: { plugins: [createLocale('en-US')] },
    });
    expect(en.find('.aix-menu__resize-handle').attributes('aria-label')).toBe(
      menuEnUS.resizeHandle,
    );
    en.unmount();
  });

  it('语言包覆盖 zh-CN / en-US', () => {
    expect(Object.keys(menuLocale).sort()).toEqual(['en-US', 'zh-CN']);
  });

  it('默认导出的插件注册四个全局组件', () => {
    const app = createApp({ render: () => null });
    app.use(MenuPlugin);
    expect(app.component('AixMenu')).toBe(Menu);
    expect(app.component('AixMenuItem')).toBe(MenuItem);
    expect(app.component('AixMenuGroup')).toBe(MenuGroup);
    expect(app.component('AixSubMenu')).toBe(SubMenu);
  });
});
