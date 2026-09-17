<template>
  <li :class="classes">
    <button
      type="button"
      :class="ns.e('button')"
      :disabled="disabled"
      :aria-current="active ? 'page' : undefined"
      @click="onClick"
    >
      <MenuItemContent :label="label" :icon="icon">
        <template v-if="$slots.icon" #icon>
          <slot name="icon" />
        </template>
        <template v-if="$slots.default" #default>
          <slot />
        </template>
      </MenuItemContent>
    </button>
  </li>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { computed, inject, onBeforeUnmount, watch } from 'vue';
import { SUBMENU_INJECTION_KEY, useMenuContext, useMenuLevel } from '../composables/useMenuContext';
import type { MenuItemProps } from '../types';
import MenuItemContent from './MenuItemContent.vue';

defineOptions({
  name: 'AixMenuItem',
});

const props = withDefaults(defineProps<MenuItemProps>(), {
  disabled: false,
});

defineSlots<{
  /** 自定义文案内容，替代 label prop */
  default?: () => unknown;
  /** 自定义图标，替代 icon prop */
  icon?: () => unknown;
}>();

const ns = useNamespace('menu-item');
const ctx = useMenuContext();
const level = useMenuLevel();
const subMenu = inject(SUBMENU_INJECTION_KEY, null);

const active = computed(() => ctx.selectedKey.value === props.itemKey);

const classes = computed(() => [
  ns.b(),
  ns.m(`level-${level.groupLevel}`),
  {
    [ns.m('popup')]: level.inPopup,
    [ns.m('active')]: active.value,
    [ns.m('disabled')]: props.disabled,
  },
]);

let unregister = ctx.registerItem(props.itemKey, level.path);
watch(
  () => props.itemKey,
  (itemKey) => {
    unregister();
    unregister = ctx.registerItem(itemKey, level.path);
  },
);
onBeforeUnmount(() => unregister());

function onClick() {
  if (props.disabled) return;
  ctx.select({
    key: props.itemKey,
    keyPath: [...level.path, props.itemKey],
    data: props.data,
  });
  subMenu?.closeAll();
}
</script>
