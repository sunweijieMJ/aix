<template>
  <span :class="ns.b()">
    <span v-if="icon || $slots.icon" :class="ns.e('icon')" aria-hidden="true">
      <slot name="icon">
        <MenuItemIcon v-if="icon" :icon="icon" />
      </slot>
    </span>
    <Tooltip
      :content="label"
      :disabled="!overflowed || !label"
      placement="top"
      :show-delay="200"
      :popper-class="tooltipNs.b()"
    >
      <span ref="labelRef" :class="ns.e('label')">
        <slot><MenuHighlight :text="label" /></slot>
      </span>
    </Tooltip>
    <span v-if="$slots.suffix" :class="ns.e('suffix')">
      <slot name="suffix" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { Tooltip } from '@aix/popper';
import { ref } from 'vue';
import { useTextOverflow } from '../composables/useTextOverflow';
import type { MenuIconSource } from '../types';
import MenuHighlight from './MenuHighlight.vue';
import MenuItemIcon from './MenuItemIcon.vue';

defineOptions({
  name: 'AixMenuItemContent',
});

const props = defineProps<{
  /** 文案；单行省略被截断时作为 Tooltip 内容 */
  label?: string;
  /** 图标：组件、图片地址或字体图标类名，16×16 */
  icon?: MenuIconSource;
}>();

const ns = useNamespace('menu-item-content');
const tooltipNs = useNamespace('menu-tooltip');
const labelRef = ref<HTMLElement | null>(null);
const { overflowed } = useTextOverflow(labelRef, () => props.label);
</script>
