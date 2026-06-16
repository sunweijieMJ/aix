import { useClickOutside, useEventListener, useControllable, useTimeout } from '@aix/hooks';
import { computed, toValue, type Ref, type MaybeRefOrGetter } from 'vue';
import type { TriggerType } from '../types';

/** 事件处理器类型，兼容无参和带 Event 参数的回调 */
type EventHandler = (event?: Event) => void;

/** 根据鼠标坐标创建虚拟定位元素（用于 contextmenu 等场景） */
export function createVirtualElement(clientX: number, clientY: number): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      width: 0,
      height: 0,
      x: clientX,
      y: clientY,
      top: clientY,
      left: clientX,
      right: clientX,
      bottom: clientY,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;
}

export interface UsePopperTriggerOptions {
  trigger: MaybeRefOrGetter<TriggerType>;
  disabled?: MaybeRefOrGetter<boolean>;
  showDelay?: MaybeRefOrGetter<number>;
  hideDelay?: MaybeRefOrGetter<number>;
  /** 受控模式：外部控制的显示状态 */
  open?: MaybeRefOrGetter<boolean | undefined>;
  /** 内部状态变化时的回调（用于 v-model 通知） */
  onOpenChange?: (value: boolean) => void;
  referenceRef: Ref<HTMLElement | null>;
  floatingRef: Ref<HTMLElement | null>;
}

export interface UsePopperTriggerReturn {
  isOpen: Readonly<Ref<boolean>>;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  /** 绑定到触发元素的事件 */
  referenceListeners: Ref<Record<string, EventHandler>>;
  /** 绑定到浮动元素的事件（hover 模式保持打开） */
  floatingListeners: Ref<Record<string, EventHandler>>;
}

/**
 * 触发器管理 composable
 *
 * 管理 hover/click/focus/contextmenu/manual 触发方式，
 * 支持受控模式 (open + onOpenChange)
 */
export function usePopperTrigger(options: UsePopperTriggerOptions): UsePopperTriggerReturn {
  const {
    trigger,
    disabled = false,
    showDelay = 0,
    hideDelay = 0,
    open,
    onOpenChange,
    referenceRef,
    floatingRef,
  } = options;

  // 受控/非受控状态：open prop 优先；受控时只通知外部不污染内部（含相等去重）
  const { state: isOpen, setState: setOpen } = useControllable<boolean>({
    prop: open,
    defaultValue: false,
    onChange: onOpenChange,
  });

  // 延迟显示/隐藏定时器：start 取当前 delay，组件卸载/scope 销毁自动清理
  const showTimeout = useTimeout(() => {
    if (toValue(disabled)) return;
    setOpen(true);
  }, showDelay);
  const hideTimeout = useTimeout(() => setOpen(false), hideDelay);

  function clearTimers() {
    showTimeout.stop();
    hideTimeout.stop();
  }

  function show() {
    if (toValue(disabled)) return;
    clearTimers();
    // delay 为 0 时同步打开（setTimeout(fn, 0) 会推迟到下一 tick，故仍走分支）
    if (toValue(showDelay) > 0) {
      showTimeout.start();
    } else {
      setOpen(true);
    }
  }

  function hide() {
    clearTimers();
    if (toValue(hideDelay) > 0) {
      hideTimeout.start();
    } else {
      setOpen(false);
    }
  }

  function toggle() {
    if (isOpen.value) {
      hide();
    } else {
      show();
    }
  }

  // Esc 键关闭
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen.value) {
      hide();
    }
  }

  // Esc 关闭：仅在打开时监听 document keydown；target 为 null（含 SSR 无 document）时自动解绑
  useEventListener(
    () => (isOpen.value && typeof document !== 'undefined' ? document : null),
    'keydown',
    onKeyDown,
  );

  // 点击外部关闭（click/contextmenu 触发模式）
  const clickOutsideEnabled = computed(() => {
    const t = toValue(trigger);
    return isOpen.value && (t === 'click' || t === 'contextmenu');
  });

  useClickOutside({
    excludeRefs: computed(() => [referenceRef.value, floatingRef.value]),
    handler: () => hide(),
    enabled: clickOutsideEnabled,
  });

  // 根据 trigger 类型计算事件监听
  const referenceListeners = computed<Record<string, EventHandler>>(() => {
    const t = toValue(trigger);
    const listeners: Record<string, EventHandler> = {};

    switch (t) {
      case 'hover':
        listeners.mouseenter = () => show();
        listeners.mouseleave = () => hide();
        // 键盘可访问性：focusin/focusout 冒泡，子元素获焦时也能触发
        listeners.focusin = () => show();
        listeners.focusout = (event?: Event) => {
          // 焦点移入浮动层时不关闭（避免可交互内容被意外关闭）
          const relatedTarget = (event as FocusEvent)?.relatedTarget as Node | null;
          if (relatedTarget && floatingRef.value?.contains(relatedTarget)) return;
          hide();
        };
        break;

      case 'click':
        listeners.click = () => toggle();
        break;

      case 'focus':
        listeners.focusin = () => show();
        listeners.focusout = () => hide();
        break;

      case 'contextmenu':
        listeners.contextmenu = (event?: Event) => {
          const mouseEvent = event as MouseEvent;
          mouseEvent.preventDefault();
          const { clientX, clientY } = mouseEvent;
          // 虚拟元素定位到鼠标坐标
          referenceRef.value = createVirtualElement(clientX, clientY);
          show();
        };
        break;

      // manual: 不绑定任何事件
    }

    return listeners;
  });

  const floatingListeners = computed(() => {
    const t = toValue(trigger);
    const listeners: Record<string, EventHandler> = {};

    if (t === 'hover') {
      listeners.mouseenter = () => clearTimers();
      listeners.mouseleave = () => hide();
      // 焦点进入浮动层时保持打开（键盘可访问性）
      listeners.focusin = () => clearTimers();
      listeners.focusout = (event?: Event) => {
        const relatedTarget = (event as FocusEvent)?.relatedTarget as Node | null;
        if (
          relatedTarget &&
          (floatingRef.value?.contains(relatedTarget) ||
            referenceRef.value?.contains(relatedTarget))
        )
          return;
        hide();
      };
    }

    return listeners;
  });

  // 定时器由 useTimeout 在 scope 销毁时自动清理，无需手动 onBeforeUnmount

  return {
    isOpen,
    show,
    hide,
    toggle,
    referenceListeners,
    floatingListeners,
  };
}
