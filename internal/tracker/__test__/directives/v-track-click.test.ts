import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createTrackClickDirective } from '../../src/directives/v-track-click.js';
import { Tracker } from '../../src/core/tracker.js';
import { ConsoleAdapter } from '../../src/adapters/console.adapter.js';

describe('v-track-click', () => {
  function createTracker() {
    const adapter = new ConsoleAdapter();
    adapter.init({ appkey: 'test' });
    return new Tracker({ appkey: 'test', adapters: [adapter] });
  }

  it('点击元素应触发 track', async () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    const wrapper = mount(
      defineComponent({
        template: `<button v-track-click="{ event: 'app_test_btn_ck', properties: { content_title: '按钮' } }">测试</button>`,
      }),
      {
        global: {
          directives: {
            'track-click': createTrackClickDirective(tracker),
          },
        },
      },
    );

    await wrapper.find('button').trigger('click');
    expect(trackSpy).toHaveBeenCalledWith('app_test_btn_ck', {
      content_title: '按钮',
    });
  });

  it('once 模式应仅触发一次', async () => {
    const tracker = createTracker();
    const trackSpy = vi.spyOn(tracker, 'track');

    const wrapper = mount(
      defineComponent({
        template: `<button v-track-click="{ event: 'app_once_ck', once: true }">测试</button>`,
      }),
      {
        global: {
          directives: {
            'track-click': createTrackClickDirective(tracker),
          },
        },
      },
    );

    const btn = wrapper.find('button');
    await btn.trigger('click');
    await btn.trigger('click');
    await btn.trigger('click');

    expect(trackSpy).toHaveBeenCalledTimes(1);
  });
});
