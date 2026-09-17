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
      <li v-if="showEmpty" :class="ns.e('empty')">{{ t.noResults }}</li>
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

<script setup lang="ts">
import { useControllable, useLocale } from '@aix/hooks';
import { computed, provide, ref, useSlots, watchEffect } from 'vue';
import MenuItems from './components/MenuItems';
import MenuSearch from './components/MenuSearch.vue';
import { handleListNavigation } from './composables/useListKeyboard';
import { useMenu } from './composables/useMenu';
import { MENU_INJECTION_KEY } from './composables/useMenuContext';
import { useMenuResize } from './composables/useMenuResize';
import { locale as menuLocale } from './locale';
import type { MenuEmits, MenuItemData, MenuItemSlotProps, MenuProps } from './types';

defineOptions({
  name: 'AixMenu',
});

const props = withDefaults(defineProps<MenuProps>(), {
  theme: 'gray',
  accordion: false,
  popupMaxVisible: 9,
  popupPlacement: 'right-start',
  searchable: false,
  searchClearable: true,
  searchHighlight: true,
  resizable: false,
  minWidth: 150,
  maxWidth: 300,
});

const emit = defineEmits<MenuEmits>();

defineSlots<{
  /** 复合组件写法的菜单内容，可与 items 同时使用，渲染在 items 之后 */
  default?: () => unknown;
  /** 列表上方区域，设计稿放 logo；内置搜索框渲染在它之下 */
  header?: () => unknown;
  /** 列表下方区域，设计稿放用户行与设置入口 */
  footer?: () => unknown;
  /** 自定义数据驱动叶子项的内容 */
  item?: (props: MenuItemSlotProps) => unknown;
  /** 自定义数据驱动节点的图标 */
  icon?: (props: { item: MenuItemData }) => unknown;
  /** 自定义数据驱动分组的标题 */
  'group-title'?: (props: { item: MenuItemData }) => unknown;
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

// 上下限只约束拖拽，不 resizable 时外部给的 width 原样生效
const rootStyle = computed(() => {
  if (props.resizable) return { width: `${clampedWidth.value}px` };
  return props.width !== undefined ? { width: `${width.value}px` } : undefined;
});

const listRef = ref<HTMLElement | null>(null);

function onListKeydown(event: KeyboardEvent) {
  handleListNavigation(event, listRef.value);
}
</script>
