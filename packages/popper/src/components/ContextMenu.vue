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
          :aria-label="t.contextMenu"
          @keydown="onMenuKeyDown"
        >
          <slot name="menu" />
        </ul>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { computed, nextTick, provide, ref, watch } from 'vue';
import { createMenuKeyDown } from '../composables/useMenuKeyboard';
import { usePopper } from '../composables/usePopper';
import { usePopperTrigger, createVirtualElement } from '../composables/usePopperTrigger';
import { useZIndex } from '../composables/useZIndex';
import { locale as popperLocale } from '../locale';
import { DROPDOWN_INJECTION_KEY } from '../types';
import type { ContextMenuProps, ContextMenuEmits, ContextMenuExpose } from '../types';

defineOptions({
  name: 'AixContextMenu',
});

const props = withDefaults(defineProps<ContextMenuProps>(), {
  trigger: 'contextmenu',
  disabled: false,
  teleportTo: 'body',
  teleportDisabled: false,
});

const emit = defineEmits<ContextMenuEmits>();

// i18n：跟随 @aix/hooks 全局 locale（业务方通过 createLocale 注入），未设置时默认 zh-CN
const { t } = useLocale(popperLocale);

// 模板 ref
const floatingElRef = ref<HTMLElement | null>(null);

// 核心定位（strategy: fixed 适合右键菜单）
//
// autoUpdateOptions：当 reference 为真实 DOM 元素（show(el) 路径）时，元素可能被 CSS transform
// 持续平移（典型场景：vue-flow fitView 动画），floating-ui 默认的 layoutShift 检测频率不够，
// 需要开启 animationFrame 模式让定位每帧同步。虚拟元素（鼠标坐标 / contextmenu 自动监听）
// 永不移动，保持默认即可。
//
// 注意：此 getter 仅在 whileElementsMounted 触发时被读取一次（即 isOpen 由 false→true 时），
// 因此 show/hide 两条路径切换 reference 类型都会被覆盖（包括 contextmenu 自动监听绕过 show()
// 直接给 referenceRef 赋虚拟元素的场景）。
const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: 'bottom-start',
  strategy: 'fixed',
  offset: 4,
  arrow: false,
  flip: true,
  shift: true,
  autoUpdateOptions: () =>
    referenceRef.value instanceof Element ? { animationFrame: true } : undefined,
});

// 桥接 refs（triggerRef 不桥接——contextmenu 模式使用虚拟元素定位，不需要真实触发元素作为 reference）
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

// 触发器：复用 usePopperTrigger 的 contextmenu/manual 逻辑（虚拟元素定位 + Escape + 点击外部关闭）
const {
  isOpen,
  show: triggerShow,
  hide,
  referenceListeners,
} = usePopperTrigger({
  trigger: () => props.trigger,
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

// expose 的 show 支持两种锚定方式：
// - MouseEvent：按鼠标坐标定位（虚拟元素，位置固定，适合右键菜单）；
// - HTMLElement：以真实元素为锚，floating-ui 的 autoUpdate (默认 layoutShift)
//   会跟随元素位移自动重定位（适合点击节点弹菜单，后续节点被 fitView/滚动等移动的场景）。
function show(target: MouseEvent | HTMLElement) {
  if (target instanceof Element) {
    referenceRef.value = target as HTMLElement;
  } else {
    referenceRef.value = createVirtualElement(target.clientX, target.clientY);
  }
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

defineExpose({
  show,
  hide,
} satisfies ContextMenuExpose);
</script>
