<template>
  <svg
    class="aix-flow-node__cross"
    viewBox="0 0 120 120"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <!-- 多色（>4）时：共享一个多色渐变，方向从中心向右 -->
      <linearGradient
        v-if="isMultiColor"
        :id="`cm-${uid}`"
        x1="60"
        y1="60"
        x2="120"
        y2="60"
        gradientUnits="userSpaceOnUse"
      >
        <stop
          v-for="(c, i) in resolvedColors"
          :key="i"
          :offset="`${(i / (resolvedColors.length - 1)) * 100}%`"
          :stop-color="c"
          :stop-opacity="i === resolvedColors.length - 1 ? 0 : 0.7"
        />
      </linearGradient>
      <!-- 单色或 ≤4 色时：每条臂独立渐变 -->
      <linearGradient
        v-for="(dir, i) in directions"
        v-else
        :id="`${dir.id}-${uid}`"
        :key="dir.id"
        :x1="dir.x1"
        :y1="dir.y1"
        :x2="dir.x2"
        :y2="dir.y2"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" :stop-color="armColor(i)" stop-opacity="0.7" />
        <stop offset="100%" :stop-color="armColor(i)" stop-opacity="0" />
      </linearGradient>
    </defs>

    <path
      v-for="dir in directions"
      :key="`p-${dir.id}`"
      :d="`M60 60 L${dir.tx} ${dir.ty}`"
      :stroke="isMultiColor ? `url(#cm-${uid})` : `url(#${dir.id}-${uid})`"
      stroke-width="2"
      stroke-linecap="round"
      class="aix-cross-arm"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * 节点 active 状态的四向渐变十字装饰。
 * - 单色：4条臂同色渐变
 * - 2~4色：每条臂按索引取色
 * - >4色：所有臂共享多色渐变
 */
import { computed } from 'vue';

interface Props {
  uid: string;
  color?: string;
  /** 多路径颜色列表，优先级高于 color */
  colors?: string[];
}

defineOptions({ name: 'AixNodeActiveCross' });

const props = withDefaults(defineProps<Props>(), {
  color: 'var(--aix-flowGraphCrossColor, #4e5969)',
  colors: () => [],
});

const directions = [
  { id: 'cr', x1: 60, y1: 60, x2: 120, y2: 60, tx: 120, ty: 60 },
  { id: 'cl', x1: 60, y1: 60, x2: 0, y2: 60, tx: 0, ty: 60 },
  { id: 'cd', x1: 60, y1: 60, x2: 60, y2: 120, tx: 60, ty: 120 },
  { id: 'cu', x1: 60, y1: 60, x2: 60, y2: 0, tx: 60, ty: 0 },
];

const resolvedColors = computed(() => (props.colors.length ? props.colors : [props.color]));

/** 超过4色时用多色共享渐变 */
const isMultiColor = computed(() => resolvedColors.value.length > 4);

/** ≤4色时每条臂按索引循环取色 */
function armColor(i: number): string {
  const c = resolvedColors.value;
  return c[i % c.length]!;
}
</script>

<style>
.aix-flow-node__cross {
  position: absolute;
  z-index: 0;
  top: 50%;
  left: 50%;
  width: 120px;
  height: 120px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.aix-cross-arm {
  animation: aix-cross-expand 0.35s ease-out forwards;
  stroke-dasharray: 60;
  stroke-dashoffset: 60;
}

@keyframes aix-cross-expand {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
