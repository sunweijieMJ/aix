<template>
  <div class="aix-hexagon-node" @contextmenu.prevent="showMenu = true">
    <Handle
      type="target"
      :position="Position.Left"
      :connectable="connectable"
      class="aix-hexagon-node__handle"
    />
    <Handle
      type="source"
      :position="Position.Right"
      :connectable="connectable"
      class="aix-hexagon-node__handle"
    />

    <svg width="52" height="49" viewBox="0 0 52 49" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M40.72,13 Q43.32,14.5 43.32,17.5L43.32,31.5 Q43.32,34.5 40.72,36L28.6,43 Q26,44.5 23.4,43L11.28,36 Q8.68,34.5 8.68,31.5L8.68,17.5 Q8.68,14.5 11.28,13L23.4,6 Q26,4.5 28.6,6 Z"
        :fill="data?.color || '#963096'"
        filter="drop-shadow(0 2px 6px rgba(103,107,122,0.12))"
      />
      <path
        d="M36.83,15.75 Q38.99,17 38.99,19.5L38.99,29.5 Q38.99,32 36.83,33.25L28.17,38.25 Q26,39.5 23.83,38.25L15.17,33.25 Q13.01,32 13.01,29.5L13.01,19.5 Q13.01,17 15.17,15.75L23.83,10.75 Q26,9.5 28.17,10.75 Z"
        fill="white"
      />
      <path
        d="M32.93,18.5 Q34.66,19.5 34.66,21.5L34.66,27.5 Q34.66,29.5 32.93,30.5L27.73,33.5 Q26,34.5 24.27,33.5L19.07,30.5 Q17.34,29.5 17.34,27.5L17.34,21.5 Q17.34,19.5 19.07,18.5L24.27,15.5 Q26,14.5 27.73,15.5 Z"
        :fill="data?.color || '#963096'"
      />
    </svg>

    <div v-if="showMenu" class="aix-hexagon-node__menu" @mouseleave="showMenu = false" @click.stop>
      <button class="aix-hexagon-node__menu-item" @click="onCopy">复制</button>
      <button
        class="aix-hexagon-node__menu-item aix-hexagon-node__menu-item--delete"
        @click="onDelete"
      >
        删除
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position, useVueFlow } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { ref, onMounted, onUnmounted, computed } from 'vue';
import type { NodeData } from '../../types';

const props = defineProps<NodeProps<NodeData>>();
const { removeNodes, addNodes, getNodes } = useVueFlow();
const connectable = computed(() => !props.dragging);
const showMenu = ref(false);

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
    },
  ]);
}
</script>

<style>
.vue-flow__node-default:has(.aix-hexagon-node) {
  width: auto !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

.aix-hexagon-node {
  display: inline-block;
  position: relative;
}

.aix-hexagon-node .vue-flow__handle {
  width: 10px;
  height: 10px;
  border: none;
  opacity: 0;
  background: transparent;
}

.aix-hexagon-node .aix-hexagon-node__handle {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.aix-hexagon-node__menu {
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

.aix-hexagon-node__menu-item {
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

.aix-hexagon-node__menu-item:hover {
  background: #f7f8fa;
}

.aix-hexagon-node__menu-item--delete {
  color: #f53f3f;
}
</style>
