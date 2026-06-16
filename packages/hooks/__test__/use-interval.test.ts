import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useInterval } from '../src/use-interval';

describe('useInterval', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should not tick without start (immediate defaults to false)', () => {
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => useInterval(cb, 100));

    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
    scope.stop();
  });

  it('should tick periodically after start', () => {
    const cb = vi.fn();
    const scope = effectScope();
    let api: ReturnType<typeof useInterval> | undefined;
    scope.run(() => {
      api = useInterval(cb, 100);
    });

    api!.start();
    expect(api!.isActive.value).toBe(true);
    vi.advanceTimersByTime(350);
    expect(cb).toHaveBeenCalledTimes(3);
    scope.stop();
  });

  it('should tick immediately when immediate is true', () => {
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => useInterval(cb, 100, { immediate: true }));

    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('stop() should halt ticking', () => {
    const cb = vi.fn();
    const scope = effectScope();
    let api: ReturnType<typeof useInterval> | undefined;
    scope.run(() => {
      api = useInterval(cb, 100);
    });

    api!.start();
    vi.advanceTimersByTime(150);
    api!.stop();
    expect(api!.isActive.value).toBe(false);
    vi.advanceTimersByTime(300);
    expect(cb).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('should clear the interval when the effect scope is stopped', () => {
    const cb = vi.fn();
    const scope = effectScope();
    let api: ReturnType<typeof useInterval> | undefined;
    scope.run(() => {
      api = useInterval(cb, 100);
    });

    api!.start();
    scope.stop();
    vi.advanceTimersByTime(300);
    expect(cb).not.toHaveBeenCalled();
  });
});
