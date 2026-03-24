import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useExposure } from '../../src/composables/use-exposure.js';
import { TRACKER_INJECTION_KEY } from '../../src/types.js';
import { Tracker } from '../../src/core/tracker.js';
import { ConsoleAdapter } from '../../src/adapters/console.adapter.js';

// Mock IntersectionObserver
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(_callback: IntersectionObserverCallback) {
    // callback 保留供后续扩展测试使用
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('reset 应重置 isExposed 状态', async () => {
    let result: ReturnType<typeof useExposure> | undefined;

    mountWithTracker(() => {
      result = useExposure({
        event: 'test_exposure_event',
        minVisibleTime: 0,
      });
      return result;
    });

    // 手动设置 isExposed
    result!.isExposed.value = true;
    expect(result!.isExposed.value).toBe(true);

    result!.reset();
    expect(result!.isExposed.value).toBe(false);
  });
});
