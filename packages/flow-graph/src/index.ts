import type { App } from 'vue';
import FlowGraph from './FlowGraph.vue';

export { FlowGraph };
export type {
  FlowNode,
  FlowEdge,
  FlowGraphProps,
  FlowGraphEmits,
  NodeData,
  EdgeData,
  WayPoint,
} from './types';

export default {
  install(app: App) {
    app.component('AixFlowGraph', FlowGraph);
  },
};
