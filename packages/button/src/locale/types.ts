/**
 * Button 组件国际化配置
 *
 * 按钮的可见文字来自 `<slot />`，由业务侧提供，不属于组件库；
 * 这里只放组件自己渲染、用户无法通过插槽控制的文案——目前是 loading 态的无障碍标签。
 */
export interface ButtonLocale {
  /** loading 态加载图标的 aria-label */
  loadingText: string;
}
