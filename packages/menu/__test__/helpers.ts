import { DOMWrapper, mount, type ComponentMountingOptions } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { Menu, type MenuItemData } from '../src';

export const IconStub = defineComponent({
  name: 'IconStub',
  setup: () => () => h('svg', { class: 'icon-stub' }),
});

export const ITEMS: MenuItemData[] = [
  { key: 'home', label: '首页', icon: IconStub, meta: { route: '/' } },
  { key: 'divider-1', type: 'divider' },
  {
    key: 'group-a',
    type: 'group',
    label: '分组 A',
    children: [
      { key: 'a1', label: 'A1' },
      { key: 'a2', label: 'A2', disabled: true },
      {
        key: 'group-a-nested',
        type: 'group',
        label: '嵌套分组',
        children: [{ key: 'a3', label: 'A3' }],
      },
    ],
  },
  {
    key: 'group-b',
    type: 'group',
    label: '分组 B',
    children: [{ key: 'b1', label: 'B1' }],
  },
  {
    key: 'sub',
    label: '子菜单',
    children: [
      { key: 's1', label: 'S1', icon: IconStub },
      { key: 's2', label: 'S2' },
      { key: 'sub-nested', label: '二级子菜单', children: [{ key: 'n1', label: 'N1' }] },
    ],
  },
];

export function mountMenu(options: ComponentMountingOptions<typeof Menu> = {}) {
  return mount(Menu, { attachTo: document.body, ...options });
}

export function cleanupBody() {
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
}

export function queryByText<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
  text: string,
): T | undefined {
  return Array.from(root.querySelectorAll<T>(selector)).find(
    (el) => el.textContent?.trim() === text,
  );
}

export function getByText<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
  text: string,
): T {
  const el = queryByText<T>(root, selector, text);
  if (!el) throw new Error(`未找到 ${selector} "${text}"`);
  return el;
}

export function itemButton(root: ParentNode, label: string) {
  return getByText<HTMLButtonElement>(root, '.aix-menu-item__button', label);
}

export function itemLi(root: ParentNode, label: string) {
  return itemButton(root, label).closest<HTMLLIElement>('.aix-menu-item')!;
}

export function groupTitle(root: ParentNode, title: string) {
  return getByText(root, '.aix-menu-group__title', title);
}

export function groupLi(root: ParentNode, title: string) {
  return groupTitle(root, title).closest<HTMLLIElement>('.aix-menu-group')!;
}

export function groupList(root: ParentNode, title: string) {
  return groupLi(root, title).querySelector<HTMLUListElement>('.aix-menu-group__list')!;
}

export function isShown(el: HTMLElement) {
  return el.style.display !== 'none';
}

export function subMenuTitle(root: ParentNode, label: string) {
  return getByText<HTMLButtonElement>(root, '.aix-menu-submenu__title', label);
}

export function subMenuLi(root: ParentNode, label: string) {
  return subMenuTitle(root, label).closest<HTMLLIElement>('.aix-menu-submenu')!;
}

export function popups() {
  return Array.from(document.body.querySelectorAll<HTMLElement>('.aix-menu-popup'));
}

export function popup() {
  return document.body.querySelector<HTMLElement>('.aix-menu-popup');
}

export function dom(el: Element) {
  return new DOMWrapper(el);
}

/** jsdom 的 offsetParent 恒为 null，按 display:none 祖先与是否挂载模拟真实布局 */
export function patchOffsetParent() {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.isConnected || this.style.display === 'none') return null;
      for (let el = this.parentElement; el; el = el.parentElement) {
        if (el.style.display === 'none') return null;
      }
      return document.body;
    },
  });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
  };
}

export function click(el: Element, detail = 1) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  return nextTick();
}

export function pointerDown(el: Element, init: PointerEventInit) {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ...init }));
  return nextTick();
}
