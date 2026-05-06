<template>
  <ContextMenu
    popper-class="aix-flow-node-menu"
    @command="onCommand"
    @visible-change="onContextVisibleChange"
  >
    <Tooltip
      ref="tooltipRef"
      :content="data?.label ?? ''"
      :disabled="!data?.label || dragging || (data?.selecting && data?.tooltipDisabled)"
      :hide-delay="0"
      placement="top"
    >
      <div
        class="aix-flow-node__wrapper"
        :class="{ 'aix-flow-node__wrapper--connectable': connectable }"
        :style="{ width: `${size}px`, height: `${size}px` }"
      >
        <NodeActiveCross
          v-if="nodeState === 'active'"
          :uid="`n-${id}`"
          :color="data?.color || fallbackColor"
          :colors="data?.pathColors ?? []"
        />
        <slot :size="size" :node-state="nodeState" :clicking="clicking" :on-click="onNodeClick" />
        <Handle type="target" :position="Position.Left" class="aix-flow-node__handle" />
        <Handle type="source" :position="Position.Right" class="aix-flow-node__handle" />
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
 * 节点公共骨架：
 * - 统一安装 ContextMenu（复制/删除）、Tooltip、NodeActiveCross、Handle；
 * - 统一挂载 useNodeInteraction（点击/右键/复制/删除的状态同步）；
 * - 视觉通过默认 slot 暴露 `{ size, nodeState, onClick }`，由子类渲染形状；
 * - Handle 的 pointer-events 由 `connectable` 控制。
 */
import { ContextMenu, DropdownItem, Tooltip, type TooltipExpose } from '@aix/popper';
import { Handle, Position, type HandleConnectable } from '@vue-flow/core';
import { computed, ref, toRef, watch } from 'vue';
import { useNodeInteraction } from '../../composables/useNodeInteraction';
import type { NodeData } from '../../types';
import NodeActiveCross from './NodeActiveCross.vue';

/**
 * BaseNode 仅声明自己实际使用的 NodeProps 字段 + 两个扩展 prop。
 * 子类通过 `v-bind="$props"` 透传给 BaseNode，未声明的字段会落到 $attrs 被忽略。
 */
interface Props {
  id: string;
  data?: NodeData;
  dragging?: boolean;
  connectable?: HandleConnectable;
  /** 节点默认尺寸（px）：当 data.size 未设置时使用 */
  defaultSize: number;
  /** NodeActiveCross 颜色回退值：当 data.color 未设置时使用 */
  fallbackColor: string;
}

defineOptions({ name: 'AixFlowBaseNode', inheritAttrs: false });

const props = defineProps<Props>();

/** 节点尺寸（像素），回退到 defaultSize */
const size = computed(() => props.data?.size ?? props.defaultSize);

const tooltipRef = ref<TooltipExpose | null>(null);
watch(
  () => props.dragging,
  (v) => {
    if (v) tooltipRef.value?.hide();
  },
);
watch(
  () => props.data?.selecting,
  (v) => {
    if (v && props.data?.label && !props.data?.tooltipDisabled) tooltipRef.value?.show();
    else tooltipRef.value?.hide();
  },
);

const { nodeState, clicking, onNodeClick, onContextOpen, onContextClose, onCommand } =
  useNodeInteraction({
    id: props.id,
    data: toRef(props, 'data'),
  });

/** 同步右键菜单开合到节点 context 状态 */
function onContextVisibleChange(visible: boolean) {
  if (visible) onContextOpen();
  else onContextClose();
}

defineExpose({ size, nodeState });
</script>

<style>
.vue-flow__node-default:has(.aix-flow-node__wrapper) {
  width: auto !important;
  padding: 0 !important;
  overflow: visible !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

.aix-flow-node__wrapper {
  position: relative;
}

.aix-flow-node__wrapper .vue-flow__handle {
  width: 10px;
  height: 10px;
  border: none;
  opacity: 0;
  background: transparent;
  pointer-events: none;
}

.aix-flow-node__wrapper .aix-flow-node__handle {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.aix-flow-node__wrapper--connectable .aix-flow-node__handle {
  pointer-events: auto;
}

/* 圆形 / 六边形共用的点击反馈动画 */
@keyframes aix-node-click {
  0% {
    transform: scale(1);
  }

  40% {
    transform: scale(0.88);
  }

  100% {
    transform: scale(1);
  }
}
</style>
