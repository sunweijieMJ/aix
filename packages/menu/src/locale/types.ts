/**
 * Menu 组件国际化配置
 *
 * 菜单项文案由业务通过 items / 插槽提供，这里只放组件自己渲染的文案。
 */
export interface MenuLocale {
  /** 宽度拖拽把手的 aria-label */
  resizeHandle: string;
  /** 内置搜索框占位文案 */
  searchPlaceholder: string;
  /** 搜索无匹配项时的提示 */
  noResults: string;
  /** 搜索框清除按钮的 aria-label */
  searchClear: string;
}
