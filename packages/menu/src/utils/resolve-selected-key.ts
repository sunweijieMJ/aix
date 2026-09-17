import type { MenuItemData, MenuItemMeta, MenuKeyMatcher } from '../types';

/** 把匹配函数的返回值折算成分值；非正数、false、undefined 一律视为不匹配 */
function toScore(result: boolean | number | undefined): number {
  if (result === true) return 1;
  if (typeof result === 'number' && Number.isFinite(result) && result > 0) return result;
  return 0;
}

/**
 * 在数据树里找出与当前状态（通常是路由）匹配的叶子 key，供 `selectedKey` 取值。
 * 只遍历叶子：分组、分割线与带 children 的子菜单不参与；分值最高的叶子胜出，同分取先出现的。
 *
 * @example
 * ```ts
 * // 精确或子路径匹配，多个命中时路径最长者胜出
 * const selectedKey = computed(() =>
 *   resolveSelectedKey(items, (item) => {
 *     const path = item.meta?.path as string | undefined;
 *     if (!path) return false;
 *     if (route.path === path) return path.length + 1;
 *     return route.path.startsWith(`${path}/`) ? path.length : false;
 *   }),
 * );
 * ```
 */
export function resolveSelectedKey<M extends MenuItemMeta = MenuItemMeta>(
  items: MenuItemData<M>[] | undefined,
  match: MenuKeyMatcher<M>,
): string | undefined {
  let bestKey: string | undefined;
  let bestScore = 0;

  function walk(nodes: MenuItemData<M>[], path: string[]) {
    for (const node of nodes) {
      if (node.type === 'divider') continue;
      if (node.children?.length) {
        walk(node.children, [...path, node.key]);
        continue;
      }
      if (node.type === 'group') continue;
      const score = toScore(match(node, [...path, node.key]));
      if (score > bestScore) {
        bestScore = score;
        bestKey = node.key;
      }
    }
  }

  if (items) walk(items, []);
  return bestKey;
}
