<template>
  <li :class="classes" @mouseenter="show" @mouseleave="onTriggerLeave">
    <button
      ref="triggerRef"
      type="button"
      :class="ns.e('title')"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="true"
      :aria-controls="open ? popupId : undefined"
      @click="onTriggerClick"
      @keydown="onTriggerKeydown"
    >
      <MenuItemContent :label="label" :icon="icon">
        <template v-if="$slots.icon" #icon>
          <slot name="icon" />
        </template>
        <template #suffix>
          <MenuIcon :src="chevronRight" :class="ns.e('arrow')" />
        </template>
        <template v-if="$slots.title" #default>
          <slot name="title" />
        </template>
      </MenuItemContent>
    </button>
    <Teleport to="body">
      <Transition name="aix-popper-fade">
        <div
          v-if="open"
          :id="popupId"
          ref="popupRef"
          :class="popupClasses"
          :style="popupStyle"
          @mouseenter="keepOpen"
          @mouseleave="scheduleHide"
          @keydown="onPopupKeydown"
          @focusout="onPopupFocusout"
        >
          <ul :class="popupNs.e('list')" :style="listStyle">
            <slot />
          </ul>
        </div>
      </Transition>
    </Teleport>
  </li>
</template>

<script setup lang="ts">
import { useClickOutside, useId, useNamespace, useTimeout, useZIndex } from '@aix/hooks';
import { usePopper } from '@aix/popper';
import {
  computed,
  inject,
  isVNode,
  nextTick,
  onBeforeUnmount,
  provide,
  ref,
  useSlots,
  watch,
  type Slots,
} from 'vue';
import chevronRight from '../assets/chevron-right.svg';
import { focusFirst, handleListNavigation } from '../composables/useListKeyboard';
import {
  MENU_LEVEL_INJECTION_KEY,
  SUBMENU_INJECTION_KEY,
  useMenuContext,
  useMenuLevel,
  type SubMenuContext,
} from '../composables/useMenuContext';
import type { SubMenuProps } from '../types';
import MenuIcon from './MenuIcon.vue';
import MenuItemContent from './MenuItemContent.vue';

defineOptions({
  name: 'AixSubMenu',
});

const props = withDefaults(defineProps<SubMenuProps>(), {
  disabled: false,
  popupWithIcon: false,
});

defineSlots<{
  /** 弹层内的子项 */
  default?: () => unknown;
  /** 自定义触发项文案，替代 label prop */
  title?: () => unknown;
  /** 自定义触发项图标，替代 icon prop */
  icon?: () => unknown;
}>();

/** 指针进入触发项到弹层展开的延时（ms） */
const SHOW_DELAY = 100;
/** 指针离开到弹层收起的延时（ms），留出指针斜穿到弹层的时间 */
const HIDE_DELAY = 150;
/** 读不到 --aix-menu-popup-offset 时的兜底值，与样式里的默认值一致 */
const POPUP_OFFSET = 4;

const ns = useNamespace('menu-submenu');
const popupNs = useNamespace('menu-popup');
const ctx = useMenuContext();
const parentLevel = useMenuLevel();
const parentSubMenu = inject(SUBMENU_INJECTION_KEY, null);
const slots = useSlots();
const popupId = `aix-menu-popup-${useId()}`;

provide(MENU_LEVEL_INJECTION_KEY, {
  path: [...parentLevel.path, props.itemKey],
  groupLevel: 0,
  inPopup: true,
});

// ---------- 后代 key 登记 ----------

/**
 * 从默认插槽的 vnode 树里收集后代 itemKey。弹层关闭时子项并未挂载，
 * 复合组件写法下祖先高亮与 reveal 需要靠这份登记找到选中项所属的子菜单。
 */
function collectDescendantKeys(nodes: unknown, keys: Set<string>) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!isVNode(node)) continue;
    const key = node.props?.itemKey ?? node.props?.['item-key'];
    if (typeof key === 'string') keys.add(key);
    const children = node.children;
    if (Array.isArray(children)) {
      collectDescendantKeys(children, keys);
    } else if (children && typeof (children as Slots).default === 'function') {
      collectDescendantKeys((children as Slots).default?.(), keys);
    }
  }
}

const descendantKeys = new Set<string>();
try {
  collectDescendantKeys(slots.default?.(), descendantKeys);
} catch {
  // 插槽内容无法在渲染前展开时放弃登记，高亮退回运行时注册表
}
onBeforeUnmount(ctx.registerSubMenu(props.itemKey, parentLevel.path, descendantKeys));

// ---------- 打开 / 关闭 ----------

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const popupRef = ref<HTMLElement | null>(null);

const showTimer = useTimeout(() => {
  open.value = true;
}, SHOW_DELAY);
const hideTimer = useTimeout(() => {
  open.value = false;
}, HIDE_DELAY);

function openNow() {
  if (props.disabled) return;
  showTimer.stop();
  hideTimer.stop();
  parentSubMenu?.keepOpen();
  open.value = true;
}

function closeNow() {
  showTimer.stop();
  hideTimer.stop();
  open.value = false;
}

function show() {
  if (props.disabled) return;
  hideTimer.stop();
  parentSubMenu?.keepOpen();
  if (!open.value && !showTimer.isPending.value) showTimer.start();
}

function keepOpen() {
  hideTimer.stop();
  parentSubMenu?.keepOpen();
}

