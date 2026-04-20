import type { Node, Edge, Connection, MouseTouchEvent } from '@vue-flow/core';

export interface NodeData {
  color?: string;
  label?: string;
  selecting?: boolean;
  _new?: boolean;
  state?: 'default' | 'context' | 'active';
  /** 节点尺寸（px） */
  size?: number;
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
  snapGrid?: boolean;
  gridSize?: number;
  /** 默认圆形节点尺寸（px），默认 28 */
  defaultNodeSize?: number;
  /** 默认六边形节点尺寸（px），默认 40 */
  defaultHexagonSize?: number;
}

export interface FlowGraphEmits {
  connect: [connection: Connection];
  'node-click': [payload: { node: FlowNode; event: MouseTouchEvent }];
}
