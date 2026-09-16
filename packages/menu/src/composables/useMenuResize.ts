import { useEventListener } from '@aix/hooks';
import { onScopeDispose, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';

export interface UseMenuResizeOptions {
  width: Ref<number>;
  minWidth: MaybeRefOrGetter<number>;
  maxWidth: MaybeRefOrGetter<number>;
  /** 键盘左右方向键每次调整的步长（px） */
  keyboardStep?: number;
}

/**
 * 右边缘拖拽改变宽度。拖拽期间把 col-resize 光标和禁选文本挂到 body 上，
 * 指针移出把手命中区时不会闪回默认光标；把手捕获指针，窗口外释放也能收到 pointerup。
 */
export function useMenuResize(options: UseMenuResizeOptions) {
  const { width, minWidth, maxWidth, keyboardStep = 10 } = options;
  const dragging = ref(false);
  let startX = 0;
  let startWidth = 0;
  let bodyCursor = '';
  let bodyUserSelect = '';

  function clamp(value: number) {
    return Math.min(toValue(maxWidth), Math.max(toValue(minWidth), Math.round(value)));
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement | null;
    if (handle && typeof handle.setPointerCapture === 'function') {
      handle.setPointerCapture(event.pointerId);
    }
    startX = event.clientX;
    startWidth = width.value;
    dragging.value = true;
    const body = document.body;
    bodyCursor = body.style.cursor;
    bodyUserSelect = body.style.userSelect;
    body.style.cursor = 'col-resize';
    body.style.userSelect = 'none';
  }

  function onPointerUp() {
    if (!dragging.value) return;
    dragging.value = false;
    const body = document.body;
    body.style.cursor = bodyCursor;
    body.style.userSelect = bodyUserSelect;
  }

  function onPointerMove(event: PointerEvent) {
    // 鼠标已松开却没收到 pointerup（如在窗口外释放），按释放处理
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      onPointerUp();
      return;
    }
    width.value = clamp(startWidth + event.clientX - startX);
  }

  function onKeyDown(event: KeyboardEvent) {
    const delta =
      event.key === 'ArrowRight' ? keyboardStep : event.key === 'ArrowLeft' ? -keyboardStep : 0;
    if (!delta) return;
    event.preventDefault();
    width.value = clamp(width.value + delta);
  }

  const dragTarget = () => (dragging.value ? document : null);
  useEventListener(dragTarget, 'pointermove', onPointerMove);
  useEventListener(dragTarget, ['pointerup', 'pointercancel'], onPointerUp);

  // 拖拽中组件被卸载时还原 body 样式
  onScopeDispose(onPointerUp);

  return { dragging, onPointerDown, onKeyDown };
}
