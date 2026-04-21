<template>
  <ContextMenu
    popper-class="aix-flow-node-menu"
    @command="onCommand"
    @visible-change="onContextVisibleChange"
  >
    <Tooltip :content="data?.label ?? ''" :disabled="!data?.label" placement="top">
      <div class="aix-circle-node__wrapper" :style="{ width: `${size}px`, height: `${size}px` }">
        <NodeActiveCross v-if="nodeState === 'active'" :uid="`c-${id}`" />
        <div
          class="aix-circle-node"
          :class="[`aix-circle-node--${nodeState}`, { selecting: data?.selecting }]"
          :style="{
            background: data?.color || 'var(--aix-flowGraphNodeColor, #86909c)',
            width: `${size}px`,
            height: `${size}px`,
          }"
          @click="onNodeClick"
        >
          <Handle type="target" :position="Position.Left" class="aix-flow-node__handle" />
          <Handle type="source" :position="Position.Right" class="aix-flow-node__handle" />
          <div v-if="nodeState === 'context'" class="aix-circle-node__inner" />
        </div>
      </div>
    </Tooltip>
    <template #menu>
      <DropdownItem command="copy">
        <img src="../../assets/icon-copy.svg" class="aix-flow-node-menu__icon" alt="" />
        复制
      </DropdownItem>
      <DropdownItem command="delete" class="aix-flow-node-menu__delete">
        <img src="../../assets/icon-delete.svg" class="aix-flow-node-menu__icon" alt="" />
        删除
      </DropdownItem>
    </template>
  </ContextMenu>
</template>

<script setup lang="ts">
/**
 * 圆形节点：用于流程图的默认节点类型。
 *
 * 交互：
 * - 点击切换 `active` 状态（四向渐变十字可视化）。
 * - 右键打开上下文菜单（复制 / 删除），菜单显示期间节点切至 `context` 状态。
 * - 鼠标悬停时若配置了 `data.label` 会显示 Tooltip。
 */
import { ContextMenu, DropdownItem, Tooltip } from '@aix/popper';
import { Handle, Position } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { computed, toRef } from 'vue';
import { useNodeInteraction } from '../../composables/useNodeInteraction';
import type { NodeData } from '../../types';
import NodeActiveCross from './NodeActiveCross.vue';

defineOptions({ name: 'AixCircleNode' });

const props = defineProps<NodeProps<NodeData>>();

/** 节点尺寸（像素），回退到默认 28 */
const size = computed(() => props.data?.size ?? 28);

const { nodeState, onNodeClick, onContextOpen, onContextClose, onCommand } = useNodeInteraction({
  id: props.id,
  data: toRef(props, 'data'),
});

/** 同步右键菜单开合到节点 context 状态 */
function onContextVisibleChange(visible: boolean) {
  if (visible) onContextOpen();
  else onContextClose();
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
}

.aix-circle-node {
  position: relative;
  z-index: 1;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
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

.aix-circle-node .aix-flow-node__handle {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.aix-circle-node--active {
  overflow: visible;
}

.aix-circle-node--context {
  transform: scale(0.92);
}

.aix-circle-node__inner {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: var(--aix-colorBgElevated, #fff);
}

.aix-circle-node.selecting {
  filter: drop-shadow(0 0 4px var(--aix-flowGraphBrand, #1546f2));
}
</style>
