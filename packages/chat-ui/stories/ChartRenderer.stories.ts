/**
 * @fileoverview Chart 渲染器 Stories
 * 展示 ECharts 图表渲染的各种用法
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { ContentRenderer, setup } from '../src';

// 确保初始化
setup({ preset: 'full' });

const meta: Meta<typeof ContentRenderer> = {
  title: 'ChatUI/Renderers/Chart',
  component: ContentRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Chart 渲染器用于显示数据可视化图表，基于 ECharts 实现。支持折线图、柱状图、饼图、散点图、雷达图等多种图表类型。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 折线图
 */
export const LineChart: Story = {
  args: {
    content: JSON.stringify({
      chartType: 'line',
      title: { text: '销售趋势' },
      xAxis: {
        type: 'category',
        data: ['一月', '二月', '三月', '四月', '五月', '六月'],
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '销售额',
          type: 'line',
          data: [150, 230, 224, 218, 135, 147],
          smooth: true,
        },
      ],
    }),
    theme: 'light',
  },
};

/**
 * 柱状图
 */
export const BarChart: Story = {
  args: {
    content: JSON.stringify({
      chartType: 'bar',
      title: { text: '季度业绩' },
      xAxis: {
        type: 'category',
        data: ['Q1', 'Q2', 'Q3', 'Q4'],
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '2023',
          type: 'bar',
          data: [320, 332, 301, 334],
        },
        {
          name: '2024',
          type: 'bar',
          data: [420, 432, 401, 434],
        },
      ],
    }),
    theme: 'light',
  },
};

/**
 * 饼图
 */
export const PieChart: Story = {
  args: {
    content: JSON.stringify({
      chartType: 'pie',
      title: { text: '访问来源', left: 'center' },
      series: [
        {
          name: '访问来源',
          type: 'pie',
          radius: '50%',
          data: [
            { value: 1048, name: '搜索引擎' },
            { value: 735, name: '直接访问' },
            { value: 580, name: '邮件营销' },
            { value: 484, name: '联盟广告' },
            { value: 300, name: '视频广告' },
          ],
        },
      ],
    }),
    theme: 'light',
  },
};

/**
 * 环形图
 */
export const DoughnutChart: Story = {
  args: {
    content: JSON.stringify({
      chartType: 'pie',
      title: { text: '资源分配', left: 'center' },
      series: [
        {
          name: '资源',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          label: { show: false, position: 'center' },
          emphasis: {
            label: { show: true, fontSize: 20, fontWeight: 'bold' },
          },
          data: [
            { value: 40, name: 'CPU' },
            { value: 30, name: '内存' },
            { value: 20, name: '存储' },
            { value: 10, name: '网络' },
          ],
        },
      ],
    }),
    theme: 'light',
  },
};

/**
 * 散点图
 */
export const ScatterChart: Story = {
  args: {
    content: JSON.stringify({
      chartType: 'scatter',
      title: { text: '身高体重分布' },
      xAxis: { name: '身高 (cm)' },
      yAxis: { name: '体重 (kg)' },
      series: [
        {
          name: '男性',
          type: 'scatter',
          symbolSize: 10,
          data: [
            [170, 65],
            [175, 70],
            [180, 75],
            [165, 60],
            [172, 68],
            [178, 72],
            [168, 63],
            [182, 80],
            [176, 71],
            [169, 64],
          ],
        },
        {
          name: '女性',
          type: 'scatter',
          symbolSize: 10,
          data: [
            [160, 50],
            [165, 55],
            [158, 48],
            [162, 52],
            [155, 45],
            [168, 58],
            [163, 54],
            [157, 47],
            [166, 56],
            [161, 51],
          ],
        },
      ],
    }),
    theme: 'light',
  },
};

/**
 * 雷达图
 */
