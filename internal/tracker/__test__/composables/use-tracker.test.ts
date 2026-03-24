import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useTracker } from '../../src/composables/use-tracker.js';
import { TRACKER_INJECTION_KEY } from '../../src/types.js';
import { Tracker } from '../../src/core/tracker.js';
import { ConsoleAdapter } from '../../src/adapters/console.adapter.js';

describe('useTracker', () => {
  function createTestComponent(setup: () => void) {
    return defineComponent({
      setup() {
        setup();
        return () => h('div');
      },
    });
  }

  function mountWithTracker(component: ReturnType<typeof defineComponent>) {
    const adapter = new ConsoleAdapter();
    adapter.init({ appkey: 'test' });
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [adapter],
    });

    return mount(component, {
      global: {
        provide: {
          [TRACKER_INJECTION_KEY as symbol]: tracker,
        },
      },
    });
  }

  it('应返回 track、identify、setCommonData 方法', () => {
    let result: ReturnType<typeof useTracker> | undefined;

    const Component = createTestComponent(() => {
      result = useTracker();
    });
    mountWithTracker(Component);

    expect(result).toBeDefined();
    expect(typeof result!.track).toBe('function');
    expect(typeof result!.identify).toBe('function');
    expect(typeof result!.setCommonData).toBe('function');
    expect(result!.tracker).toBeInstanceOf(Tracker);
  });

  it('无 Tracker 注入时应抛出错误', () => {
    const Component = createTestComponent(() => {
      useTracker();
    });

    expect(() => {
      mount(Component);
    }).toThrow('[kit-tracker]');
  });

  it('track 应调用 Tracker.track', () => {
    let result: ReturnType<typeof useTracker> | undefined;

    const Component = createTestComponent(() => {
      result = useTracker();
    });
    mountWithTracker(Component);

    const trackSpy = vi.spyOn(result!.tracker, 'track');
    result!.track('app_test_event_ck', { content_title: '测试' });

    expect(trackSpy).toHaveBeenCalledWith('app_test_event_ck', {
      content_title: '测试',
    });
  });
});
