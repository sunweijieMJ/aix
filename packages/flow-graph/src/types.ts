import type { Node, Edge, MouseTouchEvent } from '@vue-flow/core';
import type { Component, ComputedRef, InjectionKey } from 'vue';

/** 面板位置类型 */
export type PanelPositionType =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/** 圆形节点默认尺寸（px） */
export const DEFAULT_CIRCLE_SIZE = 28;
/** 六边形节点默认尺寸（px） */
export const DEFAULT_HEXAGON_SIZE = 40;

/** 节点数据载荷：通过 `node.data` 挂载到每个流程图节点。 */
export interface NodeData {
  /** 节点主色，缺省使用主题 CSS 变量 */
  color?: string;
  /** 节点标签，悬停时显示在 Tooltip */
  label?: string;
  /** 是否处于”选择中”的外圈高亮（供外部流程驱动） */
  selecting?: boolean;
  /**
   * 节点交互状态：
   * - `default`：常态
   * - `context`：右键菜单打开期间
   * - `active`：单击选中（显示四向渐变十字）
   */
  state?: 'default' | 'context' | 'active';
  /** 节点尺寸（px），圆形与六边形共用此字段 */
  size?: number;
  /** 节点所属路径的颜色列表（多路径共用时用于扇形着色和十字渐变） */
  pathColors?: string[];
  /** 高亮（selecting）时是否禁用 Tooltip，默认 false（显示） */
  tooltipDisabled?: boolean;
}

/** 折线拐点坐标（画布坐标系） */
export interface WayPoint {
  x: number;
  y: number;
}

/** 边数据载荷：通过 `edge.data` 挂载到每条边。 */
export interface EdgeData {
  /** 边颜色，缺省使用主题 CSS 变量 */
  color?: string;
  /** 中间拐点列表，按顺序连成圆角折线 */
  waypoints?: WayPoint[];
  /** 是否处于高亮状态（供外部流程驱动，显示光晕效果） */
  selecting?: boolean;
  /** 共用线段的其他路径颜色（用于渐变着色，由外部业务层写入） */
  sharedColors?: string[];
  /** 是否允许删除此边，优先级高于全局 `edgesDeletable`，默认继承全局 */
  deletable?: boolean;
}

/** 本组件的节点类型别名（带 NodeData 的 VueFlow Node） */
export type FlowNode = Node<NodeData>;
/** 本组件的边类型别名（带 EdgeData 的 VueFlow Edge） */
export type FlowEdge = Edge<EdgeData>;

/** 用于扩展 VueFlow 的节点类型映射 */
export type NodeTypesMap = Record<string, Component>;
/** 用于扩展 VueFlow 的边类型映射 */
export type EdgeTypesMap = Record<string, Component>;

/**
 * 流程图栅格上下文：通过 {@link FlowSnapContextKey} 注入给内部子组件 / composable。
 * 暴露为公共类型，便于业务方编写自定义节点时复用栅格语义。
 */
export interface FlowSnapContext {
  /** 是否开启栅格吸附 */
  snapEnabled: ComputedRef<boolean>;
  /** 栅格尺寸（px） */
  gridSize: ComputedRef<number>;
  /** 圆形节点默认尺寸（px） */
  nodeSize: ComputedRef<number>;
  /** 六边形节点默认尺寸（px） */
  hexagonSize: ComputedRef<number>;
}

/** {@link FlowSnapContext} 的注入键，命名空间隔离 + 类型契约 */
export const FlowSnapContextKey: InjectionKey<FlowSnapContext> = Symbol('aix-flow-snap');

/** 全局 `edgesDeletable` 注入键 */
export const FlowEdgesDeletableKey: InjectionKey<ComputedRef<boolean>> = Symbol(
  'aix-flow-edges-deletable',
);

