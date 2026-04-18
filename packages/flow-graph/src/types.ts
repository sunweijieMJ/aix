import type { Node, Edge, Connection, MouseTouchEvent } from '@vue-flow/core';

export interface NodeData {
  color?: string;
  label?: string;
  /** 外部控制高亮，区别于 vue-flow 内置的 selected */
  selecting?: boolean;
  /** 刚通过"添加节点"按钮创建、尚未命名的节点标记 */
  _new?: boolean;
}

export interface WayPoint {
  x: number;
  y: number;
}

export interface EdgeData {
  color?: string;
  waypoints?: WayPoint[];
}

export type FlowNode = Node<NodeData>;
export type FlowEdge = Edge<EdgeData>;

export interface FlowGraphProps {
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  /** 是否允许手动连线，默认 true */
  connectable?: boolean;
}

export interface FlowGraphEmits {
  connect: [connection: Connection];
  'node-click': [payload: { node: FlowNode; event: MouseTouchEvent }];
}
