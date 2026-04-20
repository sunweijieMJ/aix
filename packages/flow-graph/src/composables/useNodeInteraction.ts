import { useVueFlow } from '@vue-flow/core';
import { computed, type Ref } from 'vue';
import type { NodeData } from '../types';

/** {@link useNodeInteraction} 的入参 */
export interface UseNodeInteractionOptions {
  /** 节点 id */
  id: string;
  /** 节点的响应式 data（来自 VueFlow NodeProps.data） */
  data: Ref<NodeData | undefined>;
  /** 是否支持 context 状态切换（默认 true） */
  supportContextState?: boolean;
}

/** {@link useNodeInteraction} 的返回值 */
export interface UseNodeInteractionReturn {
  /** 当前节点状态（default / context / active） */
  nodeState: Readonly<Ref<NonNullable<NodeData['state']>>>;
  /** 点击节点：在 active / default 之间切换 */
  onNodeClick: () => void;
  /** 右键菜单打开时调用：将节点切至 context 态 */
  onContextOpen: () => void;
  /** 右键菜单关闭时调用：将节点切回 default 态 */
  onContextClose: () => void;
  /** 删除当前节点 */
  onDelete: () => void;
  /** 复制当前节点到偏移 (40, 40) 的位置 */
  onCopy: () => void;
  /** 菜单 command 事件的统一派发入口 */
  onCommand: (command: string | number) => void;
}

/**
 * 节点共享交互：封装 state 切换（active / context）、复制、删除以及右键菜单的 command 派发。
 *
 * 右键菜单本身由 `@aix/popper` 的 ContextMenu 处理（包括定位、外点关闭、ESC 关闭等），
 * 本 composable 只负责业务语义与状态同步。
 */
export function useNodeInteraction(options: UseNodeInteractionOptions): UseNodeInteractionReturn {
  const { id, data, supportContextState = true } = options;
  const { removeNodes, addNodes, getNodes, updateNodeData } = useVueFlow();

  const nodeState = computed(() => data.value?.state ?? 'default');

  function setState(next: NodeData['state']) {
    updateNodeData(id, { ...data.value, state: next });
  }

  function onNodeClick() {
    setState(nodeState.value === 'active' ? 'default' : 'active');
  }

  function onContextOpen() {
    if (!supportContextState) return;
    setState('context');
  }

  function onContextClose() {
    if (!supportContextState) return;
    if (nodeState.value === 'context') setState('default');
  }

  function onDelete() {
    removeNodes(id);
  }

  function onCopy() {
    const node = getNodes.value.find((n) => n.id === id);
    if (!node) return;
    addNodes([
      {
        ...node,
        id: createNodeId(`${node.id}-copy`),
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        data: { ...node.data, state: 'default' },
      },
    ]);
  }

  function onCommand(command: string | number) {
    if (command === 'copy') onCopy();
    else if (command === 'delete') onDelete();
  }

  return {
    nodeState,
    onNodeClick,
    onContextOpen,
    onContextClose,
    onDelete,
    onCopy,
    onCommand,
  };
}

/**
 * 生成唯一节点 id。优先使用 `crypto.randomUUID`，不可用时降级到 `Date.now + 随机`。
 * @param prefix - id 前缀，默认 `node`
 */
export function createNodeId(prefix = 'node'): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${uuid}`;
}
