import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChartBlock from '../src/components/blocks/ChartBlock.vue';
import type { EChartsLike } from '../src/composables/useEChartsRender';
import { __resetChartKinds } from '../src/composables/useEChartsRender';
import type { BubbleContentInfo } from '../src/types';
import { __setSharedEChartsForTest, __resetSharedECharts } from '../src/utils/chartRenderers';
import { chartBlock } from '../src/utils/helpers';

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

const info: BubbleContentInfo = { role: 'ai', key: 'm1' };
const OPTION = { series: [{ type: 'bar', data: [1, 2, 3] }] };

const makeECharts = (): {
  core: EChartsLike;
  instance: { setOption: ReturnType<typeof vi.fn> };
} => {
  const instance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
  return { core: { init: vi.fn(() => instance), use: vi.fn() }, instance };
};

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await flushPromises();
    await new Promise((r) => setTimeout(r));
  }
};

describe('ChartBlock（结构化图表块）', () => {
  beforeEach(() => {
    __resetChartKinds();
    __resetSharedECharts();
  });

  it('容器始终 role="img"，aria-label 取 alt > title > 默认', () => {
    const w = mount(ChartBlock, {
      props: { block: chartBlock('bar', OPTION, { alt: '二次函数图像' }), info },
    });
    expect(w.attributes('role')).toBe('img');
    expect(w.attributes('aria-label')).toBe('二次函数图像');
  });

  it('state=loading：渲染骨架占位，不出图', () => {
    const w = mount(ChartBlock, {
      props: { block: chartBlock('bar', OPTION, { state: 'loading' }), info },
    });
    expect(w.find('.aix-skeleton').exists()).toBe(true);
    expect(w.find('.aix-chart-block__canvas').exists()).toBe(false);
  });

  it('state=error：降级为 alt 文字（无 alt 用默认文案）', () => {
    const withAlt = mount(ChartBlock, {
      props: {
        block: chartBlock('bar', OPTION, { state: 'error', alt: '开口向上的抛物线' }),
        info,
      },
    });
    expect(withAlt.find('.aix-chart-block__fallback').text()).toBe('开口向上的抛物线');

    const noAlt = mount(ChartBlock, {
      props: { block: chartBlock('bar', OPTION, { state: 'error' }), info },
    });
    expect(noAlt.find('.aix-chart-block__fallback').text()).toBe('图表无法渲染');
  });

  it('spec 非对象：降级为 fallback，不出图', () => {
    const w = mount(ChartBlock, {
      props: { block: chartBlock('bar', 'not-an-object'), info },
    });
    expect(w.find('.aix-chart-block__fallback').exists()).toBe(true);
    expect(w.find('.aix-chart-block__canvas').exists()).toBe(false);
  });

  it('合法 spec + 引擎就绪：渲染容器并出图（init + setOption）', async () => {
    const { core, instance } = makeECharts();
    __setSharedEChartsForTest(core);
    const w = mount(ChartBlock, { props: { block: chartBlock('bar', OPTION), info } });
    await flush();
    expect(w.find('.aix-chart-block__canvas').exists()).toBe(true);
    expect(core.init).toHaveBeenCalledTimes(1);
    expect(instance.setOption).toHaveBeenCalledTimes(1);
  });

  it('title 提供时渲染标题', () => {
    const w = mount(ChartBlock, {
      props: { block: chartBlock('pie', OPTION, { title: '销售占比' }), info },
    });
    expect(w.find('.aix-chart-block__title').text()).toBe('销售占比');
  });
});
