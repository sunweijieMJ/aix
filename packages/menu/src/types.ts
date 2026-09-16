import type { Component } from 'vue';

/**
 * 内置主题名。传入其他字符串时组件只追加 `aix-menu--<theme>` 修饰类，
 * 由业务侧自行定义对应的 `--aix-menu-*` 变量。
 */
export type MenuTheme = 'gray' | 'white' | 'glass-light' | 'glass-dark' | (string & {});

/** flyout 弹层相对触发项的位置 */
export type MenuPopupPlacement =
  'right-start' | 'right' | 'right-end' | 'left-start' | 'left' | 'left-end';

/**
 * 数据驱动节点类型。
 * - `item`：叶子项（默认）；有 `children` 时自动升级为 flyout 子菜单
 * - `group`：内联可折叠分组，`children` 直接展示在侧栏里
 * - `divider`：分割线
 */
export type MenuItemType = 'item' | 'group' | 'divider';

export interface MenuItemData {
  /** 唯一标识，作为 selectedKey / openKeys 的取值 */
  key: string;
  /** 显示文案；`divider` 不需要 */
  label?: string;
  /** 图标组件，16×16 */
  icon?: Component;
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;
  /**
   * 节点类型
   * @default 'item'
   */
  type?: MenuItemType;
  /** 子节点 */
  children?: MenuItemData[];
  /** 业务透传字段（路由、权限码等），组件不解读，随 select 事件原样返回 */
  meta?: Record<string, unknown>;
}

export interface MenuSelectPayload {
  /** 被选中项的 key */
  key: string;
  /** 从最外层祖先到自身的 key 链 */
  keyPath: string[];
  /** 数据驱动模式下的原始节点；复合组件写法下为 undefined */
  data?: MenuItemData;
}

/** 根组件 `item` 作用域插槽参数 */
export interface MenuItemSlotProps {
  item: MenuItemData;
  /** 所在分组层级：0 根、1 一级分组内、2 二级分组内 */
  groupLevel: number;
  /** 是否渲染在 flyout 弹层里 */
  inPopup: boolean;
  active: boolean;
}

export interface MenuProps {
  /** 数据驱动的菜单结构；与默认插槽可同时使用 */
  items?: MenuItemData[];
  /** 当前选中项 key（v-model:selectedKey） */
  selectedKey?: string;
  /** 展开的分组 key 列表（v-model:openKeys）。只管理内联分组，flyout 的悬停展开为组件内部状态 */
  openKeys?: string[];
  /** 非受控模式下的初始展开分组。未传 openKeys 也未传本项时，所有分组默认展开；accordion 开启时不适用，默认全部折叠 */
  defaultOpenKeys?: string[];
  /**
   * 配色主题
   * @default 'gray'
   */
  theme?: MenuTheme;
  /**
   * 同一层级的分组只允许展开一个
   * @default false
   */
  accordion?: boolean;
  /**
   * flyout 单层最多可见项数，超出后弹层内部滚动
   * @default 9
   */
  popupMaxVisible?: number;
  /**
   * flyout 弹层位置
   * @default 'right-start'
   */
  popupPlacement?: MenuPopupPlacement;
  /** 追加到所有 flyout 弹层根节点的 class */
  popupClass?: string;
  /**
   * 是否显示内置搜索框（位于 header 插槽之下、列表之上）
   * @default false
   */
  searchable?: boolean;
  /** 搜索关键字（v-model:searchValue）。非空时按 label 过滤 items 并展开全部分组；复合组件写法只透出事件不过滤 */
  searchValue?: string;
  /** 搜索框占位文案，默认取语言包 */
  searchPlaceholder?: string;
  /** 自定义匹配规则；默认对 label 做不区分大小写的包含匹配 */
  filterMethod?: (item: MenuItemData, keyword: string) => boolean;
  /** 宽度（px，v-model:width）。未传且非 resizable 时不设置内联宽度，由外层布局决定 */
  width?: number;
  /**
   * 是否允许拖拽右边缘调整宽度
   * @default false
   */
  resizable?: boolean;
  /**
   * 可拖拽的最小宽度（px）
   * @default 150
   */
  minWidth?: number;
  /**
   * 可拖拽的最大宽度（px）
   * @default 300
   */
  maxWidth?: number;
}

export interface MenuEmits {
  (e: 'update:selectedKey', key: string): void;
  (e: 'update:openKeys', keys: string[]): void;
  (e: 'update:width', width: number): void;
  (e: 'update:searchValue', value: string): void;
  /** 搜索关键字变化 */
  (e: 'search', keyword: string): void;
  /** 用户点击叶子项 */
  (e: 'select', payload: MenuSelectPayload): void;
  /** 分组展开状态变化 */
  (e: 'open-change', keys: string[]): void;
}

export interface MenuItemProps {
  /** 唯一标识 */
  itemKey: string;
  /** 显示文案；同时作为溢出时 Tooltip 的内容 */
  label?: string;
  /** 图标组件，16×16 */
  icon?: Component;
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;
  /** 数据驱动模式下的原始节点，随 select 事件透出 */
  data?: MenuItemData;
}

export interface MenuGroupProps {
  /** 唯一标识，作为 openKeys 的取值 */
  groupKey: string;
  /** 分组标题 */
  title?: string;
  /**
   * 是否可折叠。为 false 时始终展开，标题不可点击
   * @default true
   */
  collapsible?: boolean;
}

export interface SubMenuProps {
  /** 唯一标识 */
  itemKey: string;
  /** 显示文案 */
  label?: string;
  /** 图标组件，16×16 */
  icon?: Component;
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;
  /**
   * 弹层内的子项是否带图标，决定弹层宽度（158 / 182）
   * @default false
   */
  popupWithIcon?: boolean;
  /** 追加到本弹层根节点的 class */
  popupClass?: string;
  /** 数据驱动模式下的原始节点 */
  data?: MenuItemData;
}
