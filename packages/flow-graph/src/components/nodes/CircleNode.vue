<template>
  <div class="aix-circle-node__wrapper">
    <!-- 十字渐变（active 状态）：四条线从中心向外渐淡变细 -->
    <svg
      v-if="nodeState === 'active'"
      class="aix-circle-node__cross"
      viewBox="0 0 92 92"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          :id="`cr-${id}`"
          x1="46"
          y1="46"
          x2="92"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stop-color="#4E5969" />
          <stop offset="100%" stop-color="#4E5969" stop-opacity="0" />
        </linearGradient>
        <linearGradient
          :id="`cl-${id}`"
          x1="46"
          y1="46"
          x2="0"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stop-color="#4E5969" />
          <stop offset="100%" stop-color="#4E5969" stop-opacity="0" />
        </linearGradient>
        <linearGradient
          :id="`cd-${id}`"
          x1="46"
          y1="46"
          x2="46"
          y2="92"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stop-color="#4E5969" />
          <stop offset="100%" stop-color="#4E5969" stop-opacity="0" />
        </linearGradient>
        <linearGradient
          :id="`cu-${id}`"
          x1="46"
          y1="46"
          x2="46"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stop-color="#4E5969" />
          <stop offset="100%" stop-color="#4E5969" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M46 46 L92 46" :stroke="`url(#cr-${id})`" stroke-width="2" stroke-linecap="round" />
      <path d="M46 46 L0 46" :stroke="`url(#cl-${id})`" stroke-width="2" stroke-linecap="round" />
      <path d="M46 46 L46 92" :stroke="`url(#cd-${id})`" stroke-width="2" stroke-linecap="round" />
      <path d="M46 46 L46 0" :stroke="`url(#cu-${id})`" stroke-width="2" stroke-linecap="round" />
    </svg>
    <div
      class="aix-circle-node"
      :class="[`aix-circle-node--${nodeState}`, { selecting: data?.selecting }]"
      :style="{ background: data?.color || '#86909C' }"
      @click.stop="onNodeClick"
      @contextmenu.prevent="onContextMenu"
    >
      <Handle type="target" :position="Position.Left" class="aix-circle-node__handle" />
      <Handle type="source" :position="Position.Right" class="aix-circle-node__handle" />
      <div v-if="nodeState === 'context'" class="aix-circle-node__inner" />
      <div v-if="data?.label" class="aix-circle-node__tooltip">{{ data.label }}</div>
      <div v-if="showMenu" class="aix-circle-node__menu" @mouseleave="showMenu = false" @click.stop>
        <button class="aix-circle-node__menu-item" @click="onCopy">复制</button>
        <button
          class="aix-circle-node__menu-item aix-circle-node__menu-item--delete"
          @click="onDelete"
        >
          删除
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position, useVueFlow } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { NodeData } from '../../types';

const props = defineProps<NodeProps<NodeData>>();

const { removeNodes, addNodes, getNodes, updateNodeData } = useVueFlow();
const showMenu = ref(false);

const nodeState = computed(() => props.data?.state || 'default');

function onNodeClick() {
  const next = nodeState.value === 'active' ? 'default' : 'active';
  updateNodeData(props.id, { ...props.data, state: next });
}

function onContextMenu() {
  const next = nodeState.value === 'context' ? 'default' : 'context';
  updateNodeData(props.id, { ...props.data, state: next });
  showMenu.value = true;
}

function closeMenu() {
  showMenu.value = false;
}
onMounted(() => document.addEventListener('click', closeMenu));
onUnmounted(() => document.removeEventListener('click', closeMenu));

function onDelete() {
  showMenu.value = false;
  removeNodes(props.id);
}

function onCopy() {
  showMenu.value = false;
  const node = getNodes.value.find((n) => n.id === props.id);
  if (!node) return;
  addNodes([
    {
      ...node,
      id: `${node.id}-copy-${Date.now()}`,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data, state: 'default' },
    },
  ]);
}
</script>

<style>
.vue-flow__node-default:has(.aix-circle-node) {
  width: auto !important;
  padding: 0 !important;
  overflow: visible !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

.aix-circle-node__wrapper {
  position: relative;
  width: 16px;
  height: 16px;
}

.aix-circle-node {
  position: relative;
  z-index: 1;
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.aix-circle-node .vue-flow__handle {
  width: 10px;
  height: 10px;
  border: none;
  opacity: 0;
  background: transparent;
  pointer-events: none;
}

.aix-circle-node .aix-circle-node__handle {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* context 状态：同心圆 */
.aix-circle-node--context {
  background: var(--aix-node-color, #86909c);
}

.aix-circle-node__inner {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: #fff;
}

/* active 状态：十字渐变 */
.aix-circle-node--active {
  overflow: visible;
  background: var(--aix-node-color, #86909c);
}

.aix-circle-node__cross {
  position: absolute;
  z-index: 0;
  top: 50%;
  left: 50%;
  width: 92px;
  height: 92px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.aix-circle-node.selecting {
  outline: 3px solid #1546f2;
  outline-offset: 2px;
}

.aix-circle-node__menu {
  position: absolute;
  z-index: 100;
  top: calc(100% + 6px);
  left: 50%;
  overflow: hidden;
  transform: translateX(-50%);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
  white-space: nowrap;
}

.aix-circle-node__menu-item {
  display: block;
  width: 100%;
  padding: 7px 16px;
  border: none;
  background: transparent;
  color: #1d2129;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.aix-circle-node__menu-item:hover {
  background: #f7f8fa;
}

.aix-circle-node__menu-item--delete {
  color: #f53f3f;
}

.aix-circle-node__tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  padding: 3px 8px;
  transform: translateX(-50%);
  transition: opacity 0.15s;
  border-radius: 4px;
  opacity: 0;
  background: rgb(0 0 0 / 0.72);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}

.aix-circle-node:hover .aix-circle-node__tooltip {
  opacity: 1;
}
</style>
