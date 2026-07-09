/**
 * ChartBlock.stories.ts
 *
 * ECharts 结构化图表块（路径②）演示：柱/折/饼/散点/雷达/漏斗/仪表盘/热力图/关系图/树图/矩形树图
 * + loading 骨架 + 降级。
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
const FUNNEL = {
  tooltip: { trigger: 'item' },
  series: [
    {
      type: 'funnel',
      left: '10%',
      right: '10%',
      data: [
        { value: 1000, name: '访问' },
        { value: 600, name: '注册' },
        { value: 300, name: '下单' },
        { value: 100, name: '支付' },
      ],
    },
  ],
};
const GAUGE = {
  series: [
    {
      type: 'gauge',
      min: 0,
      max: 100,
      detail: { formatter: '{value}%' },
      data: [{ value: 75, name: '完成率' }],
    },
  ],
};
const HEATMAP = {
  tooltip: { position: 'top' },
  grid: { height: '70%', top: '5%' },
  xAxis: {
    type: 'category',
    data: ['周一', '周二', '周三', '周四', '周五'],
    splitArea: { show: true },
  },
  yAxis: { type: 'category', data: ['上午', '下午', '晚上'], splitArea: { show: true } },
  visualMap: {
    min: 0,
    max: 10,
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: '0%',
  },
  series: [
    {
      type: 'heatmap',
      data: [
        [0, 0, 3],
        [1, 0, 5],
        [2, 0, 1],
        [3, 0, 7],
        [4, 0, 2],
        [0, 1, 4],
        [1, 1, 6],
        [2, 1, 2],
        [3, 1, 8],
        [4, 1, 3],
        [0, 2, 1],
        [1, 2, 2],
        [2, 2, 9],
        [3, 2, 3],
        [4, 2, 5],
      ],
      label: { show: true },
    },
  ],
};
const GRAPH = {
  tooltip: {},
  series: [
    {
      type: 'graph',
      layout: 'force',
      roam: true,
      label: { show: true },
      data: [
        { name: '用户' },
        { name: '订单' },
        { name: '商品' },
        { name: '仓库' },
        { name: '物流' },
      ],
      links: [
        { source: '用户', target: '订单' },
        { source: '订单', target: '商品' },
        { source: '订单', target: '物流' },
        { source: '物流', target: '仓库' },
      ],
      force: { repulsion: 100 },
    },
  ],
};
const TREE = {
  tooltip: { trigger: 'item' },
  series: [
    {
      type: 'tree',
      data: [
        {
          name: '产品线',
          children: [
            { name: '组件库', children: [{ name: 'ai-chat' }, { name: 'theme' }] },
            { name: '工具包', children: [{ name: 'i18n-tools' }] },
          ],
        },
      ],
      top: '5%',
      left: '12%',
      bottom: '5%',
      right: '24%',
      symbolSize: 8,
      label: { position: 'left', verticalAlign: 'middle', align: 'right' },
      leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
      expandAndCollapse: true,
    },
  ],
};
const TREEMAP = {
  series: [
    {
      type: 'treemap',
      data: [
        {
          name: '前端',
          value: 40,
          children: [
            { name: 'Vue', value: 25 },
            { name: 'React', value: 15 },
          ],
        },
        { name: '后端', value: 35 },
        { name: '测试', value: 15 },
        { name: '文档', value: 10 },
      ],
    },
  ],
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
export const Funnel: Story = {
  render: render(chartBlock('funnel', FUNNEL, { title: '转化漏斗' })),
};
export const Gauge: Story = {
  render: render(chartBlock('gauge', GAUGE, { title: '完成率' })),
};
export const Heatmap: Story = {
  render: render(chartBlock('heatmap', HEATMAP, { title: '一周活跃时段' })),
};
export const Graph: Story = {
  render: render(chartBlock('graph', GRAPH, { title: '业务关系图' })),
};
export const Tree: Story = {
  render: render(chartBlock('tree', TREE, { title: '产品线结构' })),
};
export const Treemap: Story = {
  render: render(chartBlock('treemap', TREEMAP, { title: '工作量占比' })),
};

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
