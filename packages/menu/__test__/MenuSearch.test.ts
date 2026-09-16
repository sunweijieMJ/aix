import { createLocale } from '@aix/hooks';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick } from 'vue';
import { MenuItem, menuEnUS, menuZhCN, type MenuItemData } from '../src';
import {
  ITEMS,
  cleanupBody,
  dom,
  groupList,
  groupTitle,
  isShown,
  itemButton,
  mountMenu,
  popup,
  subMenuLi,
} from './helpers';

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  cleanupBody();
  vi.useRealTimers();
});

function searchInput() {
  return wrapper!.find<HTMLInputElement>('input.aix-menu-search__input');
}

function type(value: string) {
  return searchInput().setValue(value);
}

function visibleLabels(root: ParentNode = wrapper!.element) {
  return Array.from(root.querySelectorAll<HTMLElement>('.aix-menu-item__button')).map((el) =>
    el.textContent?.trim(),
  );
}

function visibleGroupTitles(root: ParentNode = wrapper!.element) {
  return Array.from(root.querySelectorAll<HTMLElement>('.aix-menu-group__title')).map((el) =>
    el.textContent?.trim(),
  );
}

function emptyLi() {
  return wrapper!.find('li.aix-menu__empty');
}

describe('Menu 搜索框渲染', () => {
  it('默认不渲染搜索框', () => {
    wrapper = mountMenu({ props: { items: ITEMS } });
    expect(wrapper.find('.aix-menu-search').exists()).toBe(false);
  });

  it('searchable 时在 header 之下、列表之上渲染 label 包裹的文本输入框', () => {
    wrapper = mountMenu({
      props: { items: ITEMS, searchable: true },
      slots: { header: () => h('div', { class: 'logo' }) },
    });
    const search = wrapper.find('label.aix-menu-search');
    expect(search.exists()).toBe(true);
    expect(search.element.previousElementSibling?.classList).toContain('aix-menu__header');
    expect(search.element.nextElementSibling?.classList).toContain('aix-menu__list');

    const input = searchInput();
    expect(input.attributes('type')).toBe('text');
    expect(input.attributes('autocomplete')).toBe('off');
    expect(input.attributes('placeholder')).toBe(menuZhCN.searchPlaceholder);
    expect(input.attributes('aria-label')).toBe(menuZhCN.searchPlaceholder);
  });

  it('搜索图标通过 MenuIcon 以 CSS 变量渲染', () => {
    wrapper = mountMenu({ props: { searchable: true } });
    const icon = wrapper.find<HTMLElement>('.aix-menu-search__icon');
    expect(icon.classes()).toContain('aix-menu-icon');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.element.style.getPropertyValue('--aix-menu-icon-src')).toMatch(/^url\(/);
  });

  it('占位文案跟随应用级 locale，searchPlaceholder 可覆盖', async () => {
    wrapper = mountMenu({
      props: { searchable: true },
      global: { plugins: [createLocale('en-US')] },
    });
    expect(searchInput().attributes('placeholder')).toBe(menuEnUS.searchPlaceholder);

    await wrapper.setProps({ searchPlaceholder: '找菜单' });
    expect(searchInput().attributes('placeholder')).toBe('找菜单');
    expect(searchInput().attributes('aria-label')).toBe('找菜单');
  });

  it('输入框聚焦时容器带 focused 修饰，失焦后移除', async () => {
    wrapper = mountMenu({ props: { searchable: true } });
    const search = wrapper.find('.aix-menu-search');

    await searchInput().trigger('focus');
    expect(search.classes()).toContain('aix-menu-search--focused');

    await searchInput().trigger('blur');
    expect(search.classes()).not.toContain('aix-menu-search--focused');
  });
});

