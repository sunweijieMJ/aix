import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import { useEventListener } from '../src/use-event-listener';

describe('useEventListener', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  function dispatch(target: EventTarget, type: string) {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  }

  it('should bind handler to a static element target', () => {
    const handler = vi.fn();
    const scope = effectScope();
    scope.run(() => useEventListener(el, 'click', handler));

    dispatch(el, 'click');
    expect(handler).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('should stop listening when stop() is called', () => {
    const handler = vi.fn();
    const scope = effectScope();
    let stop: (() => void) | undefined;
    scope.run(() => {
      stop = useEventListener(el, 'click', handler);
    });

    stop?.();
    dispatch(el, 'click');
    expect(handler).not.toHaveBeenCalled();
    scope.stop();
  });

  it('should auto-cleanup on scope dispose', () => {
    const handler = vi.fn();
    const scope = effectScope();
    scope.run(() => useEventListener(el, 'click', handler));

    scope.stop();
    dispatch(el, 'click');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should bind multiple events to the same handler', () => {
    const handler = vi.fn();
    const scope = effectScope();
    scope.run(() => useEventListener(el, ['pointerdown', 'pointerup'], handler));

    dispatch(el, 'pointerdown');
    dispatch(el, 'pointerup');
    expect(handler).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('should rebind when a reactive target changes', async () => {
    const handler = vi.fn();
    const elB = document.createElement('div');
    document.body.appendChild(elB);
    const target = ref<HTMLElement | null>(el);

    const scope = effectScope();
    scope.run(() => useEventListener(target, 'click', handler));

    dispatch(el, 'click');
    expect(handler).toHaveBeenCalledTimes(1);

    // 切换 target：旧元素应解绑，新元素生效
    target.value = elB;
    await nextTick();

    dispatch(el, 'click'); // 旧元素：不应再触发
    expect(handler).toHaveBeenCalledTimes(1);

    dispatch(elB, 'click'); // 新元素：触发
    expect(handler).toHaveBeenCalledTimes(2);

    scope.stop();
    elB.remove();
  });

  it('should not bind when target is null (supports enable/disable)', async () => {
    const handler = vi.fn();
    const enabled = ref(false);
    const scope = effectScope();
    scope.run(() => useEventListener(() => (enabled.value ? el : null), 'click', handler));

    dispatch(el, 'click');
    expect(handler).not.toHaveBeenCalled();

    enabled.value = true;
    await nextTick();
    dispatch(el, 'click');
    expect(handler).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('should pass through listener options (once)', () => {
    const handler = vi.fn();
    const scope = effectScope();
    scope.run(() => useEventListener(el, 'click', handler, { once: true }));

    dispatch(el, 'click');
    dispatch(el, 'click');
    expect(handler).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('should work without an active scope (manual stop)', () => {
    const handler = vi.fn();
    // 在任何 effect scope 之外调用，不应抛错/告警；返回 stop 手动清理
    const stop = useEventListener(el, 'click', handler);

    dispatch(el, 'click');
    expect(handler).toHaveBeenCalledTimes(1);

    stop();
    dispatch(el, 'click');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