/** 指针离开触发项：只关本级。祖先弹层仍在指针之下，不能跟着进入延时关闭 */
function onTriggerLeave() {
  showTimer.stop();
  if (open.value) hideTimer.start();
}

/** 指针离开弹层：本级与所有祖先一起进入延时关闭；移回祖先弹层时由其 mouseenter 撤销 */
function scheduleHide() {
  showTimer.stop();
  if (open.value) hideTimer.start();
  parentSubMenu?.scheduleHide();
}

function closeAll() {
  closeNow();
  parentSubMenu?.closeAll();
}

// 子级弹层被 Teleport 到 body，DOM 上不在本弹层之内；焦点 / 指针落在子级弹层时要视作仍在本级内部
const childContexts = new Set<SubMenuContext>();

function collectElements(): HTMLElement[] {
  const elements: HTMLElement[] = [];
  if (triggerRef.value) elements.push(triggerRef.value);
  if (popupRef.value) elements.push(popupRef.value);
  for (const child of childContexts) elements.push(...child.collectElements());
  return elements;
}

function containsElement(el: Node | null): boolean {
  return !!el && collectElements().some((element) => element.contains(el));
}

const selfContext: SubMenuContext = {
  keepOpen,
  scheduleHide,
  closeAll,
  collectElements,
  addChild: (child) => childContexts.add(child),
  removeChild: (child) => childContexts.delete(child),
};
provide(SUBMENU_INJECTION_KEY, selfContext);
parentSubMenu?.addChild(selfContext);
onBeforeUnmount(() => parentSubMenu?.removeChild(selfContext));

// 点击弹层链之外的任意位置关闭：触屏没有 hover，这是弹层唯一稳定的退出通道
useClickOutside({
  excludeRefs: collectElements,
  handler: closeNow,
  enabled: open,
});

// ---------- 定位 ----------

// floating-ui 的 offset 只认数字，打开时算一次
const popupOffset = ref(POPUP_OFFSET);

/**
 * --aix-menu-popup-offset 说的是弹层到容器边缘的留白，而 floating-ui 量的是弹层到触发项。
 * 触发项被内边距、滚动条挤进来多少由实测得出，避免跟着变量口径推算。
 */
function readPopupOffset() {
  const el = triggerRef.value;
  if (!el) return POPUP_OFFSET;
  const raw = Number.parseFloat(getComputedStyle(el).getPropertyValue('--aix-menu-popup-offset'));
  const gap = Number.isFinite(raw) ? raw : POPUP_OFFSET;

  const container = el.closest<HTMLElement>(`.${popupNs.b()}, .${ctx.ns.b()}`);
  if (!container) return gap;
  const trigger = el.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  const inset = ctx.popupPlacement.value.startsWith('left')
    ? trigger.left - box.left
    : box.right - trigger.right;
  return gap + Math.max(0, inset);
}

const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: () => ctx.popupPlacement.value,
  offset: () => popupOffset.value,
  arrow: false,
});

watch(triggerRef, (el) => {
  referenceRef.value = el;
});
watch(popupRef, (el) => {
  floatingRef.value = el;
});

const { currentZIndex, nextZIndex } = useZIndex();
watch(open, (value) => {
  if (!value) return;
  nextZIndex();
  popupOffset.value = readPopupOffset();
});

const popupStyle = computed(() => ({
  ...floatingStyles.value,
  zIndex: currentZIndex.value,
}));

const listStyle = computed(() => ({
  '--aix-menu-popup-max-visible': String(ctx.popupMaxVisible.value),
}));

// ---------- 样式 ----------

const active = computed(() => ctx.isInSelectedPath(props.itemKey));
const highlighted = computed(() => ctx.isSearchHighlighted(props.itemKey));

const classes = computed(() => [
  ns.b(),
  ns.m(`level-${parentLevel.groupLevel}`),
  {
    [ns.m('popup')]: parentLevel.inPopup,
    [ns.m('highlight')]: highlighted.value,
    [ns.m('open')]: open.value,
    [ns.m('active')]: active.value,
    [ns.m('disabled')]: props.disabled,
  },
]);

const popupClasses = computed(() => [
  popupNs.b(),
  popupNs.m(ctx.theme.value),
  {
    [popupNs.m('with-icon')]: props.popupWithIcon,
  },
  ctx.popupClass.value,
  props.popupClass,
]);

// ---------- 交互 ----------

function focusFirstItem() {
  nextTick(() => focusFirst(popupRef.value));
}

/** 点击只负责打开（触屏没有 hover），关闭交给指针离开 / 点击外部 / Esc / 选中子项 */
function onTriggerClick(event: MouseEvent) {
  if (open.value) return;
  openNow();
  // detail 为 0 说明由键盘 Enter / Space 触发，顺手把焦点交给第一个子项
  if (event.detail === 0) focusFirstItem();
}

/** → 打开弹层并把焦点交给第一项，Esc 关闭本级 */
function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    openNow();
    focusFirstItem();
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    closeNow();
  }
}

/** ← / Esc 关闭本级并把焦点还给触发项，其余交给列表内的上下移动 */
function onPopupKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' || event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeNow();
    triggerRef.value?.focus();
    return;
  }
  handleListNavigation(event, popupRef.value);
}

/** 焦点离开整条弹层链时立即关闭本级 */
function onPopupFocusout(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (next && !containsElement(next)) closeNow();
}
</script>
