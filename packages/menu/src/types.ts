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
 * 图标来源。
 * - 组件：按 16×16 渲染
 * - 含 `/` 或以 `data:` 开头的字符串：视为图片地址，渲染为 `<img>`
 * - 其他字符串：视为字体图标类名，渲染为带该 class 的 `<i>`
 */
export type MenuIconSource = Component | string;

/** flyout 弹层的挂载目标：选择器或元素传给 Teleport，`false` 就地渲染在触发项所在的 li 内 */
export type MenuPopupTeleportTo = string | HTMLElement | false;

/**
 * 数据驱动节点类型。
 * - `item`：叶子项（默认）；有 `children` 时自动升级为 flyout 子菜单
 * - `group`：内联可折叠分组，`children` 直接展示在侧栏里
 * - `divider`：分割线
 *
 * 分组建议只用一层：分组套分组时两层标题样式一致，层级读不出来，更深的层级用子菜单表达。
 */
export type MenuItemType = 'item' | 'group' | 'divider';

/** 业务透传字段的默认形状 */
export type MenuItemMeta = Record<string, unknown>;

/**
 * 数据驱动写法的菜单节点
 * @typeParam M - `meta` 的类型，随 select 事件与作用域插槽一路透出
 */
export interface MenuItemData<M extends MenuItemMeta = MenuItemMeta> {
  /** 唯一标识，作为 selectedKey / openKeys 的取值 */
  key: string;
  /** 显示文案；`divider` 不需要 */
  label?: string;
  /** 图标：组件、图片地址或字体图标类名；分组节点的图标渲染在标题前 */
  icon?: MenuIconSource;
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
  children?: MenuItemData<M>[];
  /** 业务透传字段（路由、权限码等），组件不解读，随 select 事件原样返回 */
  meta?: M;
}

/** select 事件的载荷 */
export interface MenuSelectPayload<M extends MenuItemMeta = MenuItemMeta> {
  /** 被选中项的 key */
  key: string;
  /** 从最外层祖先到自身的 key 链 */
  keyPath: string[];
  /** 数据驱动模式下的原始节点；复合组件写法下为 undefined */
  data?: MenuItemData<M>;
}

/** 根组件 `item` 作用域插槽参数 */
export interface MenuItemSlotProps<M extends MenuItemMeta = MenuItemMeta> {
  /** 当前渲染的数据节点 */
  item: MenuItemData<M>;
  /** 所在分组的嵌套层级，0 表示不在任何分组内 */
  groupLevel: number;
  /** 是否渲染在 flyout 弹层里 */
  inPopup: boolean;
  /** 是否为当前选中项 */
  active: boolean;
}

/**
 * `resolveSelectedKey` 的匹配函数。
 * 返回 `true` 记 1 分，返回正数按分值比较，其余视为不匹配；分值最高的叶子胜出，同分取先出现的。
 */
export type MenuKeyMatcher<M extends MenuItemMeta = MenuItemMeta> = (
  item: MenuItemData<M>,
  keyPath: string[],
) => boolean | number | undefined;

/** Menu 根组件属性 */
export interface MenuProps<M extends MenuItemMeta = MenuItemMeta> {
  /** 数据驱动的菜单结构；与默认插槽可同时使用 */
  items?: MenuItemData<M>[];
  /** 当前选中项 key（v-model:selectedKey） */
  selectedKey?: string;
  /** 展开的分组 key 列表（v-model:openKeys）。只管理内联分组，flyout 的悬停展开为组件内部状态 */
  openKeys?: string[];
  /**
   * 非受控模式下的展开分组。未传 openKeys 也未传本项时，所有分组默认展开；accordion 开启时不适用，默认全部折叠。
   * 用户手动折叠或展开任一分组之前，本项的变化会重新应用，菜单数据异步到达后再传入也生效
   */
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
   * flyout 弹层的挂载目标。`false` 时弹层就地渲染在触发项所在的 li 内并按 fixed 定位，
   * 适用于微前端严格样式隔离等弹层不能离开组件子树的场景
   * @default 'body'
   */
  popupTeleportTo?: MenuPopupTeleportTo;
  /**
   * 是否显示内置搜索框（位于 header 插槽之下、列表之上）
   * @default false
   */
  searchable?: boolean;
  /** 搜索关键字（v-model:searchValue）。非空时按 label 过滤 items，并按命中位置决定分组展开；复合组件写法只透出事件不过滤 */
  searchValue?: string;
  /** 搜索框占位文案，默认取语言包 */
  searchPlaceholder?: string;
  /**
   * 搜索框有关键字时，右侧显示可点击的清除按钮
   * @default true
   */
  searchClearable?: boolean;
  /** 自定义匹配规则；默认对 label 做不区分大小写的包含匹配 */
  filterMethod?: (item: MenuItemData<M>, keyword: string) => boolean;
  /**
   * 搜索时，命中项藏在 flyout 弹层里的子菜单触发项在箭头前显示提示圆点。只对 items 数据驱动写法生效
   * @default true
   */
  searchHighlight?: boolean;
  /** 宽度（px，v-model:width）。未传且非 resizable 时不设置内联宽度，由外层布局决定；resizable 但未传时从 200 起算 */
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
  /** 宽度持久化的 localStorage 键。有值或换键时读回该键存的宽度，宽度变化后写入，拖拽期间等松手再写 */
  widthStorageKey?: string;
}

/** Menu 根组件事件 */
export interface MenuEmits<M extends MenuItemMeta = MenuItemMeta> {
  /** 选中项变化（v-model:selectedKey） */
  (e: 'update:selectedKey', key: string): void;
  /** 展开的分组列表变化（v-model:openKeys） */
  (e: 'update:openKeys', keys: string[]): void;
  /** 宽度变化（v-model:width），拖拽过程中持续触发 */
  (e: 'update:width', width: number): void;
  /** 搜索框文本变化（v-model:searchValue） */
  (e: 'update:searchValue', value: string): void;
  /** 搜索关键字变化，参数为去除首尾空格后的关键字 */
  (e: 'search', keyword: string): void;
  /** 用户点击叶子项 */
  (e: 'select', payload: MenuSelectPayload<M>): void;
  /** 分组展开状态变化 */
  (e: 'open-change', keys: string[]): void;
}

/** 复合组件写法下 MenuItem 的属性 */
export interface MenuItemProps {
  /** 唯一标识 */
  itemKey: string;
  /** 显示文案；同时作为溢出时 Tooltip 的内容 */
  label?: string;
  /** 图标：组件、图片地址或字体图标类名，16×16 */
  icon?: MenuIconSource;
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;
  /** 数据驱动模式下的原始节点，随 select 事件透出 */
  data?: MenuItemData;
}

/** 复合组件写法下 MenuGroup 的属性 */
export interface MenuGroupProps {
  /** 唯一标识，作为 openKeys 的取值 */
  groupKey: string;
  /** 分组标题 */
  title?: string;
  /** 标题前的图标：组件、图片地址或字体图标类名，16×16 */
  icon?: MenuIconSource;
  /**
   * 是否可折叠。为 false 时始终展开，标题不可点击
   * @default true
   */
  collapsible?: boolean;
}

/** 复合组件写法下 SubMenu 的属性 */
export interface SubMenuProps {
  /** 唯一标识 */
  itemKey: string;
  /** 显示文案 */
  label?: string;
  /** 图标：组件、图片地址或字体图标类名，16×16 */
  icon?: MenuIconSource;
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
