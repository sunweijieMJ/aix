<template>
  <div class="aix-chart-renderer" :style="{ height: chartHeight }">
    <div ref="chartRef" class="aix-chart-renderer__container" />
    <div v-if="error" class="aix-chart-renderer__error">
      <span>图表渲染错误: {{ error }}</span>
    </div>
    <div v-if="loading" class="aix-chart-renderer__loading">
      <div class="aix-chart-renderer__spinner" />
      <span>加载图表中...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { RendererProps } from '../../core/types';
import { parseAndValidateChartData } from '../../utils';
import type { ChartData } from './index';

const props = withDefaults(
  defineProps<
    RendererProps<ChartData | string> & {
      height?: string | number;
    }
  >(),
  {
    height: 300,
  },
);

const chartRef = ref<HTMLElement>();
const loading = ref(true);
const error = ref<string>('');

// 图表实例
let chartInstance: ReturnType<(typeof import('echarts'))['init']> | null = null;

const chartHeight = computed(() => {
  const h = props.height;
  return typeof h === 'number' ? `${h}px` : h;
});

// 使用工具函数解析并验证图表数据
const chartValidation = computed(() =>
  parseAndValidateChartData<ChartData>(props.data),
);

const chartData = computed<ChartData>(() => chartValidation.value.data);

// 渲染图表
async function renderChart() {
  if (!chartRef.value) return;

  loading.value = true;
  error.value = '';

  try {
    // 检查数据有效性
    if (!chartValidation.value.valid) {
      throw new Error(chartValidation.value.error || '无效的图表数据');
    }

    // 动态导入 ECharts
    const echarts = await import('echarts');

    // 销毁旧实例
    if (chartInstance) {
      chartInstance.dispose();
    }

    // 创建新实例
    chartInstance = echarts.init(chartRef.value);

    // 构建配置
    let option: Record<string, unknown>;
    const data = chartData.value;

    if (data.option) {
      // 直接使用 ECharts option
      option = data.option;
    } else if (data.series) {
      // 直接使用 series 配置
      // 检查是否是雷达图（series 中包含 type: 'radar' 或有 radar 配置）
      const isRadarChart =
        data.radar || data.series.some((s) => s.type === 'radar');

      if (isRadarChart) {
        option = {
          tooltip: data.tooltip || { trigger: 'item' },
          radar: data.radar || {},
          series: data.series,
          ...(data.legend && { legend: data.legend }),
        };
      } else {
        option = {
          tooltip: data.tooltip || { trigger: 'axis' },
          xAxis: data.xAxis || { type: 'category' },
          yAxis: data.yAxis || { type: 'value' },
          series: data.series,
          ...(data.legend && { legend: data.legend }),
          ...(data.grid && { grid: data.grid }),
        };
      }
    } else if (data.data) {
      // 从简化数据构建 option
      const { labels, datasets } = data.data;
      const chartType = data.type || 'line';

      // 雷达图需要特殊处理
      if (chartType === 'radar') {
        option = {
          tooltip: { trigger: 'item' },
          legend: { data: datasets?.map((d) => d.label) },
          radar: {
            indicator: labels?.map((label) => ({ name: label })) || [],
          },
          series: [
            {
              type: 'radar',
              data: datasets?.map((d) => ({
                name: d.label,
                value: d.data,
                itemStyle: d.backgroundColor
                  ? { color: d.backgroundColor }
                  : undefined,
                areaStyle: d.backgroundColor
                  ? { color: d.backgroundColor, opacity: 0.2 }
                  : { opacity: 0.2 },
              })),
            },
          ],
        };
      } else if (chartType === 'pie') {
        // 饼图处理
        option = {
          tooltip: { trigger: 'item' },
          legend: { data: datasets?.map((d) => d.label) },
          series: datasets?.map((d) => ({
            name: d.label,
            type: 'pie',
            data: d.data.map((value, i) => ({
              value,
              name: labels?.[i] || `Item ${i}`,
            })),
            itemStyle: d.backgroundColor
              ? { color: d.backgroundColor }
              : undefined,
          })),
        };
      } else {
        // 其他图表类型（line, bar, scatter 等）
        option = {
          tooltip: { trigger: 'axis' },
          legend: { data: datasets?.map((d) => d.label) },
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: datasets?.map((d) => ({
            name: d.label,
            type: chartType,
            data: d.data,
            itemStyle: d.backgroundColor
              ? { color: d.backgroundColor }
              : undefined,
          })),
        };
      }
    } else {
      throw new Error('无效的图表数据：缺少 option、series 或 data 配置');
    }

    chartInstance.setOption(option);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    console.error('[ChartRenderer] 渲染失败:', e);
  } finally {
    loading.value = false;
  }
}

// 处理窗口大小变化
function handleResize() {
  chartInstance?.resize();
}

// 监听数据变化
watch(chartData, () => renderChart(), { deep: true });

onMounted(() => {
  renderChart();
  // SSR 兼容：确保 window 存在
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize);
  }
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
});
</script>

<style lang="scss">
.aix-chart-renderer {
  position: relative;
  width: 100%;
  min-height: 200px;

  &__container {
    width: 100%;
    height: 100%;
  }

  &__error {
    display: flex;
    position: absolute;
    align-items: center;
    justify-content: center;
    padding: 16px;
    color: var(--aix-error, #ef4444);
    font-size: 14px;
    inset: 0;
  }

  &__loading {
    display: flex;
    position: absolute;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--aix-text-secondary, #6b7280);
    font-size: 14px;
    inset: 0;
    gap: 12px;
  }

  &__spinner {
    width: 24px;
    height: 24px;
    animation: aix-spin 0.8s linear infinite;
    border: 3px solid var(--aix-border, #e5e7eb);
    border-radius: 50%;
    border-top-color: var(--aix-primary, #3b82f6);
  }
}
</style>
