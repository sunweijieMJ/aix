<template>
  <li :class="classes">
    <component
      :is="collapsible ? 'button' : 'div'"
      :type="collapsible ? 'button' : undefined"
      :class="ns.e('title')"
      :aria-expanded="collapsible ? open : undefined"
      :aria-controls="collapsible ? listId : undefined"
      @click="onToggle"
    >
      <MenuIcon v-if="collapsible" :src="chevronDown" :class="ns.e('arrow')" />
      <span v-if="showGroupIcon && (icon || $slots.icon)" :class="ns.e('icon')" aria-hidden="true">
        <slot name="icon">
          <MenuItemIcon v-if="icon" :icon="icon" />
        </slot>
      </span>
      <Tooltip
        :content="title"
        :disabled="!overflowed || !title"
        placement="top"
        :show-delay="200"
        :popper-class="tooltipNs.b()"
      >
        <span ref="titleRef" :class="ns.e('title-text')">
          <slot name="title"><MenuHighlight :text="title" /></slot>
        </span>
      </Tooltip>
      <span :class="ns.e('divider')" aria-hidden="true" />
    </component>
    <ul v-show="open" :id="listId" :class="ns.e('list')">
      <slot />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { useId, useNamespace } from '@aix/hooks';
import { Tooltip } from '@aix/popper';
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue';
import chevronDown from '../assets/chevron-down.svg';
import {
  MENU_LEVEL_INJECTION_KEY,
  useMenuContext,
  useMenuLevel,
} from '../composables/useMenuContext';
import { useTextOverflow } from '../composables/useTextOverflow';
import type { MenuGroupProps } from '../types';
import MenuHighlight from './MenuHighlight.vue';
import MenuIcon from './MenuIcon.vue';
import MenuItemIcon from './MenuItemIcon.vue';

defineOptions({
  name: 'AixMenuGroup',
});

const props = withDefaults(defineProps<MenuGroupProps>(), {
  collapsible: true,
});

defineSlots<{
  /** 分组内的菜单项 */
  default?: () => unknown;
  /** 自定义标题内容，替代 title prop */
  title?: () => unknown;
  /** 自定义标题前的图标，替代 icon prop；需根组件开启 showGroupIcon */
  icon?: () => unknown;
}>();

const ns = useNamespace('menu-group');
const tooltipNs = useNamespace('menu-tooltip');
const ctx = useMenuContext();
const titleRef = ref<HTMLElement | null>(null);
const { overflowed } = useTextOverflow(titleRef, () => props.title);
const parent = useMenuLevel();
const { showGroupIcon } = ctx;
const groupLevel = parent.groupLevel + 1;
const listId = `aix-menu-group-${useId()}`;

provide(MENU_LEVEL_INJECTION_KEY, {
  get path() {
    return [...parent.path, props.groupKey];
  },
  groupLevel,
  inPopup: parent.inPopup,
});

const open = computed(() => {
  if (!props.collapsible) return true;
  return ctx.searching.value ? ctx.isSearchOpen(props.groupKey) : ctx.isOpen(props.groupKey);
});

const classes = computed(() => [
  ns.b(),
  ns.m(`level-${groupLevel}`),
  {
    [ns.m('open')]: open.value,
    [ns.m('static')]: !props.collapsible,
  },
]);

let unregister: (() => void) | undefined;
watch(
  () => [props.collapsible, props.groupKey, ...parent.path].join('\u0000'),
  () => {
    unregister?.();
    unregister = props.collapsible ? ctx.registerGroup(props.groupKey, parent.path) : undefined;
  },
  { immediate: true },
);
onBeforeUnmount(() => unregister?.());

function onToggle() {
  if (!props.collapsible) return;
  if (ctx.searching.value) ctx.toggleSearchOpen(props.groupKey);
  else ctx.toggleOpen(props.groupKey);
}
</script>
