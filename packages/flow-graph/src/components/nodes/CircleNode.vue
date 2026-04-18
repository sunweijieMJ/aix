<template>
  <div
    class="aix-circle-node"
    :class="{ selecting: data?.selecting }"
    :style="{ background: data?.color || '#86909C' }"
    @contextmenu.prevent="showMenu = true"
  >
    <Handle type="target" :position="Position.Left" class="aix-circle-node__handle" />
    <Handle type="source" :position="Position.Right" class="aix-circle-node__handle" />

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
</template>

<script setup lang="ts">
import { Handle, Position, useVueFlow } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { ref, onMounted, onUnmounted } from 'vue';
import type { NodeData } from '../../types';

const props = defineProps<NodeProps<NodeData>>();

const { removeNodes, addNodes, getNodes } = useVueFlow();
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
.vue-flow__node-default:has(.aix-circle-node) {
  width: auto !important;
  padding: 0 !important;
  overflow: visible !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

.aix-circle-node {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.aix-circle-node .vue-flow__handle {
  width: 10px;
  height: 10px;
  border: none;
  opacity: 0;
  background: transparent;
}

.aix-circle-node .aix-circle-node__handle {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
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

.aix-circle-node.selecting {
  outline: 3px solid #1546f2;
  outline-offset: 2px;
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