describe('Menu 搜索事件', () => {
  it('输入时触发 update:searchValue 原值与 search 去空白值', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    await type('  A1 ');

    expect(wrapper.emitted('update:searchValue')).toEqual([['  A1 ']]);
    expect(wrapper.emitted('search')).toEqual([['A1']]);
    expect(searchInput().element.value).toBe('  A1 ');
  });

  it('受控 searchValue 下输入只发事件，输入框与过滤结果跟随 prop', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true, searchValue: 'b1' } });
    expect(visibleLabels()).toEqual(['B1']);

    await type('a1');
    expect(wrapper.emitted('update:searchValue')).toEqual([['a1']]);
    expect(wrapper.emitted('search')).toEqual([['a1']]);
    expect(visibleLabels()).toEqual(['B1']);

    await wrapper.setProps({ searchValue: 'a1' });
    expect(searchInput().element.value).toBe('a1');
    expect(visibleLabels()).toEqual(['A1']);
  });

  it('Esc 在有内容时清空关键字并阻止默认行为', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    await type('a1');
    expect(visibleLabels()).toEqual(['A1']);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    searchInput().element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('update:searchValue')?.at(-1)).toEqual(['']);
    expect(wrapper.emitted('search')?.at(-1)).toEqual(['']);
    expect(searchInput().element.value).toBe('');
    expect(visibleLabels()).toContain('首页');
  });

  it('Esc 在内容为空时不触发事件也不阻止默认行为', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    searchInput().element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('update:searchValue')).toBeUndefined();
  });

  it('Esc 在有内容时不冒泡到外层元素，内容为空时正常冒泡', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    const outer = vi.fn();
    wrapper.element.addEventListener('keydown', outer);
    const pressEscape = () => {
      searchInput().element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      return nextTick();
    };

    await type('a1');
    await pressEscape();
    expect(searchInput().element.value).toBe('');
    expect(outer).not.toHaveBeenCalled();

    await pressEscape();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('复合组件写法下输入只透出事件，不过滤插槽内容也不显示空态', async () => {
    wrapper = mountMenu({
      props: { searchable: true },
      slots: {
        default: () => [
          h(MenuItem, { itemKey: 'a', label: 'Alpha' }),
          h(MenuItem, { itemKey: 'b', label: 'Beta' }),
        ],
      },
    });
    await type('zzz');

    expect(wrapper.emitted('search')).toEqual([['zzz']]);
    expect(visibleLabels()).toEqual(['Alpha', 'Beta']);
    expect(emptyLi().exists()).toBe(false);
  });
});

describe('Menu 搜索过滤', () => {
  it('按 label 不区分大小写包含匹配，未匹配的节点与分割线被移除', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    expect(wrapper.find('.aix-menu__divider').exists()).toBe(true);

    await type('b1');
    expect(visibleLabels()).toEqual(['B1']);
    expect(visibleGroupTitles()).toEqual(['分组 B']);
    expect(wrapper.find('.aix-menu__divider').exists()).toBe(false);
    expect(wrapper.find('.aix-menu-submenu').exists()).toBe(false);

    await type('a3');
    expect(visibleLabels()).toEqual(['A3']);
    await type('A3');
    expect(visibleLabels()).toEqual(['A3']);
  });

  it('自身匹配的节点保留整棵子树', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    await type('分组 a');

    expect(visibleGroupTitles()).toEqual(['分组 A', '嵌套分组']);
    expect(visibleLabels()).toEqual(['A1', 'A2', 'A3']);
  });

  it('只有后代匹配时收窄 children，祖先链完整保留', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    await type('a3');

    expect(visibleGroupTitles()).toEqual(['分组 A', '嵌套分组']);
    expect(visibleLabels()).toEqual(['A3']);
  });

  it('flyout 子树同样被过滤，弹层中只剩匹配项', async () => {
    vi.useFakeTimers();
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    await type('n1');
    expect(visibleLabels()).toEqual([]);
    expect(subMenuLi(wrapper.element, '子菜单')).toBeTruthy();

    await dom(subMenuLi(wrapper.element, '子菜单')).trigger('mouseenter');
    vi.advanceTimersByTime(100);
    await nextTick();
    const first = popup()!;
    expect(visibleLabels(first)).toEqual([]);
    expect(subMenuLi(first, '二级子菜单')).toBeTruthy();
    expect(first.querySelector('.aix-menu-item')).toBeNull();
  });

  it('清空关键字后恢复完整列表', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    const before = visibleLabels();

    await type('b1');
    expect(visibleLabels()).toEqual(['B1']);
    await type('');
    expect(visibleLabels()).toEqual(before);
    expect(wrapper.find('.aix-menu__divider').exists()).toBe(true);
  });

  it('仅空白字符的关键字不过滤也不显示空态', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    const before = visibleLabels();

    await type('   ');
    expect(visibleLabels()).toEqual(before);
    expect(emptyLi().exists()).toBe(false);
    expect(wrapper.emitted('search')).toEqual([['']]);
  });

  it('searchable 为 false 时传入 searchValue 也不过滤', () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchValue: 'zzz' } });
    expect(visibleLabels()).toContain('首页');
    expect(emptyLi().exists()).toBe(false);
  });

  it('filterMethod 接收节点与去空白关键字并替代默认匹配', async () => {
    const filterMethod = vi.fn((item: MenuItemData, keyword: string) => item.key === keyword);
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true, filterMethod } });

    await type(' group-b ');
    expect(visibleGroupTitles()).toEqual(['分组 B']);
    expect(visibleLabels()).toEqual(['B1']);
    expect(filterMethod).toHaveBeenCalledWith(ITEMS[0], 'group-b');
    expect(filterMethod.mock.calls.every(([, keyword]) => keyword === 'group-b')).toBe(true);
    expect(filterMethod.mock.calls.some(([item]) => item.type === 'divider')).toBe(false);

    await type('a3');
    expect(visibleGroupTitles()).toEqual(['分组 A', '嵌套分组']);
    expect(visibleLabels()).toEqual(['A3']);
  });

  it('搜索结果中的叶子仍可选中，keyPath 基于过滤后的树', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    await type('a3');
    itemButton(wrapper.element, 'A3').click();
    await nextTick();

    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({
      key: 'a3',
      keyPath: ['group-a', 'group-a-nested', 'a3'],
    });
  });
});