/** 暴露给外部的底部工具栏插槽 props */
export interface FlowGraphBottomBarSlotProps {
  /** 在视口中心螺旋寻位创建一个圆形节点 */
  addNode: () => void;
  /** 打开搜索面板 */
  openSearch: () => void;
  /** 关闭搜索面板 */
  closeSearch: () => void;
  /** 适应视图 */
  fitView: (params?: { nodes?: string[]; duration?: number; padding?: number }) => void;
  /** 放大 */
  zoomIn: () => void;
  /** 缩小 */
  zoomOut: () => void;
}

/**
 * `FlowGraph` 通过 `defineExpose` 暴露给父组件 ref 的实例方法集合。
 * 用作 `ref<InstanceType<typeof FlowGraph>>` 的类型补充。
 */
export interface FlowGraphInstance {
  /** 适应视图（包裹所有节点） */
  fitView: (params?: { nodes?: string[]; duration?: number; padding?: number }) => void;
  /** 在视口中心螺旋寻位新建一个圆形节点 */
  addNode: () => void;
  /** 打开搜索面板并 focus */
  openSearch: () => void;
  /** 关闭搜索面板并清空高亮 */
  closeSearch: () => void;
  /** 重置所有节点的交互状态（active/context/selecting） */
  resetNodeStates: () => void;
}

/** FlowGraph 组件 Props */
export interface FlowGraphProps {
  /** v-model:nodes 绑定的节点数组 */
  nodes?: FlowNode[];
  /** v-model:edges 绑定的边数组 */
  edges?: FlowEdge[];
  /** 是否允许手动连线（拖拽节点 Handle 创建新边），默认 `false` */
  connectable?: boolean;
  /** 是否开启栅格吸附（拖拽节点结束时吸附到网格），默认 `true` */
  snapGrid?: boolean;
  /** 栅格尺寸（px），同时作为背景线间距，默认 `40` */
  gridSize?: number;
  /** 默认圆形节点尺寸（px），默认 `28` */
  defaultNodeSize?: number;
  /** 默认六边形节点尺寸（px），默认 `40` */
  defaultHexagonSize?: number;
  /** 搜索联想列表最大高度（px），超出后滚动，默认 200 */
  suggestionsMaxHeight?: number;
  /** 自定义节点类型映射；会与内置 `default`/`hexagon` 合并，key 冲突时覆盖内置 */
  nodeTypes?: NodeTypesMap;
  /** 自定义边类型映射；会与内置 `default` 合并，key 冲突时覆盖内置 */
  edgeTypes?: EdgeTypesMap;
  /** 是否允许删除边（右键菜单删除），默认 `true`；单条边可通过 `edge.deletable` 覆盖 */
  edgesDeletable?: boolean;
  /** 底部工具栏位置，默认 `'bottom-center'`；支持字符串或带偏移的对象形式 */
  bottomBarPosition?:
    | PanelPositionType
    | { position?: PanelPositionType; offset?: { x?: number; y?: number } };
}

/** FlowGraph `connect` 事件的载荷；sourceHandle/targetHandle 已规范化为 `string | null`（不含 undefined） */
export interface FlowConnection {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

/** FlowGraph 组件 Emits */
export interface FlowGraphEmits {
  /** 建立新连线（来自 VueFlow 的 `connect` 事件） */
  connect: [connection: FlowConnection];
  /** 节点被点击时触发，携带节点对象与原始事件 */
  'node-click': [payload: { node: FlowNode; event: MouseTouchEvent }];
  /** 节点被右键点击时触发，携带节点对象与原始事件 */
  'node-right-click': [payload: { node: FlowNode; event: MouseTouchEvent }];
  /** 通过内部交互（按钮新建 / 双击空白 / 复制）新增节点时触发 */
  'node-add': [node: FlowNode];
  /** 通过内部交互（右键删除 / Delete 键）删除节点时触发，载荷为节点 id 列表 */
  'node-remove': [nodeIds: string[]];
  /** 通过内部交互（右键删除 / Delete 键）删除边时触发，载荷为边 id 列表 */
  'edge-remove': [edgeIds: string[]];
}
