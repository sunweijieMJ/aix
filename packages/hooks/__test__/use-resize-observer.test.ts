import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import { useResizeObserver } from '../src/use-resize-observer';

/**
 * jsdom 默认没有 ResizeObserver，这里注入一个可观测的 mock，
 * 记录 observe/disconnect 调用以验证 hook 行为。
 */
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(public cb: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
}

describe('useResizeObserver', () => {
  let el: HTMLElement;
  const originalRO = globalThis.ResizeObserver;

  beforeEach(() => {
    MockResizeObserver.instances = [];
    el = document.createElement('div');
    document.body.appendChild(el);
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    el.remove();
    globalThis.ResizeObserver = originalRO;
    vi.restoreAllMocks();
  });

  it('should observe a static element target', async () => {
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => useResizeObserver(el, cb));
    await nextTick();

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0]!.observe).toHaveBeenCalledWith(el, undefined);
    scope.stop();
  });

  it('should disconnect on stop()', async () => {
    const cb = vi.fn();
    const scope = effectScope();
    let stop: (() => void) | undefined;
    scope.run(() => {
      stop = useResizeObserver(el, cb);
    });
    await nextTick();

    stop?.();
    expect(MockResizeObserver.instances[0]!.disconnect).toHaveBeenCalled();
    scope.stop();
  });

  it('should disconnect on scope dispose', async () => {
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => useResizeObserver(el, cb));
    await nextTick();

    scope.stop();
    expect(MockResizeObserver.instances[0]!.disconnect).toHaveBeenCalled();
  });

  it('should reconnect when reactive target changes', async () => {
    const cb = vi.fn();
    const elB = document.createElement('div');
    document.body.appendChild(elB);
    const target = ref<HTMLElement | null>(el);

    const scope = effectScope();
    scope.run(() => useResizeObserver(target, cb));
    await nextTick();

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0]!.observe).toHaveBeenCalledWith(el, undefined);

    target.value = elB;
    await nextTick();

    // 旧 observer 断开，新建一个观测 elB
    expect(MockResizeObserver.instances[0]!.disconnect).toHaveBeenCalled();
    expect(MockResizeObserver.instances).toHaveLength(2);
    expect(MockResizeObserver.instances[1]!.observe).toHaveBeenCalledWith(elB, undefined);

    scope.stop();
    elB.remove();
  });

  it('should not observe when target is null', async () => {
    const cb = vi.fn();
    const target = ref<HTMLElement | null>(null);
    const scope = effectScope();
    scope.run(() => useResizeObserver(target, cb));
    await nextTick();

    expect(MockResizeObserver.instances).toHaveLength(0);
    scope.stop();
  });

  it('should pass observe options through', async () => {
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => useResizeObserver(el, cb, { box: 'border-box' }));
    await nextTick();

    expect(MockResizeObserver.instances[0]!.observe).toHaveBeenCalledWith(el, {
      box: 'border-box',
    });
    scope.stop();
  });

  it('should safely no-op when ResizeObserver is unavailable', async () => {
    globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver;
    const cb = vi.fn();
    const scope = effectScope();
    // 不应抛错
    expect(() => scope.run(() => useResizeObserver(el, cb))).not.toThrow();
    await nextTick();
    scope.stop();
  });
});