export const RadarChart: Story = {
  args: {
    content: JSON.stringify({
      chartType: 'radar',
      title: { text: '技能评估' },
      radar: {
        indicator: [
          { name: '前端', max: 100 },
          { name: '后端', max: 100 },
          { name: '数据库', max: 100 },
          { name: 'DevOps', max: 100 },
          { name: '算法', max: 100 },
          { name: '沟通', max: 100 },
        ],
      },
      series: [
        {
          name: '技能',
          type: 'radar',
          data: [
            {
              value: [90, 75, 70, 60, 65, 85],
              name: '候选人 A',
            },
            {
              value: [70, 90, 85, 80, 70, 75],
              name: '候选人 B',
            },
          ],
        },
      ],
    }),
    theme: 'light',
  },
};

/**
 * 面积图
 */
export const AreaChart: Story = {
  args: {
    content: JSON.stringify({
      chartType: 'line',
      title: { text: '网站流量' },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'UV',
          type: 'line',
          areaStyle: {},
          data: [820, 932, 901, 934, 1290, 1330, 1320],
        },
        {
          name: 'PV',
          type: 'line',
          areaStyle: {},
          data: [1820, 2932, 2901, 2934, 3290, 3330, 3320],
        },
      ],
    }),
    theme: 'light',
  },
};

/**
 * 堆叠柱状图
 */
export const StackedBarChart: Story = {
  args: {
    content: JSON.stringify({
      chartType: 'bar',
      title: { text: '产品销量' },
      legend: { data: ['手机', '平板', '电脑'] },
      xAxis: {
        type: 'category',
        data: ['一月', '二月', '三月', '四月', '五月'],
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '手机',
          type: 'bar',
          stack: 'total',
          data: [320, 302, 301, 334, 390],
        },
        {
          name: '平板',
          type: 'bar',
          stack: 'total',
          data: [120, 132, 101, 134, 90],
        },
        {
          name: '电脑',
          type: 'bar',
          stack: 'total',
          data: [220, 182, 191, 234, 290],
        },
      ],
    }),
    theme: 'light',
  },
};

/**
 * 多图表展示
 */
export const MultipleCharts: Story = {
  render: () => ({
    components: { ContentRenderer },
    setup() {
      const lineData = JSON.stringify({
        chartType: 'line',
        title: { text: '趋势分析' },
        xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: [150, 230, 224, 218, 135] }],
      });

      const pieData = JSON.stringify({
        chartType: 'pie',
        title: { text: '占比分析', left: 'center' },
        series: [
          {
            type: 'pie',
            radius: '60%',
            data: [
              { value: 40, name: 'A类' },
              { value: 30, name: 'B类' },
              { value: 20, name: 'C类' },
              { value: 10, name: 'D类' },
            ],
          },
        ],
      });

      return { lineData, pieData };
    },
    template: `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;">
          <ContentRenderer :content="lineData" />
        </div>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;">
          <ContentRenderer :content="pieData" />
        </div>
      </div>
    `,
  }),
};

/**
 * 暗色主题
 */
export const DarkTheme: Story = {
  render: () => ({
    components: { ContentRenderer },
    setup() {
      const chartData = JSON.stringify({
        chartType: 'bar',
        backgroundColor: 'transparent',
        title: { text: '暗色主题图表', textStyle: { color: '#fff' } },
        xAxis: {
          type: 'category',
          data: ['A', 'B', 'C', 'D', 'E'],
          axisLine: { lineStyle: { color: '#666' } },
          axisLabel: { color: '#ccc' },
        },
        yAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: '#666' } },
          axisLabel: { color: '#ccc' },
          splitLine: { lineStyle: { color: '#333' } },
        },
        series: [
          {
            type: 'bar',
            data: [120, 200, 150, 80, 70],
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: '#83bff6' },
                  { offset: 1, color: '#188df0' },
                ],
              },
            },
          },
        ],
      });
      return { chartData };
    },
    template: `
      <div style="padding: 24px; background: #1a1a1a; border-radius: 8px;" data-theme="dark">
        <ContentRenderer :content="chartData" theme="dark" />
      </div>
    `,
  }),
};
