import { useVueFlow } from '@vue-flow/core';
import { computed, inject, nextTick, onScopeDispose, ref, type Ref } from 'vue';
import { FlowSnapContextKey, type NodeData } from '../types';
import { createNodeId } from '../utils';

/** {@link useNodeInteraction} 的入参 */
export interface UseNodeInteractionOptions {
  /** 节点 id */
  id: string;
  /** 节点的响应式 data（来自 VueFlow NodeProps.data） */
  data: Ref<NodeData | undefined>;
}

/** {@link useNodeInteraction} 的返回值 */
export interface UseNodeInteractionReturn {
  /** 当前节点状态（default / context / active） */
  nodeState: Readonly<Ref<NonNullable<NodeData['state']>>>;
  /** 点击动画触发标记 */
  clicking: Ref<boolean>;
  /** 点击节点：在 active / default 之间切换 */
  onNodeClick: () => void;
  /** 删除当前节点 */
  onDelete: () => void;
  /** 复制当前节点，位置对齐栅格并自动避开重叠 */
  onCopy: () => void;
  /** 菜单 command 事件的统一派发入口 */
  onCommand: (command: string | number) => void;
}

/** 点击动画时长（ms），与 `aix-node-click` keyframes 持续时间保持一致 */
const CLICK_ANIMATION_MS = 300;

/**
 * 节点共享交互：封装 state 切换（active / context）、复制、删除以及右键菜单的 command 派发。
 *
 * 右键菜单本身由 `@aix/popper` 的 ContextMenu 处理（包括定位、外点关闭、ESC 关闭等），
 * 本 composable 只负责业务语义与状态同步。
 */
export function useNodeInteraction(options: UseNodeInteractionOptions): UseNodeInteractionReturn {
  const { id, data } = options;
  const { removeNodes, addNodes, getNodes, updateNodeData } = useVueFlow();
  const snap = inject(FlowSnapContextKey, null);

  const nodeState = computed(() => data.value?.state ?? 'default');
  const clicking = ref(false);

  function setState(next: NodeData['state']) {
    updateNodeData(id, { ...data.value, state: next });
  }

  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  function triggerClickAnimation() {
    if (clickTimer !== null) clearTimeout(clickTimer);
    clicking.value = true;
    clickTimer = setTimeout(() => {
      clicking.value = false;
      clickTimer = null;
    }, CLICK_ANIMATION_MS);
  }

  // 组件卸载时清理 timer，避免在已销毁的 ref 上写入
  onScopeDispose(() => {
    if (clickTimer !== null) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
  });

  function onNodeClick() {
    triggerClickAnimation();
    getNodes.value.forEach((n) => {
      if (n.id !== id && n.data?.state && n.data.state !== 'default') {
        updateNodeData(n.id, { ...n.data, state: 'default' });
      }
    });
    setState(nodeState.value === 'active' ? 'default' : 'active');
  }

  function onDelete() {
    removeNodes(id);
  }

  function onCopy() {
    const node = getNodes.value.find((n) => n.id === id);
    if (!node) return;
    const newId = createNodeId(`${node.id}-copy`);
    const step = snap?.gridSize.value ?? 40;
    // 与 onNodeDragStop 保持一致：优先用 data.size，否则按节点类型取默认尺寸
    const defaultSize =
      node.type === 'hexagon' ? (snap?.hexagonSize.value ?? 40) : (snap?.nodeSize.value ?? 28);
    const half = (node.data?.size ?? defaultSize) / 2;

    function snapPos(x: number, y: number) {
      if (!snap?.snapEnabled.value) return { x, y };
      return {
        x: Math.round((x + half) / step) * step - half,
        y: Math.round((y + half) / step) * step - half,
      };
    }

    // 从偏移一格开始，找第一个不与现有节点完全重叠的位置
    const existingPositions = new Set(getNodes.value.map((n) => `${n.position.x},${n.position.y}`));
    let offset = step;
    let pos = snapPos(node.position.x + offset, node.position.y + offset);
    while (existingPositions.has(`${pos.x},${pos.y}`)) {
      offset += step;
      pos = snapPos(node.position.x + offset, node.position.y + offset);
    }

    addNodes([
      {
        ...node,
        id: newId,
        position: pos,
        data: { ...node.data, state: 'default' },
      },
    ]);
    // VueFlow 的 Node 类型不含 selected，需在节点入库后（nextTick）在 GraphNode 上取消选中
    nextTick(() => {
      const newNode = getNodes.value.find((n) => n.id === newId);
      if (newNode) newNode.selected = false;
    });
  }

  function onCommand(command: string | number) {
    if (command === 'copy') onCopy();
    else if (command === 'delete') onDelete();
  }

  return {
    nodeState,
    clicking,
    onNodeClick,
    onDelete,
    onCopy,
    onCommand,
  };
}

// 兼容历史导入路径：转发 utils.ts 中的 createNodeId
export { createNodeId } from '../utils';
