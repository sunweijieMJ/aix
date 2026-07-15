/**
 * WaveformCanvas 单元测试
 * jsdom 中 Canvas 2D API 方法均为 no-op，测试重心在组件渲染和 props 传递
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import WaveformCanvas from '../src/components/WaveformCanvas/index.vue';

// jsdom 不支持 ResizeObserver，提供简单 stub（必须用 class/function，不能用箭头函数）
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

describe('WaveformCanvas', () => {
  describe('渲染', () => {
    it('应渲染一个 canvas 元素', () => {
      const wrapper = mount(WaveformCanvas);
      expect(wrapper.find('canvas').exists()).toBe(true);
    });

    it('canvas 应有 aix-waveform-canvas 类名', () => {
      const wrapper = mount(WaveformCanvas);
      expect(wrapper.find('canvas').classes()).toContain('aix-waveform-canvas');
    });
  });

  describe('props', () => {
    it('默认 height 为 32，style 应包含正确高度', () => {
      const wrapper = mount(WaveformCanvas);
      const canvas = wrapper.find('canvas');
      expect(canvas.attributes('style')).toContain('height: 32px');
    });

    it('传入 height=64 时 style 应包含正确高度', () => {
      const wrapper = mount(WaveformCanvas, { props: { height: 64 } });
      const canvas = wrapper.find('canvas');
      expect(canvas.attributes('style')).toContain('height: 64px');
    });

    it('传入固定 width=200 时 style 应包含正确宽度', () => {
      const wrapper = mount(WaveformCanvas, {
        props: { width: 200, height: 32 },
      });
      const canvas = wrapper.find('canvas');
      expect(canvas.attributes('style')).toContain('width: 200px');
    });

    it('传入 data 时 canvas 应存在（绘制逻辑不报错）', () => {
      const data = Array.from({ length: 40 }, (_, i) => Math.sin(i * 0.2) * 0.5 + 0.5);
      const wrapper = mount(WaveformCanvas, {
        props: { data, width: 320, height: 32 },
      });
      expect(wrapper.find('canvas').exists()).toBe(true);
    });

    it('传入 progress=0.5 时不报错', () => {
      const wrapper = mount(WaveformCanvas, {
        props: { data: [0.2, 0.5, 0.8], progress: 0.5, width: 100 },
      });
      expect(wrapper.find('canvas').exists()).toBe(true);
    });
  });

  describe('响应式更新', () => {
    it('data 变化后组件不崩溃', async () => {
      const wrapper = mount(WaveformCanvas, {
        props: { data: [], width: 200 },
      });
      await wrapper.setProps({ data: [0.1, 0.5, 0.9] });
      expect(wrapper.find('canvas').exists()).toBe(true);
    });

    it('progress 变化后组件不崩溃', async () => {
      const wrapper = mount(WaveformCanvas, {
        props: { data: [0.5, 0.8, 0.3], progress: 0, width: 200 },
      });
      await wrapper.setProps({ progress: 0.7 });
      expect(wrapper.find('canvas').exists()).toBe(true);
    });
  });

  describe('自定义颜色', () => {
    it('传入 inactiveColor 和 activeColor 不报错', () => {
      const wrapper = mount(WaveformCanvas, {
        props: {
          data: [0.5],
          width: 100,
          inactiveColor: '#94A3B8',
          activeColor: '#3B82F6',
        },
      });
      expect(wrapper.find('canvas').exists()).toBe(true);
    });
  });
});
