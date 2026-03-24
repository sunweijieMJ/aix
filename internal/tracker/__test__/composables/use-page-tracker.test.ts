import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { usePageTracker } from '../../src/composables/use-page-tracker.js';
import { TRACKER_INJECTION_KEY } from '../../src/types.js';
import { Tracker } from '../../src/core/tracker.js';
import { ConsoleAdapter } from '../../src/adapters/console.adapter.js';

describe('usePageTracker', () => {
  function createTracker() {
    const adapter = new ConsoleAdapter();
    adapter.init({ appkey: 'test' });
    return new Tracker({
      appkey: 'test',
      adapters: [adapter],
    });
  }

  function mountWithPageTracker(
    tracker: Tracker,
    options: Parameters<typeof usePageTracker>[0],
  ) {
    const Component = defineComponent({
      setup() {
        usePageTracker(options);
        return () => h('div');
      },
    });

    return mount(Component, {
      global: {
        provide: {
          [TRACKER_INJECTION_KEY as symbol]: tracker,
        },
      },
    });
  }

  it('onMounted 时应上报 $pageview', () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    mountWithPageTracker(tracker, { pageName: '首页' });

    expect(trackSpy).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({
        page_name: '首页',
      }),
    );
  });

  it('$pageview 应包含 enterProperties', () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    mountWithPageTracker(tracker, {
      pageName: '详情页',
      enterProperties: { content_id: '123' },
    });

    expect(trackSpy).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({
        page_name: '详情页',
        content_id: '123',
      }),
    );
  });

  it('onBeforeUnmount 时应上报 $pageclose 并携带停留时长 dr', () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    const wrapper = mountWithPageTracker(tracker, { pageName: '首页' });
    trackSpy.mockClear();

    wrapper.unmount();

    expect(trackSpy).toHaveBeenCalledWith(
      '$pageclose',
      expect.objectContaining({
        page_name: '首页',
        dr: expect.any(Number),
      }),
    );
  });

  it('$pageclose 应包含 leaveProperties', () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    const wrapper = mountWithPageTracker(tracker, {
      pageName: '首页',
      leaveProperties: { function_name: '返回' },
    });
    trackSpy.mockClear();

    wrapper.unmount();

    expect(trackSpy).toHaveBeenCalledWith(
      '$pageclose',
      expect.objectContaining({
        page_name: '首页',
        function_name: '返回',
        dr: expect.any(Number),
      }),
    );
  });

  it('dr 应反映实际停留时长', () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    // mock Date.now 控制时间
    const now = 1000000;
    const dateSpy = vi.spyOn(Date, 'now');
    dateSpy.mockReturnValue(now);

    const wrapper = mountWithPageTracker(tracker, { pageName: '首页' });
    trackSpy.mockClear();

    // 模拟 5 秒后卸载
    dateSpy.mockReturnValue(now + 5000);
    wrapper.unmount();

    expect(trackSpy).toHaveBeenCalledWith(
      '$pageclose',
      expect.objectContaining({
        dr: 5000,
      }),
    );

    dateSpy.mockRestore();
  });

  it('无 Tracker 注入时应抛出错误', () => {
    const Component = defineComponent({
      setup() {
        usePageTracker({ pageName: '测试' });
        return () => h('div');
      },
    });

    expect(() => mount(Component)).toThrow('[aix-tracker]');
  });
});