describe('Menu 搜索时分组展开', () => {
  it('关键字非空时所有可折叠分组强制展开，不改写 openKeys', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true, defaultOpenKeys: [] } });
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(false);

    await type('a3');
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);
    expect(isShown(groupList(wrapper.element, '嵌套分组'))).toBe(true);
    expect(groupTitle(wrapper.element, '分组 A').getAttribute('aria-expanded')).toBe('true');
    expect(wrapper.emitted('update:openKeys')).toBeUndefined();
    expect(wrapper.emitted('open-change')).toBeUndefined();
  });

  it('清空关键字后分组回到原展开状态', async () => {
    wrapper = mountMenu({
      props: { items: ITEMS, searchable: true, defaultOpenKeys: ['group-b'] },
    });
    await type('a1');
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(true);

    await type('');
    expect(isShown(groupList(wrapper.element, '分组 A'))).toBe(false);
    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
  });

  it('受控 openKeys 下强制展开同样不触发 update:openKeys', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true, openKeys: [] } });
    await type('b1');

    expect(isShown(groupList(wrapper.element, '分组 B'))).toBe(true);
    expect(wrapper.emitted('update:openKeys')).toBeUndefined();
  });
});

describe('Menu 搜索空态', () => {
  it('无匹配结果时渲染空态提示，列表中没有菜单项', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    await type('不存在的菜单');

    expect(emptyLi().exists()).toBe(true);
    expect(emptyLi().text()).toBe(menuZhCN.noResults);
    expect(emptyLi().element.parentElement?.classList).toContain('aix-menu__list');
    expect(wrapper.findAll('.aix-menu-item, .aix-menu-group, .aix-menu-submenu')).toHaveLength(0);
  });

  it('空态文案跟随应用级 locale', async () => {
    wrapper = mountMenu({
      props: { items: ITEMS, searchable: true },
      global: { plugins: [createLocale('en-US')] },
    });
    await type('不存在的菜单');
    expect(emptyLi().text()).toBe(menuEnUS.noResults);
  });

  it('有匹配结果或未搜索时不渲染空态', async () => {
    wrapper = mountMenu({ props: { items: ITEMS, searchable: true } });
    expect(emptyLi().exists()).toBe(false);

    await type('a1');
    expect(emptyLi().exists()).toBe(false);
  });

  it('未传 items 时即便关键字无匹配也不渲染空态', async () => {
    wrapper = mountMenu({ props: { searchable: true } });
    await type('zzz');
    expect(emptyLi().exists()).toBe(false);
  });

  it('语言包包含搜索相关文案', () => {
    for (const pack of [menuZhCN, menuEnUS]) {
      expect(pack.searchPlaceholder).toBeTruthy();
      expect(pack.noResults).toBeTruthy();
    }
  });
});
