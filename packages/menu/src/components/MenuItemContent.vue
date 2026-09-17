<template>
  <span :class="ns.b()">
    <span v-if="icon || $slots.icon" :class="ns.e('icon')" aria-hidden="true">
      <slot name="icon">
        <component :is="icon" />
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
import { ref, type Component } from 'vue';
import { useTextOverflow } from '../composables/useTextOverflow';
import MenuHighlight from './MenuHighlight.vue';

defineOptions({
  name: 'AixMenuItemContent',
});

const props = defineProps<{
  /** 文案；单行省略被截断时作为 Tooltip 内容 */
  label?: string;
  /** 图标组件，16×16 */
  icon?: Component;
}>();

const ns = useNamespace('menu-item-content');
const tooltipNs = useNamespace('menu-tooltip');
const labelRef = ref<HTMLElement | null>(null);
const { overflowed } = useTextOverflow(labelRef, () => props.label);
</script>
