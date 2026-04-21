<template>
  <svg
    class="aix-flow-node__cross"
    viewBox="0 0 120 120"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
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
        <stop offset="0%" :stop-color="color" stop-opacity="0.7" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <!-- 每条臂：stroke 线段，uniform 宽度，渐变从中心向外透明 -->
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
 * 使用绝对定位覆盖在节点中心，四条渐变线段从中心向外延伸。
 * SVG 渐变需要唯一 id；`uid` 由使用方保证全局唯一以避免同页面 defs 冲突。
 */

/** 组件 Props */
interface Props {
  /** 用于生成 linearGradient id 的唯一后缀（同页内多个节点需互不相同） */
  uid: string;
  /** 渐变起始色（线段端点向外透明过渡） */
  color?: string;
}

defineOptions({ name: 'AixNodeActiveCross' });

withDefaults(defineProps<Props>(), {
  color: 'var(--aix-flowGraphCrossColor, #4e5969)',
});

/** 四个方向的三角形臂：points 为三角形顶点，渐变从中心(46,46)向外端 */
// 中心(60,60)，臂长 60px
const directions = [
  { id: 'cr', x1: 60, y1: 60, x2: 120, y2: 60, tx: 120, ty: 60 },
  { id: 'cl', x1: 60, y1: 60, x2: 0, y2: 60, tx: 0, ty: 60 },
  { id: 'cd', x1: 60, y1: 60, x2: 60, y2: 120, tx: 60, ty: 120 },
  { id: 'cu', x1: 60, y1: 60, x2: 60, y2: 0, tx: 60, ty: 0 },
];
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
