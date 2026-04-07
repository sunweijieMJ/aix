<template>
  <span class="aix-context-menu__trigger" aria-haspopup="menu" v-on="referenceListeners">
    <slot />
  </span>
  <Teleport :to="teleportTo" :disabled="teleportDisabled">
    <Transition
      name="aix-popper-fade"
      @after-enter="emit('visible-change', true)"
      @after-leave="emit('visible-change', false)"
    >
      <div
        v-if="isOpen"
        ref="floatingElRef"
        :class="['aix-context-menu', popperClass]"
        :style="mergedStyles"
      >
        <ul
          class="aix-context-menu__menu"
          role="menu"
          aria-label="上下文菜单"
          @keydown="onMenuKeyDown"
        >
          <slot name="menu" />
        </ul>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, provide, ref, watch } from 'vue';
import { createMenuKeyDown } from '../composables/useMenuKeyboard';
import { usePopper } from '../composables/usePopper';
import { usePopperTrigger, createVirtualElement } from '../composables/usePopperTrigger';
import { useZIndex } from '../composables/useZIndex';
import { DROPDOWN_INJECTION_KEY } from '../types';
import type { ContextMenuProps, ContextMenuEmits, ContextMenuExpose } from '../types';

defineOptions({
  name: 'AixContextMenu',
});

const props = withDefaults(defineProps<ContextMenuProps>(), {
  disabled: false,
  teleportTo: 'body',
  teleportDisabled: false,
});

const emit = defineEmits<ContextMenuEmits>();

// 模板 ref
const floatingElRef = ref<HTMLElement | null>(null);

// 核心定位（strategy: fixed 适合右键菜单）
const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: 'bottom-start',
  strategy: 'fixed',
  offset: 4,
  arrow: false,
  flip: true,
  shift: true,
});

// 桥接 refs（triggerRef 不桥接——contextmenu 模式使用虚拟元素定位，不需要真实触发元素作为 reference）
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

// 触发器：复用 usePopperTrigger 的 contextmenu 逻辑（虚拟元素定位 + Escape + 点击外部关闭）
const {
  isOpen,
  show: triggerShow,
  hide,
  referenceListeners,
} = usePopperTrigger({
  trigger: 'contextmenu',
  disabled: () => props.disabled,
  referenceRef,
  floatingRef,
});

function handleCommand(command?: string | number) {
  if (command != null) {
    emit('command', command);
  }
  hide();
}

provide(DROPDOWN_INJECTION_KEY, { handleItemClick: handleCommand });

// 键盘导航（DropdownItem 渲染 .aix-dropdown__item，使用默认选择器）
const onMenuKeyDown = createMenuKeyDown();

// expose 的 show(event) 需要手动设置虚拟元素后调用 triggerShow
function show(event: MouseEvent) {
  referenceRef.value = createVirtualElement(event.clientX, event.clientY);
  triggerShow();
}

// 动态 z-index：每次打开时递增，保证最后打开的浮层在最上方
const { currentZIndex, nextZIndex } = useZIndex();
watch(isOpen, (val) => {
  if (val) {
    nextZIndex();
    // 菜单打开后聚焦第一个菜单项，启用键盘导航
    nextTick(() => {
      const firstItem = floatingElRef.value?.querySelector<HTMLElement>(
        '.aix-dropdown__item:not(.aix-dropdown__item--disabled)',
      );
      firstItem?.focus();
    });
  }
});

const mergedStyles = computed(() => ({
  ...floatingStyles.value,
  zIndex: currentZIndex.value,
}));

defineExpose<ContextMenuExpose>({
  show,
  hide,
});
</script>
