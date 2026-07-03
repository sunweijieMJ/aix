<template>
  <BaseNode v-bind="$props" :default-size="defaultSize" :fallback-color="FALLBACK_COLOR">
    <template #default="{ size, nodeState, clicking, onClick }">
      <div
        class="aix-circle-node"
        :class="[
          ns.m(nodeState),
          {
            [ns.m('clicking')]: clicking,
            [ns.m('dimmed')]: data?.dimmed,
          },
        ]"
        :style="{
          background:
            data?.activeColor ||
            data?.color ||
            (selected
              ? 'var(--aix-flowGraphNodeSelectedColor, #4e5969)'
              : 'var(--aix-flowGraphNodeColor, #86909c)'),
          width: `${size}px`,
          height: `${size}px`,
          filter: data?.selecting
            ? `drop-shadow(0 0 4px ${data?.activeColor || data?.color || FALLBACK_COLOR})`
            : undefined,
        }"
        @click="onClick"
      >
        <div v-if="nodeState === 'context'" class="aix-circle-node__inner" />
      </div>
    </template>
  </BaseNode>
</template>

<script setup lang="ts">
/**
 * 圆形节点：默认节点类型。
 * 所有交互（点击 active / 右键菜单 / 上方 label / Handle）均由 {@link BaseNode} 承载。
 */
import { useNamespace } from '@aix/hooks';
import type { NodeProps } from '@vue-flow/core';
import { computed, inject } from 'vue';
import { DEFAULT_CIRCLE_SIZE, FlowSnapContextKey, type NodeData } from '../../types';
import BaseNode from './BaseNode.vue';

defineOptions({ name: 'AixCircleNode', inheritAttrs: false });

defineProps<NodeProps<NodeData>>();

const ns = useNamespace('circle-node');

// 读取 FlowGraph 的 `defaultNodeSize` 覆盖值，不能写死 DEFAULT_CIRCLE_SIZE——否则业务传入
// defaultNodeSize 自定义尺寸时，实际渲染尺寸与 createNode/addNode 等位置计算假定的尺寸不一致，
// 会导致新建/复制节点的重叠判断按错误尺寸计算
const snap = inject(FlowSnapContextKey, null);
const defaultSize = computed(() => snap?.nodeSize.value ?? DEFAULT_CIRCLE_SIZE);

/** 圆形节点主色回退（无 data.color 时使用） */
const FALLBACK_COLOR = '#86909c';
</script>

<style>
.aix-circle-node {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  border-radius: 50%;
}

.aix-circle-node--active {
  overflow: visible;
}

.aix-circle-node--context {
  transform: scale(0.92);
}

.aix-circle-node--clicking {
  animation: aix-node-click 0.3s ease;
}

/* dim 态：半透明 + 背景模糊。
   业务侧可覆盖 --aix-flowGraphDimmedOpacity / --aix-flowGraphDimmedBlur 调整强度。 */
.aix-circle-node--dimmed {
  opacity: var(--aix-flowGraphDimmedOpacity, 0.4);
  backdrop-filter: var(--aix-flowGraphDimmedBlur, blur(10px));
}

.aix-circle-node__inner {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: var(--aix-colorBgElevated, #fff);
}
</style>
