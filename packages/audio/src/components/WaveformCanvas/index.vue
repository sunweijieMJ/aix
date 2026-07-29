<template>
  <canvas
    ref="canvasRef"
    :width="actualWidth * dpr"
    :height="height * dpr"
    class="aix-waveform-canvas"
    role="img"
    :aria-label="ariaLabel"
    :style="{ width: `${actualWidth}px`, height: `${height}px` }"
  />
</template>

<script setup lang="ts">
/**
 * WaveformCanvas - 波形可视化组件
 * 接收归一化波形数据点（0-1），用 Canvas 绘制条形波形
 * 样式通过 CSS Variables 完全暴露，消费方可覆盖
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { WaveformCanvasProps } from '../../types';

/** 无法解析 CSS 变量时的兜底色（对应 --aix-colorTextQuaternary 默认值） */
const FALLBACK_COLOR = '#c9cdd4';
/** width 未指定时的初始宽度（px），随后由 ResizeObserver 接管 */
const DEFAULT_WIDTH = 320;

const props = withDefaults(defineProps<WaveformCanvasProps>(), {
  data: () => [],
  progress: 0,
  width: 0,
  height: 32,
  barGap: 4,
  barWidth: 2,
  inactiveColor: `var(--aix-waveform-inactive, var(--aix-colorTextQuaternary, ${FALLBACK_COLOR}))`,
  activeColor: 'var(--aix-waveform-active, var(--aix-colorPrimary, #1677ff))',
});

defineOptions({ name: 'AixWaveformCanvas' });

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let containerObserver: ResizeObserver | null = null;
const actualWidth = ref(props.width || DEFAULT_WIDTH);
const dpr = window.devicePixelRatio || 1;

const ariaLabel = computed(() => {
  if (!props.data?.length) return '音频波形（暂无数据）';
  const percent = Math.round((props.progress ?? 0) * 100);
  return `音频波形，播放进度 ${percent}%`;
});

onMounted(() => {
  if (!canvasRef.value) return;
  ctx = canvasRef.value.getContext('2d');
  syncWidthSource();
  nextTick(() => draw());
});

onUnmounted(() => {
  stopObservingContainer();
});

/**
 * width prop 在指定值与自适应之间切换时，重建宽度来源
 * （旧实现只在 onMounted 读一次，运行时改 :width 完全无效）
 */
function syncWidthSource() {
  stopObservingContainer();

  if (props.width) {
    actualWidth.value = props.width;
    return;
  }

  const parent = canvasRef.value?.parentElement;
  if (!parent) {
    actualWidth.value = DEFAULT_WIDTH;
    return;
  }

  containerObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width;
    if (width) {
      actualWidth.value = Math.floor(width);
      nextTick(() => draw());
    }
  });
  containerObserver.observe(parent);
  actualWidth.value = parent.clientWidth || DEFAULT_WIDTH;
}

function stopObservingContainer() {
  containerObserver?.disconnect();
  containerObserver = null;
}

watch(() => props.width, syncWidthSource);

watch([() => props.data, () => props.progress, actualWidth], () => draw(), { flush: 'post' });

function draw() {
  if (!ctx || !canvasRef.value) return;

  const { height, data, barWidth, barGap } = props;
  const width = actualWidth.value;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width * dpr, height * dpr);
  ctx.scale(dpr, dpr);

  if (!data || data.length === 0) {
    drawPlaceholder(width, height);
    return;
  }

  const barCount = Math.floor(width / (barWidth + barGap));
  const centerY = height / 2;
  const progressIndex = Math.floor(barCount * props.progress);

  // 每帧只解析两次颜色。放在循环内会对每根柱子调用 getComputedStyle，
  // 触发数十次样式重算，录音期间按 rAF 频率绘制时开销显著
  const activeColor = resolveColor(props.activeColor);
  const inactiveColor = resolveColor(props.inactiveColor);

  ctx.globalAlpha = 1;

  if (data.length <= barCount) {
    // 数据不足时右对齐：左侧空白占位，右侧填实际波形
    const emptyCount = barCount - data.length;
    for (let i = 0; i < barCount; i++) {
      const x = Math.round(i * (barWidth + barGap));
      ctx.fillStyle = i < progressIndex ? activeColor : inactiveColor;

      if (i < emptyCount) {
        roundRect(ctx, x, Math.round(centerY - 1), barWidth, 2, barWidth / 2);
      } else {
        const value = data[i - emptyCount] ?? 0;
        const barHeight = Math.max(2, Math.round(value * height));
        roundRect(ctx, x, Math.round(centerY - barHeight / 2), barWidth, barHeight, barWidth / 2);
      }
      ctx.fill();
    }
  } else {
    // 数据超过 barCount：浮点步长均匀降采样
    const step = data.length / barCount;
    for (let i = 0; i < barCount; i++) {
      const value = data[Math.floor(i * step)] ?? 0;
      const barHeight = Math.max(2, Math.round(value * height));
      const x = Math.round(i * (barWidth + barGap));
      const y = Math.round(centerY - barHeight / 2);
      ctx.fillStyle = i < progressIndex ? activeColor : inactiveColor;
      roundRect(ctx, x, y, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    }
  }
}

function drawPlaceholder(width: number, height: number) {
  if (!ctx) return;
  const { barWidth, barGap } = props;
  const barCount = Math.floor(width / (barWidth + barGap));
  const centerY = height / 2;
  const placeholderHeights = [8, 12, 16, 10, 20, 14, 24, 18, 16, 12, 10, 8];
  ctx.fillStyle = resolveColor(props.inactiveColor);
  ctx.globalAlpha = 1;
  for (let i = 0; i < barCount; i++) {
    const h = placeholderHeights[i % placeholderHeights.length] ?? 8;
    const x = Math.round(i * (barWidth + barGap));
    roundRect(ctx, x, Math.round(centerY - h / 2), barWidth, h, barWidth / 2);
    ctx.fill();
  }
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof c.roundRect === 'function') {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  } else {
    // 兼容不支持 roundRect 的浏览器
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }
}

/**
 * 解析 CSS 变量为实际颜色值，正确处理 var(--name, fallback) 语法
 */
function resolveColor(color: string): string {
  if (!color.startsWith('var(')) return color;
  const match = color.match(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/);
  if (!match) return FALLBACK_COLOR;
  const [, varName, cssFallback] = match;
  if (!varName) return FALLBACK_COLOR;
  const resolved = canvasRef.value
    ? getComputedStyle(canvasRef.value).getPropertyValue(varName).trim()
    : '';
  return resolved || cssFallback?.trim() || FALLBACK_COLOR;
}
</script>

<style lang="scss">
.aix-waveform-canvas {
  display: block;
}
</style>
