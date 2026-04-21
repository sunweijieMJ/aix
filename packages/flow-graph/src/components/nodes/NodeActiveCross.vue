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
        <stop offset="0%" :stop-color="color" stop-opacity="0.7" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <!-- 每条臂：从中心(46,46)出发的细长三角形，宽端在中心，尖端在外 -->
    <polygon
      v-for="dir in directions"
      :key="`p-${dir.id}`"
      :points="dir.points"
      :fill="`url(#${dir.id}-${uid})`"
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
// 半宽 2px，臂长 46px（到 SVG 边缘）
const directions = [
  // 右：中心两点(46,44)(46,48) → 右端尖(92,46)
  { id: 'cr', x1: 46, y1: 46, x2: 92, y2: 46, points: '46,44 46,48 92,46' },
  // 左：中心两点(46,44)(46,48) → 左端尖(0,46)
  { id: 'cl', x1: 46, y1: 46, x2: 0, y2: 46, points: '46,44 46,48 0,46' },
  // 下：中心两点(44,46)(48,46) → 下端尖(46,92)
  { id: 'cd', x1: 46, y1: 46, x2: 46, y2: 92, points: '44,46 48,46 46,92' },
  // 上：中心两点(44,46)(48,46) → 上端尖(46,0)
  { id: 'cu', x1: 46, y1: 46, x2: 46, y2: 0, points: '44,46 48,46 46,0' },
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

.aix-cross-arm {
  transform-origin: 46px 46px;
  animation: aix-cross-expand 0.3s ease-out forwards;
  opacity: 0;
}

@keyframes aix-cross-expand {
  from {
    transform: scale(0.4);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
