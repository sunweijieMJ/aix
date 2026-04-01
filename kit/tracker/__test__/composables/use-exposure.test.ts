import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { useExposure } from '../../src/composables/use-exposure.js';
import { TRACKER_INJECTION_KEY } from '../../src/types.js';
import { Tracker } from '../../src/core/tracker.js';
import { ConsoleAdapter } from '../../src/adapters/console.adapter.js';

// Mock IntersectionObserver — 保存 callback 以手动触发
let observerCallback: IntersectionObserverCallback;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = vi.fn();
}

describe('useExposure', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    mockObserve.mockReset();
    mockDisconnect.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function mountWithTracker(setup: () => Record<string, any>) {
    const adapter = new ConsoleAdapter();
    adapter.init({ appkey: 'test' });
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [adapter],
    });

    const Component = defineComponent({
      setup() {
        const result = setup();
        return () => h('div', { ref: result.elementRef as any });
      },
    });

    return {
      wrapper: mount(Component, {
        global: {
          provide: {
            [TRACKER_INJECTION_KEY as symbol]: tracker,
          },
        },
      }),
      tracker,
    };
  }

  it('应返回 elementRef、isExposed、reset', () => {
    let result: ReturnType<typeof useExposure> | undefined;

    mountWithTracker(() => {
      result = useExposure({ event: 'test_exposure_event' });
      return result;
    });

    expect(result).toBeDefined();
    expect(result!.elementRef).toBeDefined();
    expect(result!.isExposed.value).toBe(false);
    expect(typeof result!.reset).toBe('function');
  });

  it('元素可见超过 minVisibleTime 应触发 track', async () => {
    let result: ReturnType<typeof useExposure> | undefined;

    const { tracker } = mountWithTracker(() => {
      result = useExposure({
        event: 'test_imp',
        properties: { content_title: '测试' },
        minVisibleTime: 300,
      });
      return result;
    });

    const trackSpy = vi.spyOn(tracker, 'track');
    // 等待 watch(elementRef) 触发，创建 Observer
    await nextTick();

    // 模拟元素进入视口
    observerCallback(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.8,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );

    // 还没到 300ms
    vi.advanceTimersByTime(200);
    expect(trackSpy).not.toHaveBeenCalled();

    // 到达 300ms
    vi.advanceTimersByTime(100);
    expect(trackSpy).toHaveBeenCalledWith('test_imp', {
      content_title: '测试',
    });
    expect(result!.isExposed.value).toBe(true);
  });

  it('元素离开视口应取消计时', async () => {
    let result: ReturnType<typeof useExposure> | undefined;

    const { tracker } = mountWithTracker(() => {
      result = useExposure({
        event: 'test_imp',
        minVisibleTime: 300,
      });
      return result;
    });

    const trackSpy = vi.spyOn(tracker, 'track');
    await nextTick();

    // 进入视口
    observerCallback(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.8,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );

    vi.advanceTimersByTime(100);

    // 离开视口
    observerCallback(
      [
        {
          isIntersecting: false,
          intersectionRatio: 0,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );

    vi.advanceTimersByTime(300);
    expect(trackSpy).not.toHaveBeenCalled();
    expect(result!.isExposed.value).toBe(false);
  });

  it('once=true 触发后不再重复上报', async () => {
    const { tracker } = mountWithTracker(() => {
      return useExposure({
        event: 'test_imp',
        once: true,
        minVisibleTime: 0,
      });
    });

    const trackSpy = vi.spyOn(tracker, 'track');
    await nextTick();

    // 第一次曝光
    observerCallback(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.8,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    vi.advanceTimersByTime(1);
    expect(trackSpy).toHaveBeenCalledTimes(1);

    // once=true 时 disconnect 应被调用
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('动态 properties 函数应在曝光时执行', async () => {
    let callCount = 0;

    const { tracker } = mountWithTracker(() => {
      return useExposure({
        event: 'test_imp',
        properties: () => {
          callCount++;
          return { dynamic_key: `value_${callCount}` };
        },
        minVisibleTime: 0,
      });
    });

    const trackSpy = vi.spyOn(tracker, 'track');
    await nextTick();

    observerCallback(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.8,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    vi.advanceTimersByTime(1);

    expect(trackSpy).toHaveBeenCalledWith('test_imp', {
      dynamic_key: 'value_1',
    });
  });

  it('reset 应重置曝光状态并重新观察', async () => {
    let result: ReturnType<typeof useExposure> | undefined;

    const { tracker } = mountWithTracker(() => {
      result = useExposure({
        event: 'test_imp',
        once: true,
        minVisibleTime: 0,
      });
      return result;
    });

    vi.spyOn(tracker, 'track');
    await nextTick();

    // 触发曝光
    observerCallback(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.8,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    vi.advanceTimersByTime(1);
    expect(result!.isExposed.value).toBe(true);

    // reset 后状态重置
    result!.reset();
    expect(result!.isExposed.value).toBe(false);
    // reset 后应重新 observe
    expect(mockObserve.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('unmount 时应断开 Observer', async () => {
    const { wrapper } = mountWithTracker(() => {
      return useExposure({ event: 'test_imp' });
    });

    await nextTick();
    wrapper.unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
