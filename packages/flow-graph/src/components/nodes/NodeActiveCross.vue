<template>
  <svg
    class="aix-flow-node__cross"
    viewBox="0 0 92 92"
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
        <stop offset="0%" :stop-color="color" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path
      v-for="dir in directions"
      :key="`p-${dir.id}`"
      :d="`M46 46 L${dir.x2} ${dir.y2}`"
      :stroke="`url(#${dir.id}-${uid})`"
      stroke-width="2"
      stroke-linecap="round"
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

/** 四个方向的端点坐标：右 / 左 / 下 / 上；中心固定在 (46,46) */
const directions = [
  { id: 'cr', x1: 46, y1: 46, x2: 92, y2: 46 },
  { id: 'cl', x1: 46, y1: 46, x2: 0, y2: 46 },
  { id: 'cd', x1: 46, y1: 46, x2: 46, y2: 92 },
  { id: 'cu', x1: 46, y1: 46, x2: 46, y2: 0 },
];
</script>

<style>
.aix-flow-node__cross {
  position: absolute;
  z-index: 0;
  top: 50%;
  left: 50%;
  width: 92px;
  height: 92px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
