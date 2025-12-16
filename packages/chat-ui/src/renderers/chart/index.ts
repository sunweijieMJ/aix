/**
 * @fileoverview Chart 渲染器
 */

import type { RendererDefinition } from '../../core/types';
import { isChartJson } from '../../utils/detect';

export interface ChartData {
  /** 图表类型（简化格式） */
  type?: 'line' | 'bar' | 'pie' | 'scatter' | 'radar';
  /** ECharts 原生 option 配置 */
  option?: Record<string, unknown>;
  /** ECharts series 配置 */
  series?: Array<Record<string, unknown>>;
  /** ECharts xAxis 配置 */
  xAxis?: Record<string, unknown>;
  /** ECharts yAxis 配置 */
  yAxis?: Record<string, unknown>;
  /** ECharts radar 配置（雷达图） */
  radar?: Record<string, unknown>;
  /** ECharts legend 配置 */
  legend?: Record<string, unknown>;
  /** ECharts grid 配置 */
  grid?: Record<string, unknown>;
  /** ECharts tooltip 配置 */
  tooltip?: Record<string, unknown>;
  /** 类型标识 */
  __type?: 'chart';
  /** 图表类型别名 */
  chartType?: string;
  /** 简化数据格式 */
  data?: {
    labels?: string[];
    datasets?: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string;
    }>;
  };
}

export const chartRenderer: RendererDefinition<ChartData> = {
  name: 'chart',
  type: 'chart',
  priority: 15,
  streaming: false,
  description: '图表渲染器 (ECharts)',

  parser: (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },

  detector: isChartJson,

  loader: () => import('./ChartRenderer.vue').then((m) => m.default),
};

export { default as ChartRenderer } from './ChartRenderer.vue';
