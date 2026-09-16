import type { Namespace } from '@aix/hooks';
import { inject, type InjectionKey, type Ref, type Slots } from 'vue';
import type { MenuPopupPlacement, MenuSelectPayload, MenuTheme } from '../types';

export interface MenuContext {
  ns: Namespace;
  theme: Ref<MenuTheme>;
  selectedKey: Ref<string | undefined>;
  openKeys: Ref<string[]>;
  popupMaxVisible: Ref<number>;
  popupPlacement: Ref<MenuPopupPlacement>;
  popupClass: Ref<string | undefined>;
  /** 搜索关键字非空，分组全部强制展开 */
  searching: Ref<boolean>;
  /** 根组件的插槽，供数据驱动渲染时透传 item / icon / group-title */
  slots: Slots;
  select: (payload: MenuSelectPayload) => void;
  toggleOpen: (key: string) => void;
  isOpen: (key: string) => boolean;
  /** 选中项的 keyPath 是否经过该 key，用于祖先高亮 */
  isInSelectedPath: (key: string) => boolean;
  registerItem: (key: string, path: string[]) => () => void;
  registerGroup: (key: string, path: string[]) => () => void;
  /** 子菜单登记自身路径与后代 key，供弹层未挂载时定位选中项所属子菜单 */
  registerSubMenu: (key: string, path: string[], descendantKeys: Set<string>) => () => void;
}

export interface MenuLevelContext {
  /** 祖先 key 链，最近的祖先在末尾 */
  path: string[];
  /** 所在分组层级：0 根、1 一级分组内、2 二级分组内 */
  groupLevel: number;
  /** 是否位于 flyout 弹层内 */
  inPopup: boolean;
}

export interface SubMenuContext {
  /** 取消本级及所有祖先的延时关闭 */
  keepOpen: () => void;
  /** 本级及所有祖先进入延时关闭 */
  scheduleHide: () => void;
  /** 立即关闭本级及所有祖先 */
  closeAll: () => void;
  /** 本级触发器、本级弹层以及所有后代弹层的根元素 */
  collectElements: () => HTMLElement[];
  addChild: (child: SubMenuContext) => void;
  removeChild: (child: SubMenuContext) => void;
}

export const MENU_INJECTION_KEY: InjectionKey<MenuContext> = Symbol('aix-menu');
export const MENU_LEVEL_INJECTION_KEY: InjectionKey<MenuLevelContext> = Symbol('aix-menu-level');
export const SUBMENU_INJECTION_KEY: InjectionKey<SubMenuContext> = Symbol('aix-menu-submenu');

const ROOT_LEVEL: MenuLevelContext = { path: [], groupLevel: 0, inPopup: false };

export function useMenuContext(): MenuContext {
  const ctx = inject(MENU_INJECTION_KEY, null);
  if (!ctx) {
    throw new Error('[aix-menu] MenuItem / MenuGroup / SubMenu 必须放在 <AixMenu> 内使用');
  }
  return ctx;
}

export function useMenuLevel(): MenuLevelContext {
  return inject(MENU_LEVEL_INJECTION_KEY, ROOT_LEVEL);
}
