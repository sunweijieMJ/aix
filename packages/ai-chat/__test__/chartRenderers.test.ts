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
  FunnelChart: {},
  GaugeChart: {},
  HeatmapChart: {},
  GraphChart: {},
  TreeChart: {},
  TreemapChart: {},
}));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  RadarComponent: {},
  VisualMapComponent: {},
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

  // 回归：模型输出的任意 JSON 直接喂 setOption——部分畸形结构会 throw，async effect
  // reject 成 unhandled rejection，且 rendered 永假 → 围栏留下空白容器
  it('setOption 抛错：降级回代码块 + --error，释放实例，不产生 unhandled rejection', async () => {
    const { core, instance } = makeECharts();
    instance.setOption.mockImplementation(() => {
      throw new Error('bad option structure');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = mountFence(createChartRenderers(core), OPTION, { streaming: false });
    await flush();
    expect(w.find('pre.aix-md-chart-source--error').exists()).toBe(true);
    expect(w.find('.aix-md-chart').exists()).toBe(false);
    expect(instance.dispose).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // 回归：inferKind 对清单外 series 类型回退 'line'——加载错子模块，产出 300px 空白容器
  it('series 类型不在支持清单（candlestick）：维持代码块 --error，不出空白容器', async () => {
    const { core } = makeECharts();
    const w = mountFence(createChartRenderers(core), '{"series":[{"type":"candlestick"}]}', {
      streaming: false,
    });
    await flush();
    expect(w.find('pre.aix-md-chart-source--error').exists()).toBe(true);
    expect(w.find('.aix-md-chart').exists()).toBe(false);
  });

  it('组件卸载：dispose 释放活实例', async () => {
    const { core, instance } = makeECharts();
    const w = mountFence(createChartRenderers(core), OPTION, { streaming: false });
    await flush();
    expect(core.init).toHaveBeenCalledTimes(1);
    w.unmount();
    expect(instance.dispose).toHaveBeenCalledTimes(1);
  });

  it('回归：series.type=funnel 按 funnel 推断，注册 FunnelChart 而非误判成 line 的 LineChart', async () => {
    const { core } = makeECharts();
    const FUNNEL = '{"series":[{"type":"funnel","data":[{"value":1,"name":"a"}]}]}';
    const w = mountFence(createChartRenderers(core), FUNNEL, { streaming: false });
    await flush();
    expect(w.find('.aix-md-chart').exists()).toBe(true);
    const { FunnelChart, LineChart } = await import('echarts/charts');
    const usedExts = (core.use as ReturnType<typeof vi.fn>).mock.calls[0]![0] as unknown[];
    expect(usedExts).toContain(FunnelChart);
    expect(usedExts).not.toContain(LineChart);
  });

  it('回归：series.type=gauge 按 gauge 推断，注册 GaugeChart 而非误判成 line 的 LineChart', async () => {
    const { core } = makeECharts();
    const GAUGE = '{"series":[{"type":"gauge","data":[{"value":75}]}]}';
    const w = mountFence(createChartRenderers(core), GAUGE, { streaming: false });
    await flush();
    expect(w.find('.aix-md-chart').exists()).toBe(true);
    const { GaugeChart, LineChart } = await import('echarts/charts');
    const usedExts = (core.use as ReturnType<typeof vi.fn>).mock.calls[0]![0] as unknown[];
    expect(usedExts).toContain(GaugeChart);
    expect(usedExts).not.toContain(LineChart);
  });

  it('series.type=heatmap：注册 HeatmapChart + GridComponent + VisualMapComponent（色阶映射依赖后者）', async () => {
    const { core } = makeECharts();
    const HEATMAP = '{"series":[{"type":"heatmap","data":[[0,0,5]]}]}';
    const w = mountFence(createChartRenderers(core), HEATMAP, { streaming: false });
    await flush();
    expect(w.find('.aix-md-chart').exists()).toBe(true);
    const { HeatmapChart } = await import('echarts/charts');
    const { GridComponent, VisualMapComponent } = await import('echarts/components');
    const usedExts = (core.use as ReturnType<typeof vi.fn>).mock.calls[0]![0] as unknown[];
    expect(usedExts).toContain(HeatmapChart);
    expect(usedExts).toContain(GridComponent);
    expect(usedExts).toContain(VisualMapComponent);
  });

  it('series.type=graph：注册 GraphChart，自带布局不需要坐标系组件', async () => {
    const { core } = makeECharts();
    const GRAPH = '{"series":[{"type":"graph","data":[{"name":"a"}],"links":[]}]}';
    const w = mountFence(createChartRenderers(core), GRAPH, { streaming: false });
    await flush();
    expect(w.find('.aix-md-chart').exists()).toBe(true);
    const { GraphChart } = await import('echarts/charts');
    const { GridComponent } = await import('echarts/components');
    const usedExts = (core.use as ReturnType<typeof vi.fn>).mock.calls[0]![0] as unknown[];
    expect(usedExts).toContain(GraphChart);
    expect(usedExts).not.toContain(GridComponent);
  });

  it('series.type=tree：注册 TreeChart', async () => {
    const { core } = makeECharts();
    const TREE = '{"series":[{"type":"tree","data":[{"name":"root"}]}]}';
    const w = mountFence(createChartRenderers(core), TREE, { streaming: false });
    await flush();
    expect(w.find('.aix-md-chart').exists()).toBe(true);
    const { TreeChart } = await import('echarts/charts');
    const usedExts = (core.use as ReturnType<typeof vi.fn>).mock.calls[0]![0] as unknown[];
    expect(usedExts).toContain(TreeChart);
  });

  it('series.type=treemap：注册 TreemapChart', async () => {
    const { core } = makeECharts();
    const TREEMAP = '{"series":[{"type":"treemap","data":[{"name":"root","value":1}]}]}';
    const w = mountFence(createChartRenderers(core), TREEMAP, { streaming: false });
    await flush();
    expect(w.find('.aix-md-chart').exists()).toBe(true);
    const { TreemapChart } = await import('echarts/charts');
    const usedExts = (core.use as ReturnType<typeof vi.fn>).mock.calls[0]![0] as unknown[];
    expect(usedExts).toContain(TreemapChart);
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

  // 回归：started 标记失败后不复位——stale chunk 404 一次，后续所有 chart 围栏/块
  // 永久维持降级直到刷新页面
  it('loader 失败后允许重试：下一个围栏挂载重新加载并成功出图', async () => {
    const { core } = makeECharts();
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('stale chunk 404');
      return core;
    });
    const renderers = createLazyChartRenderers(loader);
    const w1 = mountFence(renderers, OPTION, { streaming: false });
    await flush();
    expect(w1.find('pre.aix-md-chart-source').exists()).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
    const w2 = mountFence(renderers, OPTION, { streaming: false });
    await flush();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(w2.find('.aix-md-chart').exists()).toBe(true);
  });
});
