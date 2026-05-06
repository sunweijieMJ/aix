import type { App } from 'vue';
import FlowGraph from './FlowGraph.vue';

// 主组件
export { FlowGraph };

// 扩展零件：业务方可基于这些子组件 / composable 组合自定义流程图
export { default as BaseNode } from './components/nodes/BaseNode.vue';
export { default as CircleNode } from './components/nodes/CircleNode.vue';
export { default as HexagonNode } from './components/nodes/HexagonNode.vue';
export { default as NodeActiveCross } from './components/nodes/NodeActiveCross.vue';
export { default as ColorEdge } from './components/edges/ColorEdge.vue';
export { default as FlowControls } from './components/FlowControls.vue';
export { default as FlowSearch } from './components/FlowSearch.vue';

// composables
export {
  useNodeInteraction,
  type UseNodeInteractionOptions,
  type UseNodeInteractionReturn,
} from './composables/useNodeInteraction';

// 工具函数
export { calcOrthogonalWaypoints, createNodeId, setNodeType } from './utils';

// 常量
export { DEFAULT_CIRCLE_SIZE, DEFAULT_HEXAGON_SIZE } from './types';

// 注入键（业务方在自定义节点 / 边里 inject 时使用）
export { FlowSnapContextKey, FlowEdgesDeletableKey } from './types';

// 类型导出
export type {
  EdgeData,
  EdgeTypesMap,
  FlowConnection,
  FlowEdge,
  FlowGraphBottomBarSlotProps,
  FlowGraphEmits,
  FlowGraphInstance,
  FlowGraphProps,
  FlowNode,
  FlowSnapContext,
  NodeData,
  NodeTypesMap,
  PanelPositionType,
  WayPoint,
} from './types';

export default {
  install(app: App) {
    app.component('AixFlowGraph', FlowGraph);
  },
};
