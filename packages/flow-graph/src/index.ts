import type { App } from 'vue';
import FlowGraph from './FlowGraph.vue';

export { FlowGraph };

export type {
  FlowNode,
  FlowEdge,
  FlowConnection,
  FlowGraphProps,
  FlowGraphEmits,
  NodeData,
  EdgeData,
  WayPoint,
  NodeTypesMap,
  EdgeTypesMap,
} from './types';

export default {
  install(app: App) {
    app.component('AixFlowGraph', FlowGraph);
  },
};
