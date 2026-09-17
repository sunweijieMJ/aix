import { useControllable, useNamespace } from '@aix/hooks';
import { computed, onMounted, ref, shallowReactive, toRef, watch, type Slots } from 'vue';
import type { MenuEmits, MenuItemData, MenuProps, MenuSelectPayload } from '../types';
import type { MenuContext } from './useMenuContext';

interface ItemRecord {
  path: string[];
}

interface SubMenuRecord {
  path: string[];
  descendantKeys: Set<string>;
}

/** 在数据树里查找 key 的祖先链，找不到返回 undefined */
function findPathInItems(
  items: MenuItemData[] | undefined,
  key: string,
  path: string[] = [],
): string[] | undefined {
  if (!items) return undefined;
  for (const node of items) {
    if (node.key === key) return path;
    const found = findPathInItems(node.children, key, [...path, node.key]);
    if (found) return found;
  }
  return undefined;
}

function defaultFilterMethod(item: MenuItemData, keyword: string) {
  return (item.label ?? '').toLowerCase().includes(keyword.toLowerCase());
}

/**
 * 按关键字过滤数据树：自身匹配的节点连同全部子节点保留，
 * 否则只在有匹配后代时保留并收窄 children；分割线不参与搜索。
 * 靠后代才留下的 flyout 子菜单记进 hitKeys——它们的命中项藏在弹层里，列表上看不见。
 */
function filterItems(
  items: MenuItemData[],
  keyword: string,
  match: (item: MenuItemData, keyword: string) => boolean,
  hitKeys: Set<string>,
): MenuItemData[] {
  const result: MenuItemData[] = [];
  for (const node of items) {
    if (node.type === 'divider') continue;
    if (match(node, keyword)) {
      result.push(node);
      continue;
    }
    if (node.children?.length) {
      const children = filterItems(node.children, keyword, match, hitKeys);
      if (children.length) {
        if (node.type !== 'group') hitKeys.add(node.key);
        result.push({ ...node, children });
      }
    }
  }
  return result;
}

