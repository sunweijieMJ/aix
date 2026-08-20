<template>
  <div :class="ns.b()" role="img" :aria-label="ariaLabel">
    <div v-if="block.title" :class="ns.e('title')">{{ block.title }}</div>
    <!-- loading：结构骨架占位（固定高度，防列表滚动跳动），复用通用 Skeleton -->
    <Skeleton v-if="loading" loading height="300px" />
    <!-- error / 非法 spec / 渲染失败（setOption 抛错、不支持的图表类型）：降级为 alt 文字 -->
    <div v-else-if="degraded || renderFailed" :class="ns.e('fallback')">
      {{ block.alt || t.chartError }}
    </div>
    <!-- 就绪：活实例容器；出图前叠骨架，避免空容器观感 -->
    <div v-else ref="container" :class="ns.e('canvas')">
      <Skeleton v-if="!rendered" loading height="300px" :class="ns.is('overlay')" />
    </div>
  </div>
</template>

<script lang="ts">
export interface ChartBlockProps {
  /** chart 类型的 block */
  block: Extract<ContentBlock, { type: 'chart' }>;
  /** 气泡上下文（status/role/key）；本组件暂不消费，可选性与 BlockRendererProps 契约对齐 */
  info?: BubbleContentInfo;
  /** 打字机态（注册表统一透传 boolean | 节奏配置，图表不逐字，故不消费） */
  typing?: boolean | BubbleTypingConfig;
  /** 交互动作回调（切换图型/取点等经此上抛，逐层到 useChat.updateBlock） */
  onBlockAction?: BlockActionHandler;
}
</script>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { computed, onMounted, ref } from 'vue';
import { useAiChatLocale } from '../../composables/useAiChatLocale';
import { useEChartsRender } from '../../composables/useEChartsRender';
import type {
  ContentBlock,
  BubbleContentInfo,
  BubbleTypingConfig,
  BlockActionHandler,
  EChartsChartKind,
} from '../../types';
import { getSharedECharts, importECharts } from '../../utils/chartRenderers';
import Skeleton from '../Skeleton.vue';

// 注册表统一向渲染器透传 block/info/typing/onBlockAction；关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = defineProps<ChartBlockProps>();
const ns = useNamespace('chart-block');
const { t } = useAiChatLocale();

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

// renderFailed：setOption 抛错等渲染期失败（failed 按 option 身份记忆，换新 spec 自动允许重试）。
// 注意不能把 renderFailed 反馈进上方 option computed——option 变 null 会清失败态形成重试死循环
const { rendered, failed: renderFailed } = useEChartsRender({
  container,
  option,
  kind,
  echarts: echartsSource.instance,
});

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

    /* 与 ```chart 围栏路径（.aix-md-chart）共用同一变量：一次覆盖同时作用于结构化 chart 块
       与 markdown 围栏图表，避免两条渲染路径高度不一致 */
    height: var(--aix-chart-block-height, 300px);

    // canvas 内出图前的 Skeleton overlay：绝对定位盖满固定高度容器
    .aix-skeleton.is-overlay {
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
</style>
