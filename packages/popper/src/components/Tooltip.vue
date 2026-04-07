<template>
  <span
    ref="triggerRef"
    class="aix-tooltip__trigger"
    :aria-describedby="isOpen ? tooltipId : undefined"
    v-on="referenceListeners"
  >
    <slot />
  </span>
  <Teleport :to="teleportTo" :disabled="teleportDisabled">
    <Transition :name="transition" @after-enter="emit('show')" @after-leave="emit('hide')">
      <div
        v-if="isOpen"
        :id="tooltipId"
        ref="floatingElRef"
        role="tooltip"
        class="aix-tooltip"
        :style="mergedStyles"
      >
        <slot name="content">{{ content }}</slot>
        <div ref="arrowElRef" class="aix-popper__arrow" :style="arrowStyles" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { usePopper } from '../composables/usePopper';
import { usePopperTrigger } from '../composables/usePopperTrigger';
import { useZIndex } from '../composables/useZIndex';
import type { TooltipProps, TooltipEmits, TooltipExpose } from '../types';

defineOptions({
  name: 'AixTooltip',
});

const props = withDefaults(defineProps<TooltipProps>(), {
  placement: 'top',
  showDelay: 100,
  hideDelay: 100,
  disabled: false,
  open: undefined,
  arrowSize: 6,
  transition: 'aix-popper-fade',
  teleportTo: 'body',
  teleportDisabled: false,
});

const emit = defineEmits<TooltipEmits>();

// 生成唯一 ID
const tooltipId = `aix-tooltip-${useId()}`;

// 模板 refs
const triggerRef = ref<HTMLElement | null>(null);
const floatingElRef = ref<HTMLElement | null>(null);
const arrowElRef = ref<HTMLElement | null>(null);

// 核心定位
const { referenceRef, floatingRef, arrowRef, floatingStyles, arrowStyles } = usePopper({
  placement: () => props.placement,
  offset: 8,
  arrow: true,
  arrowSize: () => props.arrowSize,
});

// 桥接 refs
watch(triggerRef, (el) => {
  referenceRef.value = el;
});
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});
watch(arrowElRef, (el) => {
  arrowRef.value = el;
});

// 触发器（支持受控模式）
const { isOpen, show, hide, referenceListeners } = usePopperTrigger({
  trigger: 'hover',
  disabled: () => props.disabled,
  showDelay: () => props.showDelay,
  hideDelay: () => props.hideDelay,
  open: () => props.open,
  onOpenChange: (val) => emit('update:open', val),
  referenceRef,
  floatingRef,
});

// 动态 z-index：每次打开时递增，保证最后打开的浮层在最上方
const { currentZIndex, nextZIndex } = useZIndex();
watch(isOpen, (val) => {
  if (val) nextZIndex();
});

const mergedStyles = computed(() => ({
  ...floatingStyles.value,
  zIndex: currentZIndex.value,
}));

defineExpose<TooltipExpose>({
  show,
  hide,
});
</script>
