/**
 * ChartBlock.stories.ts
 *
 * ECharts 结构化图表块（路径②）演示：柱/折/饼/散点/雷达 + loading 骨架 + 降级。
 * 内置块组件是 Bubble 注册表实现细节、不对外导出，story 直接按路径引入（与单测一致）。
 * 围栏路径①（```chart）的静态 / 流式演示见 `AI Chat/MarkdownRenderer` 的 Chart / ChartStreaming。
 * 注：echarts 为 optionalDependency，story 环境已安装时真实出图；未装则结构化块降级为 alt 文字。
 */
import type { Meta, StoryObj } from '@storybook/vue3';
import ChartBlock from '../src/components/blocks/ChartBlock.vue';
import type { BubbleContentInfo } from '../src/types';
import { chartBlock } from '../src/utils/helpers';

const info: BubbleContentInfo = { role: 'ai', key: 'story' };

const BAR = {
  xAxis: { type: 'category', data: ['一季度', '二季度', '三季度', '四季度'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [120, 200, 150, 260] }],
};
const LINE = {
  xAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五'] },
  yAxis: { type: 'value' },
  series: [{ type: 'line', data: [82, 93, 90, 120, 110], smooth: true }],
};
const PIE = {
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: '60%',
      data: [
        { value: 40, name: '语文' },
        { value: 30, name: '数学' },
        { value: 20, name: '英语' },
        { value: 10, name: '物理' },
      ],
    },
  ],
};
const SCATTER = {
  xAxis: {},
  yAxis: {},
  series: [
    {
      type: 'scatter',
      data: [
        [10, 8.04],
        [8, 6.95],
        [13, 7.58],
        [9, 8.81],
        [11, 8.33],
      ],
    },
  ],
};
const RADAR = {
  radar: {
    indicator: [
      { name: '攻击', max: 100 },
      { name: '防御', max: 100 },
      { name: '速度', max: 100 },
      { name: '智力', max: 100 },
    ],
  },
  series: [{ type: 'radar', data: [{ value: [80, 60, 90, 70], name: '角色 A' }] }],
};

const meta: Meta<typeof ChartBlock> = {
  title: 'AI Chat/组件/图表块（chart）',
  component: ChartBlock,
};
export default meta;
type Story = StoryObj<typeof ChartBlock>;

const render = (block: ReturnType<typeof chartBlock>) => () => ({
  components: { ChartBlock },
  setup: () => ({ block, info }),
  template: `<div style="max-width:640px"><ChartBlock :block="block" :info="info" /></div>`,
});

export const Bar: Story = { render: render(chartBlock('bar', BAR, { title: '季度销量' })) };
export const Line: Story = { render: render(chartBlock('line', LINE, { title: '每日活跃' })) };
export const Pie: Story = { render: render(chartBlock('pie', PIE, { title: '学科占比' })) };
export const Scatter: Story = {
  render: render(chartBlock('scatter', SCATTER, { title: '相关性' })),
};
export const Radar: Story = { render: render(chartBlock('radar', RADAR, { title: '能力雷达' })) };

/** loading：spec 未拼齐时的骨架占位（固定高度防抖） */
export const Loading: Story = {
  render: render(chartBlock('bar', {}, { title: '加载中', state: 'loading' })),
};

/**
 * 降级态（**故意**传非法 spec 演示兜底，非 bug）：spec 无法解析 / state=error 时不出图，
 * 而展示 `alt` 文字（教育无障碍的「文字版数据」），无 alt 则用默认文案。正常出图见上方 Bar / Pie 等。
 */
export const Degraded: Story = {
  render: () => ({
    components: { ChartBlock },
    setup: () => ({
      block: chartBlock('bar', 'not-a-valid-option', {
        title: '降级示例',
        alt: '柱状图：一至四季度销量分别为 120、200、150、260',
      }),
      info,
    }),
    template: `<div style="max-width:640px">
      <p style="margin:0 0 8px;font-size:13px;color:var(--aix-colorTextTertiary);">↓ 此图 spec 故意设为非法，演示降级为 alt 文字（正常图见 Bar / Pie 等 story）</p>
      <ChartBlock :block="block" :info="info" />
    </div>`,
  }),
};
