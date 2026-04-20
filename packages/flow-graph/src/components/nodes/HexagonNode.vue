<template>
  <ContextMenu @command="onCommand" @visible-change="onContextVisibleChange">
    <Tooltip :content="data?.label ?? ''" :disabled="!data?.label" placement="top">
      <div class="aix-hexagon-node__wrapper" :style="{ width: `${size}px`, height: `${size}px` }">
        <NodeActiveCross v-if="nodeState === 'active'" :uid="`h-${id}`" />
        <div
          class="aix-hexagon-node"
          :class="[`aix-hexagon-node--${nodeState}`, { selecting: data?.selecting }]"
          @click.stop="onNodeClick"
        >
          <Handle type="target" :position="Position.Left" class="aix-flow-node__handle" />
          <Handle type="source" :position="Position.Right" class="aix-flow-node__handle" />

          <svg
            :width="size"
            :height="size"
            viewBox="0 0 52 49"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M40.72,13 Q43.32,14.5 43.32,17.5L43.32,31.5 Q43.32,34.5 40.72,36L28.6,43 Q26,44.5 23.4,43L11.28,36 Q8.68,34.5 8.68,31.5L8.68,17.5 Q8.68,14.5 11.28,13L23.4,6 Q26,4.5 28.6,6 Z"
              :fill="fillColor"
              filter="drop-shadow(0 2px 6px rgba(103,107,122,0.12))"
            />
            <path
              d="M36.83,15.75 Q38.99,17 38.99,19.5L38.99,29.5 Q38.99,32 36.83,33.25L28.17,38.25 Q26,39.5 23.83,38.25L15.17,33.25 Q13.01,32 13.01,29.5L13.01,19.5 Q13.01,17 15.17,15.75L23.83,10.75 Q26,9.5 28.17,10.75 Z"
              :fill="nodeState === 'context' ? fillColor : 'var(--aix-colorBgElevated, #fff)'"
            />
            <path
              d="M32.93,18.5 Q34.66,19.5 34.66,21.5L34.66,27.5 Q34.66,29.5 32.93,30.5L27.73,33.5 Q26,34.5 24.27,33.5L19.07,30.5 Q17.34,29.5 17.34,27.5L17.34,21.5 Q17.34,19.5 19.07,18.5L24.27,15.5 Q26,14.5 27.73,15.5 Z"
              :fill="nodeState === 'context' ? 'var(--aix-colorBgElevated, #fff)' : fillColor"
            />
          </svg>
        </div>
      </div>
    </Tooltip>
    <template #menu>
      <DropdownItem command="copy" label="复制" />
      <DropdownItem command="delete" label="删除" />
    </template>
  </ContextMenu>
</template>

<script setup lang="ts">
/**
 * 六边形节点：与 {@link CircleNode} 行为一致，仅视觉不同。
 * 使用三层嵌套多边形表现层级；`context` 状态下内外填充对调。
 */
import { ContextMenu, DropdownItem, Tooltip } from '@aix/popper';
import { Handle, Position } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { computed, toRef } from 'vue';
import { useNodeInteraction } from '../../composables/useNodeInteraction';
import type { NodeData } from '../../types';
import NodeActiveCross from './NodeActiveCross.vue';

defineOptions({ name: 'AixHexagonNode' });

const props = defineProps<NodeProps<NodeData>>();

/** 节点尺寸（像素），回退到默认 40 */
const size = computed(() => props.data?.size ?? 40);
/** 节点填充色（外层/中层/内层共用） */
const fillColor = computed(() => props.data?.color || 'var(--aix-flowGraphHexagonColor, #963096)');

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
.vue-flow__node-default:has(.aix-hexagon-node) {
  width: auto !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

.aix-hexagon-node__wrapper {
  position: relative;
}

.aix-hexagon-node {
  display: inline-block;
  position: relative;
  z-index: 1;
}

.aix-hexagon-node .vue-flow__handle {
  width: 10px;
  height: 10px;
  border: none;
  opacity: 0;
  background: transparent;
  pointer-events: none;
}

.aix-hexagon-node .aix-flow-node__handle {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.aix-hexagon-node.selecting {
  outline: 3px solid var(--aix-flowGraphBrand, #1546f2);
  outline-offset: 2px;
}
</style>
