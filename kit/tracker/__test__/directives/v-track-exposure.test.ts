import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createTrackExposureDirective } from '../../src/directives/v-track-exposure.js';
import { Tracker } from '../../src/core/tracker.js';
import { ConsoleAdapter } from '../../src/adapters/console.adapter.js';

// Mock IntersectionObserver
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

describe('v-track-exposure', () => {
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

  function createTracker() {
    const adapter = new ConsoleAdapter();
    adapter.init({ appkey: 'test' });
    return new Tracker({ appkey: 'test', adapters: [adapter] });
  }

  it('mounted 时应开始观察元素', () => {
    const tracker = createTracker();

    mount(
      defineComponent({
        template: `<div v-track-exposure="{ event: 'app_test_imp', threshold: 0.5 }">内容</div>`,
      }),
      {
        global: {
          directives: {
            'track-exposure': createTrackExposureDirective(tracker),
          },
        },
      },
    );

    expect(mockObserve).toHaveBeenCalledOnce();
  });

  it('元素可见超过 minVisibleTime 应触发 track', () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    mount(
      defineComponent({
        template: `<div v-track-exposure="{ event: 'app_test_imp', minVisibleTime: 300 }">内容</div>`,
      }),
      {
        global: {
          directives: {
            'track-exposure': createTrackExposureDirective(tracker),
          },
        },
      },
    );

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
    expect(trackSpy).toHaveBeenCalledWith('app_test_imp', undefined);
  });

  it('元素离开视口应取消计时', () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    mount(
      defineComponent({
        template: `<div v-track-exposure="{ event: 'app_test_imp', minVisibleTime: 300 }">内容</div>`,
      }),
      {
        global: {
          directives: {
            'track-exposure': createTrackExposureDirective(tracker),
          },
        },
      },
    );

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
  });

  it('unmount 时应断开 Observer', () => {
    const tracker = createTracker();

    const wrapper = mount(
      defineComponent({
        template: `<div v-track-exposure="{ event: 'app_test_imp' }">内容</div>`,
      }),
      {
        global: {
          directives: {
            'track-exposure': createTrackExposureDirective(tracker),
          },
        },
      },
    );

    wrapper.unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
