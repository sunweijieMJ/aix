import { useControllable, useNamespace } from '@aix/hooks';
import { computed, onMounted, ref, shallowReactive, toRef, watch, type Slots } from 'vue';
import type { MenuEmits, MenuItemData, MenuItemMeta, MenuProps, MenuSelectPayload } from '../types';
import type { MenuContext } from './useMenuContext';

/** 叶子项的登记信息 */
interface ItemRecord {
  /** 祖先 key 链，最近的祖先在末尾 */
  path: string[];
}

/** 子菜单的登记信息 */
interface SubMenuRecord {
  /** 祖先 key 链，最近的祖先在末尾 */
  path: string[];
  /** 弹层内全部后代的 key，弹层未挂载时靠它定位选中项；插槽内容变化后取值随之更新 */
  descendantKeys: () => Set<string>;
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

/** 两份 key 列表内容是否相同 */
function sameKeys(a: string[] | undefined, b: string[] | undefined) {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** 默认匹配规则：对 label 做不区分大小写的包含匹配 */
function defaultFilterMethod<M extends MenuItemMeta>(item: MenuItemData<M>, keyword: string) {
  return (item.label ?? '').toLowerCase().includes(keyword.toLowerCase());
}

/** 一次过滤过程中攒下的命中信息 */
interface SearchHits {
  /** 靠后代才留下的 flyout 子菜单：命中项藏在弹层里，列表上看不见，触发项整行标底 */
  subMenu: Set<string>;
  /**
   * 过滤时走到过的每个内联分组 → 后代里有没有命中。
   * 搜索期间据此决定展开；不在表里的分组说明不是 items 渲染的（复合组件写法），展开状态不受搜索影响。
   */
  group: Map<string, boolean>;
}

/**
 * 按关键字过滤数据树：自身匹配的节点连同全部子节点保留，
 * 否则只在有匹配后代时保留并收窄 children；分割线不参与搜索。
 */
function filterItems<M extends MenuItemMeta>(
  items: MenuItemData<M>[],
  keyword: string,
  match: (item: MenuItemData<M>, keyword: string) => boolean,
  hits: SearchHits,
): MenuItemData<M>[] {
  const result: MenuItemData<M>[] = [];
  for (const node of items) {
    if (node.type === 'divider') continue;

    const selfMatch = match(node, keyword);
    const children = node.children?.length ? filterItems(node.children, keyword, match, hits) : [];

    // 自身命中的节点整棵子树都会展示，其中没命中的子分组同样要登记，才收得起来
    if (node.type === 'group') hits.group.set(node.key, children.length > 0);

    if (selfMatch) {
      result.push(node);
      continue;
    }
    if (children.length) {
      if (node.type !== 'group') hits.subMenu.add(node.key);
      result.push({ ...node, children });
    }
  }
  return result;
}

/**
 * 组装根组件的全部运行时状态：选中、展开、搜索过滤与各类登记表，
 * 结果通过 MenuContext 下发给后代。
 */
export function useMenu<M extends MenuItemMeta>(
  props: MenuProps<M>,
  emit: MenuEmits<M>,
  slots: Slots,
) {
  const ns = useNamespace('menu');

  const { state: selectedKey } = useControllable<string | undefined>({
    prop: () => props.selectedKey,
    defaultValue: undefined,
    onChange: (key) => {
      if (key !== undefined) emit('update:selectedKey', key);
    },
  });

  // 既未受控也未给 defaultOpenKeys 时，注册进来的分组一律默认展开
  const autoExpand = computed(
    () => props.openKeys === undefined && props.defaultOpenKeys === undefined,
  );
  /** 已经默认展开过的分组 key，重新登记时不再重复展开 */
  const autoExpanded = new Set<string>();
  const internalOpenKeys = ref<string[]>(props.defaultOpenKeys ?? []);
  const openKeys = computed(() => props.openKeys ?? internalOpenKeys.value);
  /** 用户是否手动折叠或展开过分组；之后 defaultOpenKeys 的变化不再覆盖用户的选择 */
  let openKeysTouched = false;
  /** 已应用过的 defaultOpenKeys 内容；内联字面量随父组件重渲染换身份，按内容判断才不会重复应用 */
  let appliedDefaultOpenKeys = props.defaultOpenKeys ? [...props.defaultOpenKeys] : undefined;

  function setOpenKeys(keys: string[]) {
    if (props.openKeys === undefined) internalOpenKeys.value = keys;
    emit('update:openKeys', keys);
    emit('open-change', keys);
  }

  // 菜单数据常在挂载后异步到达，defaultOpenKeys 随之才有值；用户动手之前按新值重新应用
  watch(
    () => props.defaultOpenKeys,
    (keys) => {
      if (keys === undefined || props.openKeys !== undefined || openKeysTouched) return;
      if (sameKeys(keys, appliedDefaultOpenKeys)) return;
      appliedDefaultOpenKeys = [...keys];
      // 走 setOpenKeys 而非直接赋值：新默认值收起分组时也要通知外部，镜像 open-change 的父组件才不会脱节
      setOpenKeys([...keys]);
      reveal();
    },
  );

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
      if (!record.descendantKeys().has(key)) continue;
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
    openKeysTouched = true;
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
    // 子组件登记的 data 按默认 meta 类型声明，回传给根组件时收窄到其泛型参数
    emit('select', payload as MenuSelectPayload<M>);
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
    // 存副本而非入参：根层级下发的是同一个共享空数组，拿它当身份会误删同级分组的登记
    const record = [...path];
    groups.set(key, record);
    // 只在首次登记时默认展开；改 key / 改祖先路径引起的重新登记不能推翻用户已折叠的状态
    if (autoExpand.value && !props.accordion && !autoExpanded.has(key)) {
      autoExpanded.add(key);
      if (!internalOpenKeys.value.includes(key)) {
        internalOpenKeys.value = [...internalOpenKeys.value, key];
      }
    }
    return () => {
      if (groups.get(key) === record) groups.delete(key);
    };
  }

  function registerSubMenu(key: string, path: string[], descendantKeys: () => Set<string>) {
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

  const filtered = computed<{ items: MenuItemData<M>[] | undefined; hits: SearchHits }>(() => {
    const hits: SearchHits = { subMenu: new Set(), group: new Map() };
    if (!props.items || !searching.value) return { items: props.items, hits };
    const items = filterItems(
      props.items,
      keyword.value,
      props.filterMethod ?? defaultFilterMethod,
      hits,
    );
    return { items, hits };
  });

  const displayItems = computed(() => filtered.value.items);

  const highlightKeyword = computed(() => ((props.searchHighlight ?? true) ? keyword.value : ''));

  function isSearchHighlighted(key: string) {
    return (props.searchHighlight ?? true) && filtered.value.hits.subMenu.has(key);
  }

  // 搜索期间的展开状态与 openKeys 无关：默认只展开有命中后代的分组，
  // 标题自身命中的分组收起（子项与关键字无关，摊开只是噪音），用户仍可手动展开。
  // 这份覆盖随关键字变化清空，也不写回 openKeys。
  const searchOpenOverrides = ref<Record<string, boolean>>({});
  watch(keyword, () => {
    searchOpenOverrides.value = {};
  });

  function isSearchOpen(key: string) {
    const byHit = filtered.value.hits.group.get(key);
    if (byHit === undefined) return isOpen(key);
    return searchOpenOverrides.value[key] ?? byHit;
  }

  function toggleSearchOpen(key: string) {
    if (!filtered.value.hits.group.has(key)) {
      toggleOpen(key);
      return;
    }
    searchOpenOverrides.value = { ...searchOpenOverrides.value, [key]: !isSearchOpen(key) };
  }

  const context: MenuContext = {
    ns,
    theme: computed(() => props.theme ?? 'gray'),
    selectedKey,
    openKeys,
    popupMaxVisible: computed(() => props.popupMaxVisible ?? 9),
    popupPlacement: computed(() => props.popupPlacement ?? 'right-start'),
    popupClass: toRef(props, 'popupClass'),
    popupTeleportTo: computed(() => props.popupTeleportTo ?? 'body'),
    searching,
    highlightKeyword,
    isSearchHighlighted,
    isSearchOpen,
    toggleSearchOpen,
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
