<template>
  <nav :class="classes" :style="rootStyle">
    <div v-if="$slots.header" :class="ns.e('header')">
      <slot name="header" />
    </div>
    <MenuSearch
      v-if="searchable"
      v-model="searchValue"
      :placeholder="searchPlaceholder ?? t.searchPlaceholder"
      :clearable="searchClearable"
      :clear-label="t.searchClear"
    />
    <ul ref="listRef" :class="ns.e('list')" @keydown="onListKeydown">
      <MenuItems v-if="displayItems" :items="displayItems" />
      <li v-if="showEmpty && !$slots.default" :class="ns.e('empty')">{{ t.noResults }}</li>
      <slot />
    </ul>
    <div v-if="$slots.footer" :class="ns.e('footer')">
      <slot name="footer" />
    </div>
    <div
      v-if="resizable"
      :class="ns.e('resize-handle')"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :aria-label="t.resizeHandle"
      :aria-valuenow="clampedWidth"
      :aria-valuemin="minWidth"
      :aria-valuemax="maxWidth"
      @pointerdown="onPointerDown"
      @keydown="onHandleKeydown"
    />
  </nav>
</template>

<script setup lang="ts" generic="M extends MenuItemMeta">
import { useControllable, useLocale } from '@aix/hooks';
import { computed, provide, ref, useSlots, watch, watchEffect } from 'vue';
import MenuItems from './components/MenuItems';
import MenuSearch from './components/MenuSearch.vue';
import { handleListNavigation } from './composables/useListKeyboard';
import { useMenu } from './composables/useMenu';
import { MENU_INJECTION_KEY } from './composables/useMenuContext';
import { useMenuResize } from './composables/useMenuResize';
import { locale as menuLocale } from './locale';
import type { MenuEmits, MenuItemData, MenuItemMeta, MenuItemSlotProps, MenuProps } from './types';

defineOptions({
  name: 'AixMenu',
});

const props = withDefaults(defineProps<MenuProps<M>>(), {
  theme: 'gray',
  accordion: false,
  popupMaxVisible: 9,
  popupPlacement: 'right-start',
  popupTeleportTo: 'body',
  searchable: false,
  searchClearable: true,
  searchHighlight: true,
  resizable: false,
  minWidth: 150,
  maxWidth: 300,
});

const emit = defineEmits<MenuEmits<M>>();

defineSlots<{
  /** 复合组件写法的菜单内容，可与 items 同时使用，渲染在 items 之后 */
  default?: () => unknown;
  /** 列表上方区域，设计稿放 logo；内置搜索框渲染在它之下 */
  header?: () => unknown;
  /** 列表下方区域，设计稿放用户行与设置入口 */
  footer?: () => unknown;
  /** 自定义数据驱动叶子项的内容 */
  item?: (props: MenuItemSlotProps<M>) => unknown;
  /** 自定义数据驱动节点的图标，只对带 icon 的节点生效 */
  icon?: (props: { item: MenuItemData<M> }) => unknown;
  /** 自定义数据驱动分组的标题 */
  'group-title'?: (props: { item: MenuItemData<M> }) => unknown;
}>();

const slots = useSlots();
const { t } = useLocale({ name: 'menu', messages: menuLocale });

const { ns, context, searchValue, searching, displayItems } = useMenu(props, emit, slots);
provide(MENU_INJECTION_KEY, context);

const showEmpty = computed(
  () => searching.value && displayItems.value !== undefined && displayItems.value.length === 0,
);

const { state: width } = useControllable<number>({
  prop: () => props.width,
  defaultValue: 200,
  onChange: (value) => emit('update:width', value),
});

const {
  dragging,
  clampedWidth,
  onPointerDown,
  onKeyDown: onHandleKeydown,
} = useMenuResize({
  width,
  minWidth: () => props.minWidth,
  maxWidth: () => props.maxWidth,
});

// ---------- 宽度持久化 ----------

function readStoredWidth(key: string): number | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    // 空串、纯空格与非正数都会把侧栏压成 0px 或负宽，按「没存过」处理
    if (raw === null || raw === undefined || raw.trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredWidth(key: string, value: number) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // 隐私模式或配额受限时放弃持久化，宽度仍在内存里生效
  }
}

/** 当前 key 下是否读回了持久化宽度；非 resizable 且未传 width 时，靠它决定要不要设内联宽度 */
const storedWidthApplied = ref(false);

function applyStoredWidth(key: string | undefined) {
  const stored = key ? readStoredWidth(key) : undefined;
  storedWidthApplied.value = stored !== undefined;
  if (stored !== undefined) width.value = stored;
}

applyStoredWidth(props.widthStorageKey);

// key 常由异步数据拼出，换 key 是换一份记录：按新 key 读回，不能把当前宽度写进去覆盖已存值
watch(() => props.widthStorageKey, applyStoredWidth);

// 拖拽中每个 pointermove 都会改 width，松手后再落盘，避免逐帧同步写 localStorage
watch([width, dragging], ([value, isDragging]) => {
  const key = props.widthStorageKey;
  if (key && !isDragging) writeStoredWidth(key, value);
});

const classes = computed(() => [
  ns.b(),
  ns.m(props.theme),
  {
    [ns.m('resizable')]: props.resizable,
    [ns.m('dragging')]: dragging.value,
  },
]);

// 越界的 width 收回区间并通知外部，避免渲染宽度与 v-model 取值、aria-valuenow 长期不一致
watchEffect(
  () => {
    if (props.resizable && width.value !== clampedWidth.value) width.value = clampedWidth.value;
  },
  { flush: 'post' },
);

// 上下限只约束拖拽，不 resizable 时外部给的 width 或读回的持久化宽度原样生效
const rootStyle = computed(() => {
  if (props.resizable) return { width: `${clampedWidth.value}px` };
  if (props.width !== undefined || storedWidthApplied.value) {
    return { width: `${width.value}px` };
  }
  return undefined;
});

const listRef = ref<HTMLElement | null>(null);

function onListKeydown(event: KeyboardEvent) {
  handleListNavigation(event, listRef.value);
}
</script>
