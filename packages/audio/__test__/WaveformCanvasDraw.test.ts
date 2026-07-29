/**
 * WaveformCanvas 绘制逻辑测试
 *
 * 原有的 WaveformCanvas.test.ts 只覆盖渲染与 props 传递：jsdom 下 getContext() 返回 null，
 * draw() 一开头就早退，"绘制不报错"其实从未执行到绘制。这里补上真正执行绘制的断言。
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import WaveformCanvas from '../src/components/WaveformCanvas/index.vue';
import { stubCanvas2D, type CanvasRecorder } from './helpers/canvasStub';

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

let canvas: CanvasRecorder;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  canvas = stubCanvas2D();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 等待组件内的 nextTick(() => draw()) 落地 */
async function flushDraw() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('WaveformCanvas 绘制', () => {
  it('挂载后应真正执行绘制', async () => {
    mount(WaveformCanvas, { props: { data: [0.2, 0.8, 0.5], width: 200 } });
    await flushDraw();

    expect(canvas.clearCount).toBeGreaterThan(0);
    expect(canvas.rects.length).toBeGreaterThan(0);
  });

  it('无数据时绘制占位波形', async () => {
    mount(WaveformCanvas, { props: { data: [], width: 200 } });
    await flushDraw();

    expect(canvas.rects.length).toBeGreaterThan(0);
    // 占位态只用一种颜色
    const colors = new Set(canvas.rects.map((r) => r.fillStyle));
    expect(colors.size).toBe(1);
  });

  it('progress 应把柱子分成已播放/未播放两种颜色', async () => {
    const data = Array.from({ length: 40 }, () => 0.5);
    mount(WaveformCanvas, { props: { data, width: 200, progress: 0.5 } });
    await flushDraw();

    const colors = new Set(canvas.rects.map((r) => r.fillStyle));
    expect(colors.size).toBe(2);
  });

  it('progress=0 时全部为未播放色', async () => {
    const data = Array.from({ length: 40 }, () => 0.5);
    mount(WaveformCanvas, { props: { data, width: 200, progress: 0 } });
    await flushDraw();

    const colors = new Set(canvas.rects.map((r) => r.fillStyle));
    expect(colors.size).toBe(1);
  });

  it('柱子高度应随数据值变化', async () => {
    mount(WaveformCanvas, {
      props: { data: [0.1, 1.0], width: 200, height: 40, barWidth: 2, barGap: 4 },
    });
    await flushDraw();

    const heights = canvas.rects.map((r) => r.h);
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights));
  });

  it('柱宽应遵循 barWidth', async () => {
    mount(WaveformCanvas, {
      props: { data: [0.5, 0.6, 0.7], width: 200, barWidth: 6, barGap: 3 },
    });
    await flushDraw();

    expect(canvas.rects.every((r) => r.w === 6)).toBe(true);
  });

  it('颜色解析不应下沉到绘制循环内（回归 #17）', async () => {
    const data = Array.from({ length: 60 }, () => 0.5);
    mount(WaveformCanvas, { props: { data, width: 400, progress: 0.5 } });
    await flushDraw();

    // 每帧只解析 active/inactive 两次；旧实现是每根柱子各一次（数十次）
    expect(canvas.rects.length).toBeGreaterThan(20);
    expect(canvas.computedStyleCount).toBeLessThanOrEqual(4);
  });

  it('data 变化应触发重绘', async () => {
    const wrapper = mount(WaveformCanvas, { props: { data: [0.3], width: 200 } });
    await flushDraw();
    const before = canvas.clearCount;

    await wrapper.setProps({ data: [0.9, 0.4] });
    await flushDraw();

    expect(canvas.clearCount).toBeGreaterThan(before);
  });
});

describe('WaveformCanvas width 响应式（回归 #13）', () => {
  it('运行时修改 width 应生效', async () => {
    const wrapper = mount(WaveformCanvas, { props: { data: [0.5], width: 200 } });
    await flushDraw();
    expect(wrapper.find('canvas').attributes('style')).toContain('width: 200px');

    await wrapper.setProps({ width: 360 });
    await flushDraw();

    // 修复前 actualWidth 只在 setup 初始化一次，改 :width 完全无效
    expect(wrapper.find('canvas').attributes('style')).toContain('width: 360px');
  });

  it('width 由固定值切回 0 时应重新自适应父容器', async () => {
    const wrapper = mount(WaveformCanvas, { props: { data: [0.5], width: 200 } });
    await flushDraw();

    await wrapper.setProps({ width: 0 });
    await flushDraw();

    // 无父容器宽度时回落到默认宽度，而不是卡在旧的固定值
    expect(wrapper.find('canvas').attributes('style')).not.toContain('width: 200px');
  });
});

describe('WaveformCanvas 无障碍（回归 #24）', () => {
  it('应有 role=img 与描述性 aria-label', async () => {
    const wrapper = mount(WaveformCanvas, { props: { data: [0.5, 0.6], progress: 0.42 } });
    await flushDraw();

    const canvasEl = wrapper.find('canvas');
    expect(canvasEl.attributes('role')).toBe('img');
    expect(canvasEl.attributes('aria-label')).toContain('42%');
  });

  it('无数据时 aria-label 应说明暂无数据', async () => {
    const wrapper = mount(WaveformCanvas, { props: { data: [] } });
    await flushDraw();

    expect(wrapper.find('canvas').attributes('aria-label')).toContain('暂无数据');
  });
});
