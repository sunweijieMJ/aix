<template>
  <slot name="reference" />
  <Teleport :to="teleportTo" :disabled="teleportDisabled">
    <Transition
      :name="transition"
      @before-enter="onBeforeShow"
      @after-enter="onShow"
      @before-leave="onBeforeHide"
      @after-leave="onHide"
    >
      <div
        v-if="isOpen"
        ref="floatingElRef"
        :class="floatingClasses"
        :style="mergedStyles"
      >
        <slot />
        <PopperArrow v-if="arrow" ref="arrowElRef" :style="arrowStyles" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue';
import { usePopper } from '../composables/usePopper';
import type { PopperProps, PopperEmits, PopperExpose } from '../types';
import PopperArrow from './PopperArrow.vue';

defineOptions({
  name: 'AixPopper',
});

const props = withDefaults(defineProps<PopperProps>(), {
  placement: 'bottom',
  strategy: 'absolute',
  offset: 8,
  arrow: false,
  arrowSize: 8,
  flip: true,
  shift: true,
  teleportTo: 'body',
  teleportDisabled: false,
  transition: 'aix-popper-fade',
  disabled: false,
});

const emit = defineEmits<PopperEmits>();

// 内部显示状态
const internalOpen = ref(false);
const isOpen = computed(() => props.open ?? internalOpen.value);

// 核心定位
const {
  referenceRef,
  floatingRef,
  arrowRef,
  floatingStyles,
  arrowStyles,
  placement: resolvedPlacement,
  update,
} = usePopper({
  placement: () => props.placement,
  strategy: () => props.strategy,
  offset: () => props.offset,
  arrow: () => props.arrow,
  arrowSize: () => props.arrowSize,
  flip: () => props.flip,
  shift: () => props.shift,
  additionalMiddleware: () => props.middleware ?? [],
});

// 模板 refs 桥接
const floatingElRef = ref<HTMLElement | null>(null);
const arrowElRef = ref<InstanceType<typeof PopperArrow> | null>(null);

watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

watch(arrowElRef, (instance) => {
  arrowRef.value = instance?.$el ?? null;
});

// 样式合并
const floatingClasses = computed(() => [
  'aix-popper',
  `aix-popper--${resolvedPlacement.value.split('-')[0]}`,
  props.popperClass,
]);

const mergedStyles = computed(() => {
  const base: CSSProperties = { ...floatingStyles.value };
  if (props.zIndex != null) {
    base.zIndex = props.zIndex;
  }
  if (typeof props.popperStyle === 'string') {
    return [base, props.popperStyle];
  }
  if (props.popperStyle) {
    Object.assign(base, props.popperStyle);
  }
  return base;
});

// 过渡事件
function onBeforeShow() {
  emit('before-show');
}

function onShow() {
  emit('show');
}

function onBeforeHide() {
  emit('before-hide');
}

function onHide() {
  emit('hide');
}

// 公开方法（受控模式下只通知外部，不修改内部状态）
function show() {
  if (props.disabled) return;
  if (props.open === undefined) {
    internalOpen.value = true;
  }
  emit('update:open', true);
}

function hide() {
  if (props.open === undefined) {
    internalOpen.value = false;
  }
  emit('update:open', false);
}

defineExpose<PopperExpose>({
  show,
  hide,
  update,
  referenceRef,
});
</script>
