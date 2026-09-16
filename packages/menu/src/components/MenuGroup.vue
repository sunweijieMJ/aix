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
      <span :class="ns.e('title-text')">
        <slot name="title">{{ title }}</slot>
      </span>
      <span :class="ns.e('divider')" aria-hidden="true" />
    </component>
    <ul v-show="open" :id="listId" :class="ns.e('list')">
      <slot />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { useId, useNamespace } from '@aix/hooks';
import { computed, onBeforeUnmount, provide, watch } from 'vue';
import chevronDown from '../assets/chevron-down.svg';
import {
  MENU_LEVEL_INJECTION_KEY,
  useMenuContext,
  useMenuLevel,
} from '../composables/useMenuContext';
import type { MenuGroupProps } from '../types';
import MenuIcon from './MenuIcon.vue';

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
}>();

const ns = useNamespace('menu-group');
const ctx = useMenuContext();
const parent = useMenuLevel();
const groupLevel = parent.groupLevel + 1;
const listId = `aix-menu-group-${useId()}`;

provide(MENU_LEVEL_INJECTION_KEY, {
  path: [...parent.path, props.groupKey],
  groupLevel,
  inPopup: parent.inPopup,
});

const open = computed(
  () => !props.collapsible || ctx.searching.value || ctx.isOpen(props.groupKey),
);

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
  () => props.collapsible,
  (collapsible) => {
    unregister?.();
    unregister = collapsible ? ctx.registerGroup(props.groupKey, parent.path) : undefined;
  },
  { immediate: true },
);
onBeforeUnmount(() => unregister?.());

function onToggle() {
  if (!props.collapsible || ctx.searching.value) return;
  ctx.toggleOpen(props.groupKey);
}
</script>
