import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref } from 'vue';
import { useTimeout } from '../src/use-timeout';

describe('useTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should not run automatically without start (immediate defaults to false)', () => {
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => useTimeout(cb, 100));

    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
    scope.stop();
  });

  it('should run the callback after start', () => {
    const cb = vi.fn();
    const scope = effectScope();
    let api: ReturnType<typeof useTimeout> | undefined;
    scope.run(() => {
      api = useTimeout(cb, 100);
    });

    api!.start();
    expect(api!.isPending.value).toBe(true);
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(api!.isPending.value).toBe(false);
    scope.stop();
  });

  it('should run immediately when immediate is true', () => {
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => useTimeout(cb, 50, { immediate: true }));

    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('start() should restart the pending timer (debounce-like)', () => {
    const cb = vi.fn();
    const scope = effectScope();
    let api: ReturnType<typeof useTimeout> | undefined;
    scope.run(() => {
      api = useTimeout(cb, 100);
    });

    api!.start();
    vi.advanceTimersByTime(80);
    api!.start(); // 重置，重新计时 100ms
    vi.advanceTimersByTime(80);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(cb).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('stop() should cancel a pending timer', () => {
    const cb = vi.fn();
    const scope = effectScope();
    let api: ReturnType<typeof useTimeout> | undefined;
    scope.run(() => {
      api = useTimeout(cb, 100);
    });

    api!.start();
    api!.stop();
    expect(api!.isPending.value).toBe(false);
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
    scope.stop();
  });

  it('should use the latest reactive delay on start', () => {
    const cb = vi.fn();
    const delay = ref(100);
    const scope = effectScope();
    let api: ReturnType<typeof useTimeout> | undefined;
    scope.run(() => {
      api = useTimeout(cb, delay);
    });

    delay.value = 300;
    api!.start();
    vi.advanceTimersByTime(100);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('should clear the timer when the effect scope is stopped', () => {
    const cb = vi.fn();
    const scope = effectScope();
    let api: ReturnType<typeof useTimeout> | undefined;
    scope.run(() => {
      api = useTimeout(cb, 100);
    });

    api!.start();
    scope.stop();
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
  });
});
