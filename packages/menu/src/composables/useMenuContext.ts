import type { Namespace } from '@aix/hooks';
import { inject, type InjectionKey, type Ref, type Slots } from 'vue';
import type {
  MenuPopupPlacement,
  MenuPopupTeleportTo,
  MenuSelectPayload,
  MenuTheme,
} from '../types';

/** 根组件下发给全部后代的运行时状态 */
export interface MenuContext {
  /** 根组件的命名空间，子组件据此拼自己的 class */
  ns: Namespace;
  /** 当前配色主题，flyout 弹层挂同名修饰类沿用同一套变量 */
  theme: Ref<MenuTheme>;
  /** 当前选中的叶子项 key */
  selectedKey: Ref<string | undefined>;
  /** 展开的内联分组 key 列表 */
  openKeys: Ref<string[]>;
  /** flyout 单层最多可见项数，超出后弹层内部滚动 */
  popupMaxVisible: Ref<number>;
  /** flyout 弹层相对触发项的位置 */
  popupPlacement: Ref<MenuPopupPlacement>;
  /** 追加到所有 flyout 弹层根节点的 class */
  popupClass: Ref<string | undefined>;
  /** flyout 弹层的 Teleport 目标，false 表示就地渲染 */
  popupTeleportTo: Ref<MenuPopupTeleportTo>;
  /** 搜索关键字非空，分组展开状态改由 isSearchOpen 决定 */
  searching: Ref<boolean>;
  /** 命中文字标色用的关键字；searchHighlight 关闭时恒为空串 */
  highlightKeyword: Ref<string>;
  /** 搜索命中项是否藏在该 key 的 flyout 弹层里，用于触发项显示提示圆点 */
  isSearchHighlighted: (key: string) => boolean;
  /** 搜索期间该分组是否展开；与 openKeys 无关，关键字变化后回到默认 */
  isSearchOpen: (key: string) => boolean;
  /** 搜索期间切换分组展开，不写回 openKeys 也不触发 open-change */
  toggleSearchOpen: (key: string) => void;
  /** 根组件的插槽，供数据驱动渲染时透传 item / icon / group-title */
  slots: Slots;
  /** 选中一个叶子项：更新 selectedKey、抛出 select、展开 keyPath 上的分组 */
  select: (payload: MenuSelectPayload) => void;
  /** 非搜索态下切换分组展开；accordion 开启时会收起同级其他分组 */
  toggleOpen: (key: string) => void;
  /** 非搜索态下该分组是否展开 */
  isOpen: (key: string) => boolean;
  /** 选中项的 keyPath 是否经过该 key，用于祖先高亮 */
  isInSelectedPath: (key: string) => boolean;
  /** 叶子项登记自身祖先链，返回注销函数；选中项定位靠这份登记 */
  registerItem: (key: string, path: string[]) => () => void;
  /** 分组登记自身祖先链，返回注销函数；未受控且非 accordion 时登记即默认展开 */
  registerGroup: (key: string, path: string[]) => () => void;
  /** 子菜单登记自身路径与后代 key 取值函数，供弹层未挂载时定位选中项所属子菜单 */
  registerSubMenu: (key: string, path: string[], descendantKeys: () => Set<string>) => () => void;
}

/** 逐层下发的位置信息，每个分组与弹层都会覆写一份 */
export interface MenuLevelContext {
  /** 祖先 key 链，最近的祖先在末尾；由 getter 逐层求值，祖先 key 变化后即时生效 */
  readonly path: string[];
  /** 所在分组的嵌套层级，0 表示不在任何分组内 */
  groupLevel: number;
  /** 是否位于 flyout 弹层内 */
  inPopup: boolean;
}

/** flyout 子菜单向后代暴露的开关控制，用于整条弹层链联动 */
export interface SubMenuContext {
  /** 取消本级及所有祖先的延时关闭 */
  keepOpen: () => void;
  /** 本级及所有祖先进入延时关闭 */
  scheduleHide: () => void;
  /** 立即关闭本级及所有祖先 */
  closeAll: () => void;
  /** 本级触发器、本级弹层以及所有后代弹层的根元素 */
  collectElements: () => HTMLElement[];
  /** 登记子级子菜单，collectElements 据此汇总整条弹层链 */
  addChild: (child: SubMenuContext) => void;
  /** 注销子级子菜单 */
  removeChild: (child: SubMenuContext) => void;
}

/** 根组件注入 MenuContext */
export const MENU_INJECTION_KEY: InjectionKey<MenuContext> = Symbol('aix-menu');
/** 分组与弹层注入 MenuLevelContext */
export const MENU_LEVEL_INJECTION_KEY: InjectionKey<MenuLevelContext> = Symbol('aix-menu-level');
/** 子菜单注入 SubMenuContext */
export const SUBMENU_INJECTION_KEY: InjectionKey<SubMenuContext> = Symbol('aix-menu-submenu');

/** 不在任何分组与弹层内时的层级信息 */
const ROOT_LEVEL: MenuLevelContext = { path: [], groupLevel: 0, inPopup: false };

/** 取根组件下发的状态，脱离 <AixMenu> 使用时直接抛错 */
export function useMenuContext(): MenuContext {
  const ctx = inject(MENU_INJECTION_KEY, null);
  if (!ctx) {
    throw new Error('[aix-menu] MenuItem / MenuGroup / SubMenu 必须放在 <AixMenu> 内使用');
  }
  return ctx;
}

/** 取所在层级信息；不在任何分组或弹层内时返回根层级 */
export function useMenuLevel(): MenuLevelContext {
  return inject(MENU_LEVEL_INJECTION_KEY, ROOT_LEVEL);
}
