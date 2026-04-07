<template>
  <span
    ref="triggerRef"
    class="aix-popover__trigger"
    :aria-expanded="isOpen"
    :aria-controls="isOpen ? popoverId : undefined"
    v-on="referenceListeners"
  >
    <slot name="reference" />
  </span>
  <Teleport :to="teleportTo" :disabled="teleportDisabled">
    <Transition :name="transition" @after-enter="emit('show')" @after-leave="emit('hide')">
      <div
        v-if="isOpen"
        :id="popoverId"
        ref="floatingElRef"
        role="dialog"
        :aria-labelledby="title || $slots.title ? titleId : undefined"
        :class="['aix-popover', popperClass]"
        :style="mergedStyles"
        v-on="floatingListeners"
      >
        <div v-if="title || $slots.title" :id="titleId" class="aix-popover__title">
          <slot name="title">{{ title }}</slot>
        </div>
        <div
          v-if="arrow"
          ref="arrowElRef"
          class="aix-popper__arrow aix-popover__arrow"
          :style="arrowStyles"
        />
        <div class="aix-popover__body">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch, type CSSProperties } from 'vue';
import { usePopper } from '../composables/usePopper';
import { usePopperTrigger } from '../composables/usePopperTrigger';
import { useZIndex } from '../composables/useZIndex';
import type { PopoverProps, PopoverEmits, PopoverExpose } from '../types';

defineOptions({
  name: 'AixPopover',
});

const props = withDefaults(defineProps<PopoverProps>(), {
  trigger: 'click',
  placement: 'top',
  arrow: true,
  disabled: false,
  open: undefined,
  offset: 12,
  transition: 'aix-popper-fade',
  teleportTo: 'body',
  teleportDisabled: false,
  showDelay: 100,
  hideDelay: 100,
});

const emit = defineEmits<PopoverEmits>();

// 唯一 ID
const popoverId = `aix-popover-${useId()}`;
const titleId = `${popoverId}-title`;

// 模板 refs
const triggerRef = ref<HTMLElement | null>(null);
const floatingElRef = ref<HTMLElement | null>(null);
const arrowElRef = ref<HTMLElement | null>(null);

// 核心定位
const { referenceRef, floatingRef, arrowRef, floatingStyles, arrowStyles } = usePopper({
  placement: () => props.placement,
  offset: () => props.offset,
  arrow: () => props.arrow,
  arrowSize: 8,
  borderWidth: 1,
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
const { isOpen, show, hide, referenceListeners, floatingListeners } = usePopperTrigger({
  trigger: () => props.trigger,
  disabled: () => props.disabled,
  showDelay: () => (props.trigger === 'hover' ? props.showDelay : 0),
  hideDelay: () => (props.trigger === 'hover' ? props.hideDelay : 0),
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

// 样式
const mergedStyles = computed<CSSProperties>(() => {
  const styles: CSSProperties = {
    ...floatingStyles.value,
    zIndex: currentZIndex.value,
  };
  if (props.width) {
    styles.width = typeof props.width === 'number' ? `${props.width}px` : props.width;
  }
  return styles;
});

defineExpose<PopoverExpose>({
  show,
  hide,
});
</script>
