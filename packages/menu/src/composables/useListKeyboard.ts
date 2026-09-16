import { useNamespace } from '@aix/hooks';

const itemNs = useNamespace('menu-item');
const subMenuNs = useNamespace('menu-submenu');
const groupNs = useNamespace('menu-group');

/** 侧栏列表与 flyout 弹层里可获得焦点的控件 */
export const FOCUSABLE_SELECTOR = [
  `.${itemNs.e('button')}:not(:disabled)`,
  `.${subMenuNs.e('title')}:not(:disabled)`,
  `.${groupNs.e('title')}:not(:disabled)`,
].join(',');

export function getFocusables(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null,
  );
}

export function focusFirst(container: HTMLElement | null) {
  getFocusables(container)[0]?.focus();
}

/**
 * 处理 ↑ / ↓ / Home / End 在同一容器内的焦点移动，首尾循环。
 * 返回值表示事件是否已被消费。
 */
export function handleListNavigation(event: KeyboardEvent, container: HTMLElement | null): boolean {
  const items = getFocusables(container);
  if (!items.length) return false;
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (event.key) {
    case 'ArrowDown':
      next = current < 0 ? 0 : (current + 1) % items.length;
      break;
    case 'ArrowUp':
      next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = items.length - 1;
      break;
    default:
      return false;
  }
  event.preventDefault();
  items[next]?.focus();
  return true;
}