export function useMenu(props: MenuProps, emit: MenuEmits, slots: Slots) {
  const ns = useNamespace('menu');

  const { state: selectedKey } = useControllable<string | undefined>({
    prop: () => props.selectedKey,
    defaultValue: undefined,
    onChange: (key) => {
      if (key !== undefined) emit('update:selectedKey', key);
    },
  });

  // 挂载时若既未受控也未给初始值，后续注册进来的分组一律默认展开
  const autoExpand = props.openKeys === undefined && props.defaultOpenKeys === undefined;
  const internalOpenKeys = ref<string[]>(props.defaultOpenKeys ?? []);
  const openKeys = computed(() => props.openKeys ?? internalOpenKeys.value);

  function setOpenKeys(keys: string[]) {
    if (props.openKeys === undefined) internalOpenKeys.value = keys;
    emit('update:openKeys', keys);
    emit('open-change', keys);
  }

  // shallowReactive：get() 返回存入的原对象，注销时才能按记录身份比较
  const items = shallowReactive(new Map<string, ItemRecord>());
  const groups = shallowReactive(new Map<string, string[]>());
  const subMenus = shallowReactive(new Map<string, SubMenuRecord>());
  /** 最近一次用户点选的结果；选中项所在 flyout 关闭后其注册信息随之销毁，祖先高亮靠它兜底 */
  const lastSelected = ref<MenuSelectPayload | null>(null);

  const selectedPath = computed<string[] | undefined>(() => {
    const key = selectedKey.value;
    if (key === undefined) return undefined;
    return (
      items.get(key)?.path ??
      findPathInItems(props.items, key) ??
      findPathInSubMenus(key) ??
      (lastSelected.value?.key === key ? lastSelected.value.keyPath.slice(0, -1) : undefined)
    );
  });

  /** 在子菜单登记表里找包含该 key 的最深一层子菜单，返回到该子菜单为止的祖先链 */
  function findPathInSubMenus(key: string): string[] | undefined {
    let best: string[] | undefined;
    for (const [subKey, record] of subMenus) {
      if (!record.descendantKeys.has(key)) continue;
      const candidate = [...record.path, subKey];
      if (!best || candidate.length > best.length) best = candidate;
    }
    return best;
  }

  function isOpen(key: string) {
    return openKeys.value.includes(key);
  }

  function isSiblingGroup(a: string, b: string) {
    const pa = groups.get(a);
    const pb = groups.get(b);
    return !!pa && !!pb && JSON.stringify(pa) === JSON.stringify(pb);
  }

  function openGroups(keys: string[]) {
    let next = [...openKeys.value];
    let changed = false;
    for (const key of keys) {
      if (next.includes(key)) continue;
      if (props.accordion) next = next.filter((k) => !isSiblingGroup(k, key));
      next.push(key);
      changed = true;
    }
    if (changed) setOpenKeys(next);
  }

  function toggleOpen(key: string) {
    if (isOpen(key)) {
      setOpenKeys(openKeys.value.filter((k) => k !== key));
    } else {
      openGroups([key]);
    }
  }

  /** 展开选中项所经过的全部分组 */
  function reveal() {
    const path = selectedPath.value;
    if (!path) return;
    openGroups(path.filter((k) => groups.has(k)));
  }

  function select(payload: MenuSelectPayload) {
    lastSelected.value = payload;
    selectedKey.value = payload.key;
    emit('select', payload);
    openGroups(payload.keyPath.filter((k) => groups.has(k)));
  }

  function registerItem(key: string, path: string[]) {
    const record: ItemRecord = { path };
    items.set(key, record);
    return () => {
      if (items.get(key) === record) items.delete(key);
    };
  }

  function registerGroup(key: string, path: string[]) {
    groups.set(key, path);
    if (autoExpand && !props.accordion && !internalOpenKeys.value.includes(key)) {
      internalOpenKeys.value = [...internalOpenKeys.value, key];
    }
    return () => {
      groups.delete(key);
    };
  }

  function registerSubMenu(key: string, path: string[], descendantKeys: Set<string>) {
    const record: SubMenuRecord = { path, descendantKeys };
    subMenus.set(key, record);
    return () => {
      if (subMenus.get(key) === record) subMenus.delete(key);
    };
  }

  function isInSelectedPath(key: string) {
    return selectedPath.value?.includes(key) ?? false;
  }

  onMounted(reveal);
  watch(selectedKey, reveal, { flush: 'post' });

  // ---------- 搜索 ----------

  const { state: searchValue } = useControllable<string>({
    prop: () => props.searchValue,
    defaultValue: '',
    onChange: (value) => {
      emit('update:searchValue', value);
      emit('search', value.trim());
    },
  });

  const keyword = computed(() => (props.searchable ? searchValue.value.trim() : ''));
  const searching = computed(() => keyword.value !== '');

  const filtered = computed<{ items: MenuItemData[] | undefined; hitKeys: Set<string> }>(() => {
    const hitKeys = new Set<string>();
    if (!props.items || !searching.value) return { items: props.items, hitKeys };
    const items = filterItems(
      props.items,
      keyword.value,
      props.filterMethod ?? defaultFilterMethod,
      hitKeys,
    );
    return { items, hitKeys };
  });

  const displayItems = computed(() => filtered.value.items);

  const highlightKeyword = computed(() => ((props.searchHighlight ?? true) ? keyword.value : ''));

  function isSearchHighlighted(key: string) {
    return (props.searchHighlight ?? true) && filtered.value.hitKeys.has(key);
  }

  const context: MenuContext = {
    ns,
    theme: computed(() => props.theme ?? 'gray'),
    selectedKey,
    openKeys,
    popupMaxVisible: computed(() => props.popupMaxVisible ?? 9),
    popupPlacement: computed(() => props.popupPlacement ?? 'right-start'),
    popupClass: toRef(props, 'popupClass'),
    searching,
    highlightKeyword,
    isSearchHighlighted,
    slots,
    select,
    toggleOpen,
    isOpen,
    isInSelectedPath,
    registerItem,
    registerGroup,
    registerSubMenu,
  };

  return { ns, context, selectedKey, openKeys, searchValue, searching, displayItems };
}
