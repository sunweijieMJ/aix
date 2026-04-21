<template>
  <svg
    class="aix-flow-node__cross"
    viewBox="0 0 120 120"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <!-- 每条臂一个沿臂方向的渐变，单色与多色统一处理 -->
      <linearGradient
        v-for="dir in directions"
        :id="`${dir.id}-${uid}`"
        :key="dir.id"
        :x1="dir.x1"
        :y1="dir.y1"
        :x2="dir.x2"
        :y2="dir.y2"
        gradientUnits="userSpaceOnUse"
      >
        <stop
          v-for="(s, j) in armStops"
          :key="j"
          :offset="s.offset"
          :stop-color="s.color"
          :stop-opacity="s.opacity"
        />
      </linearGradient>
    </defs>

    <path
      v-for="dir in directions"
      :key="`p-${dir.id}`"
      :d="`M60 60 L${dir.tx} ${dir.ty}`"
      :stroke="`url(#${dir.id}-${uid})`"
      stroke-width="2"
      stroke-linecap="round"
      class="aix-cross-arm"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * 节点 active 状态的四向渐变十字装饰。
 * - 单色：每条臂从 0.7 不透明度 → 0（淡出）。
 * - 多色：每条臂沿自身方向均匀分布多色，末色 alpha 为 0（淡出）。
 */
import { computed } from 'vue';

interface Props {
  uid: string;
  color: string;
  /** 多路径颜色列表，优先级高于 color */
  colors?: string[];
}

defineOptions({ name: 'AixNodeActiveCross' });

const props = withDefaults(defineProps<Props>(), {
  colors: () => [],
});

const directions = [
  { id: 'cr', x1: 60, y1: 60, x2: 120, y2: 60, tx: 120, ty: 60 },
  { id: 'cl', x1: 60, y1: 60, x2: 0, y2: 60, tx: 0, ty: 60 },
  { id: 'cd', x1: 60, y1: 60, x2: 60, y2: 120, tx: 60, ty: 120 },
  { id: 'cu', x1: 60, y1: 60, x2: 60, y2: 0, tx: 60, ty: 0 },
];

const resolvedColors = computed(() => (props.colors.length ? props.colors : [props.color]));

/** 每条臂共享的 stop 列表：沿臂方向均匀分布各色，末端 alpha=0 实现淡出 */
const armStops = computed(() => {
  const colors = resolvedColors.value;
  if (colors.length === 1) {
    return [
      { offset: '0%', color: colors[0]!, opacity: 0.7 },
      { offset: '100%', color: colors[0]!, opacity: 0 },
    ];
  }
  return colors.map((c, i) => ({
    offset: `${(i / (colors.length - 1)) * 100}%`,
    color: c,
    opacity: i === colors.length - 1 ? 0 : 0.7,
  }));
});
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
