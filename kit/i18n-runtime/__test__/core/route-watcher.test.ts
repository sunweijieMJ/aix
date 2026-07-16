import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHistoryPatchWatcher,
  createRouterHookWatcher,
} from '../../src/core/route-watcher.js';

describe('createHistoryPatchWatcher', () => {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  afterEach(() => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  it('pushState 应触发 onChange', () => {
    const onChange = vi.fn();
    const watcher = createHistoryPatchWatcher();
    watcher.start(onChange);

    history.pushState({}, '', '/next');

    expect(onChange).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('replaceState 应触发 onChange', () => {
    const onChange = vi.fn();
    const watcher = createHistoryPatchWatcher();
    watcher.start(onChange);

    history.replaceState({}, '', '/replaced');

    expect(onChange).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('popstate 应触发 onChange', () => {
    const onChange = vi.fn();
    const watcher = createHistoryPatchWatcher();
    watcher.start(onChange);

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(onChange).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('stop 后 pushState 不应再触发 onChange', () => {
    const onChange = vi.fn();
    const watcher = createHistoryPatchWatcher();
    watcher.start(onChange);
    watcher.stop();

    history.pushState({}, '', '/after-stop');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stop 应恢复原始的 pushState/replaceState', () => {
    const watcher = createHistoryPatchWatcher();
    watcher.start(vi.fn());
    watcher.stop();

    expect(history.pushState).toBe(originalPushState);
    expect(history.replaceState).toBe(originalReplaceState);
  });
});

describe('createRouterHookWatcher', () => {
  it('router.afterEach 触发时应调用 onChange', () => {
    let afterEachCallback: (() => void) | undefined;
    const router = {
      afterEach: vi.fn((cb: () => void) => {
        afterEachCallback = cb;
        return () => {};
      }),
    };

    const onChange = vi.fn();
    const watcher = createRouterHookWatcher(router as never);
    watcher.start(onChange);

    afterEachCallback?.();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stop 应调用 afterEach 返回的取消订阅函数', () => {
    const unsubscribe = vi.fn();
    const router = { afterEach: vi.fn().mockReturnValue(unsubscribe) };

    const watcher = createRouterHookWatcher(router as never);
    watcher.start(vi.fn());
    watcher.stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
