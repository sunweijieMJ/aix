import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import type { EChartsLike } from '../src/composables/useEChartsRender';
import { __resetChartKinds } from '../src/composables/useEChartsRender';
import {
  createChartRenderers,
  createLazyChartRenderers,
  __resetSharedECharts,
} from '../src/utils/chartRenderers';
import type { MdToken, MarkdownRenderInfo } from '../src/utils/markdownWalker';

// 隔离 ECharts 子模块二次动态 import：真实加载体积大且异步慢，单测用轻量 mock 让 import 同步落定
vi.mock('echarts/charts', () => ({
  BarChart: {},
  LineChart: {},
  PieChart: {},
  ScatterChart: {},
  RadarChart: {},
}));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  RadarComponent: {},
}));

// ECharts 经依赖注入（非模块 mock），纯对象假实现即可
const makeECharts = () => {
  const instance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
  const core: EChartsLike = {
    init: vi.fn(() => instance),
    use: vi.fn(),
  };
  return { core, instance };
};

const OPTION = '{"series":[{"type":"bar","data":[1,2,3]}]}';

const fenceToken = (content: string): MdToken => ({
  type: 'fence',
  tag: 'code',
  nesting: 0,
  level: 0,
  content,
  info: 'chart',
  map: null,
  children: null,
  attrs: null,
});

const mountFence = (
  renderers: ReturnType<typeof createChartRenderers>,
  content: string,
  info: MarkdownRenderInfo,
) => {
  const vnode = renderers['fence:chart']!({
    token: fenceToken(content),
    renderChildren: () => [],
    info,
  });
  return mount(defineComponent({ render: () => h('div', vnode as never) }));
};

// 等待 post effect + ensureChartType 动态 import（含 macrotask）落定
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await flushPromises();
    await new Promise((r) => setTimeout(r));
  }
};

describe('createChartRenderers（ECharts 围栏渲染器）', () => {
  beforeEach(() => {
    __resetChartKinds();
    __resetSharedECharts();
  });

  it('块未固化（流式中）：维持代码块逐字可见，不触发 init', async () => {
    const { core } = makeECharts();
    const w = mountFence(createChartRenderers(core), OPTION, { streaming: true, committed: false });
    await flush();
    expect(w.find('pre.aix-md-chart-source').exists()).toBe(true);
    expect(w.text()).toContain('series');
    expect(core.init).not.toHaveBeenCalled();
  });

  it('块固化 + 合法 option：渲染活实例容器，init + setOption 各一次', async () => {
    const { core, instance } = makeECharts();
    const w = mountFence(createChartRenderers(core), OPTION, { streaming: true, committed: true });
    await flush();
    expect(w.find('.aix-md-chart').exists()).toBe(true);
    expect(w.find('pre').exists()).toBe(false);
    expect(core.init).toHaveBeenCalledTimes(1);
    expect(instance.setOption).toHaveBeenCalledTimes(1);
  });

  it('committed 未注入时按非流式即固化处理（直接使用 walker 的场景）', async () => {
    const { core } = makeECharts();
    const w = mountFence(createChartRenderers(core), OPTION, { streaming: false });
    await flush();
    expect(w.find('.aix-md-chart').exists()).toBe(true);
    expect(core.init).toHaveBeenCalledTimes(1);
  });

  it('JSON 非法：维持代码块并加 --error 修饰类，不抛错、不 init', async () => {
    const { core } = makeECharts();
    const w = mountFence(createChartRenderers(core), '{bad json', { streaming: false });
    await flush();
    expect(w.find('pre.aix-md-chart-source--error').exists()).toBe(true);
    expect(core.init).not.toHaveBeenCalled();
  });

  it('组件卸载：dispose 释放活实例', async () => {
    const { core, instance } = makeECharts();
    const w = mountFence(createChartRenderers(core), OPTION, { streaming: false });
    await flush();
    expect(core.init).toHaveBeenCalledTimes(1);
    w.unmount();
    expect(instance.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('createLazyChartRenderers（ECharts 惰性加载）', () => {
  beforeEach(() => {
    __resetChartKinds();
    __resetSharedECharts();
  });

  it('创建渲染器时不调 loader；首个围栏渲染时才触发，且多块共享同一次加载', async () => {
    const { core } = makeECharts();
    const loader = vi.fn(async () => core);
    const renderers = createLazyChartRenderers(loader);
    expect(loader).not.toHaveBeenCalled();
    expect(renderers['fence:chart']).toBeTypeOf('function');

    const a = mountFence(renderers, OPTION, { streaming: false });
    const b = mountFence(renderers, OPTION, { streaming: false });
    await flush();
    expect(loader).toHaveBeenCalledTimes(1); // 幂等：两块共享一次加载
    expect(a.find('.aix-md-chart').exists()).toBe(true);
    expect(b.find('.aix-md-chart').exists()).toBe(true);
  });

  it('loader 返回 null（echarts 未安装）：静默维持代码块，无 --error 不抛错', async () => {
    const loader = vi.fn(async () => null);
    const w = mountFence(createLazyChartRenderers(loader), OPTION, { streaming: false });
    await flush();
    expect(w.find('pre.aix-md-chart-source').exists()).toBe(true);
    expect(w.find('pre.aix-md-chart-source--error').exists()).toBe(false);
    expect(w.find('.aix-md-chart').exists()).toBe(false);
  });

  it('loader 抛错：与未安装同等静默降级，不产生未处理 rejection', async () => {
    const loader = vi.fn(async () => {
      throw new Error('network');
    });
    const w = mountFence(createLazyChartRenderers(loader), OPTION, { streaming: false });
    await flush();
    expect(w.find('pre.aix-md-chart-source').exists()).toBe(true);
    expect(w.find('pre.aix-md-chart-source--error').exists()).toBe(false);
  });
});
