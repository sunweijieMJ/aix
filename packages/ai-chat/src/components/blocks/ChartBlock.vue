<template>
  <div :class="ns.b()" role="img" :aria-label="ariaLabel">
    <div v-if="block.title" :class="ns.e('title')">{{ block.title }}</div>
    <!-- loading：骨架占位（固定高度，防列表滚动跳动） -->
    <div v-if="loading" :class="ns.e('skeleton')" />
    <!-- error / 非法 spec：降级为 alt 文字（教育无障碍：alt 即文字版数据） -->
    <div v-else-if="degraded" :class="ns.e('fallback')">{{ block.alt || t.chartError }}</div>
    <!-- 就绪：活实例容器；出图前叠骨架，避免空容器观感 -->
    <div v-else ref="container" :class="ns.e('canvas')">
      <div v-if="!rendered" :class="[ns.e('skeleton'), ns.is('overlay')]" />
    </div>
  </div>
</template>

<script lang="ts">
export interface ChartBlockProps {
  /** chart 类型的 block */
  block: Extract<ContentBlock, { type: 'chart' }>;
  /** 气泡上下文（status/role/key）；交互回写按 info.key 定位消息 */
  info: BubbleContentInfo;
  /** 打字机态：图表不逐字，仅注册表统一透传，本组件不消费 */
  typing?: boolean;
  /** 交互动作回调（切换图型/取点等经此上抛，逐层到 useChat.updateBlock） */
  onBlockAction?: BlockActionHandler;
}
</script>

<script setup lang="ts">
import { useNamespace, useLocale } from '@aix/hooks';
import { computed, onMounted, ref } from 'vue';
import { useEChartsRender } from '../../composables/useEChartsRender';
import { locale } from '../../locale';
import type {
  ContentBlock,
  BubbleContentInfo,
  BlockActionHandler,
  EChartsChartKind,
} from '../../types';
import { getSharedECharts, importECharts } from '../../utils/chartRenderers';

// 注册表统一向渲染器透传 block/info/typing/onBlockAction；关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = defineProps<ChartBlockProps>();
const ns = useNamespace('chart-block');
const { t } = useLocale(locale);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const loading = computed(() => props.block.state === 'loading');
// error 态或 spec 非对象 → 降级 alt 文字
const degraded = computed(() => props.block.state === 'error' || !isPlainObject(props.block.spec));

// 结构化路径与围栏共用同一 ECharts 懒加载单例
const echartsSource = getSharedECharts(importECharts);
onMounted(() => echartsSource.ensure?.());

const container = ref<HTMLElement | null>(null);
const kind = computed<EChartsChartKind>(() => props.block.kind);
// 仅在「非 loading、非降级、spec 合法」时给出图 option，否则 null（不出图）
const option = computed<Record<string, unknown> | null>(() =>
  !loading.value && !degraded.value && isPlainObject(props.block.spec) ? props.block.spec : null,
);

const { rendered } = useEChartsRender({ container, option, kind, echarts: echartsSource.instance });

const ariaLabel = computed(() => props.block.alt || props.block.title || t.value.chartLabel);
</script>

<style lang="scss">
.aix-chart-block {
  margin-top: var(--aix-marginSM);

  &__title {
    margin-bottom: var(--aix-marginXS);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    font-weight: var(--aix-fontWeightStrong);
  }

  // 固定高度容器：ECharts canvas 需要确定的非零高度才能正确 init 出图，也防虚拟列表滚动跳动。
  &__canvas {
    position: relative;
    width: 100%;
    height: 300px;
  }

  &__skeleton {
    min-height: 300px;
    animation: aix-chart-shimmer 1.4s ease infinite;
    border-radius: var(--aix-borderRadius);
    background: linear-gradient(
      90deg,
      var(--aix-colorFillTertiary) 25%,
      var(--aix-colorFillSecondary) 37%,
      var(--aix-colorFillTertiary) 63%
    );
    background-size: 400% 100%;

    // canvas 内出图前的 overlay：绝对定位盖满固定高度容器
    &.is-overlay {
      position: absolute;
      inset: 0;
    }
  }

  &__fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    padding: var(--aix-paddingMD);
    border: 1px dashed var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadius);
    background: var(--aix-colorFillQuaternary);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    text-align: center;
  }
}

@keyframes aix-chart-shimmer {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}
</style>
