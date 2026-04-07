/** 菜单键盘导航配置 */
export interface MenuKeyboardOptions {
  /** 菜单项 CSS 选择器 */
  itemSelector?: string;
  /** 禁用态菜单项 CSS 选择器 */
  disabledSelector?: string;
  /** Escape 键回调 */
  onEscape?: () => void;
}

const DEFAULT_ITEM_SELECTOR = '.aix-dropdown__item';
const DEFAULT_DISABLED_SELECTOR = '.aix-dropdown__item--disabled';

/**
 * 创建菜单键盘导航处理器
 *
 * 支持 ArrowUp/ArrowDown/Home/End 循环导航，Enter 触发当前项，Escape 关闭菜单。
 * 自动跳过 disabled 项。绑定到 `<ul>` 的 @keydown 事件即可。
 */
export function createMenuKeyDown(
  options: MenuKeyboardOptions = {},
): (event: KeyboardEvent) => void {
  const {
    itemSelector = DEFAULT_ITEM_SELECTOR,
    disabledSelector = DEFAULT_DISABLED_SELECTOR,
    onEscape,
  } = options;

  return (event: KeyboardEvent) => {
    const menu = event.currentTarget as HTMLElement | null;
    if (!menu) return;

    const items = Array.from(
      menu.querySelectorAll<HTMLElement>(`${itemSelector}:not(${disabledSelector})`),
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[currentIndex < 0 ? 0 : (currentIndex + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[currentIndex <= 0 ? items.length - 1 : currentIndex - 1]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        onEscape?.();
        break;
    }
  };
}
