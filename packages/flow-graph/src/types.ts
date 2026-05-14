import type { Node, Edge, MouseTouchEvent } from '@vue-flow/core';
import type { Component, ComputedRef, InjectionKey, Ref } from 'vue';
import type { FlowGraphLocale } from './locale';

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
  /** 节点标签：作为节点上方常驻气泡显示；超长单行省略，hover 节点时展开多行 */
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
  /** 是否处于淡化状态（opacity 0.4），由外部业务层写入 */
  dimmed?: boolean;
  /** 编辑路径时临时覆盖的单色，优先于 color 渲染；退出编辑时清空 */
  activeColor?: string;
  /**
   * 是否允许"左击"弹出复制/删除菜单。
   * 未设置时继承全局 `nodeMenuOnClick`（默认 true）。
   * 注意：仅控制菜单弹出，不影响 active 状态切换与 `node-click` 事件。
   */
  menuOnClick?: boolean;
  /**
   * 是否允许"hover"弹出复制/删除菜单。
   * 未设置时继承全局 `nodeMenuOnHover`（默认 true）。
   */
  menuOnHover?: boolean;
  /**
   * 是否允许删除此节点，默认 `true`。
   * - `false` 时菜单中的"删除"项呈禁用样式（灰色 + not-allowed 光标），点击不会真的删除；
   * - 同时拦截键盘 Delete/Backspace 删除；
   * - 两种被拦截的尝试都会触发 `node-delete-blocked` 事件，业务层可据此提示用户。
   * 不影响复制；如需禁用复制请使用 `menuOnClick / menuOnHover`。
   */
  deletable?: boolean;
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
  /** 是否处于淡化状态（opacity 0.4），由外部业务层写入 */
  dimmed?: boolean;
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

/**
 * 节点常驻 label 配置：控制是否在节点上方显示 data.label 文本，以及最小可见缩放。
 * 通过 {@link FlowNodeLabelConfigKey} 注入给 BaseNode 消费。
 */
export interface FlowNodeLabelConfig {
  /** 是否开启常驻 label（关闭后节点上方不再显示名称气泡） */
  enabled: ComputedRef<boolean>;
  /** 显示阈值：viewport.zoom 低于此值时整体隐藏，避免画面密集 */
  zoomThreshold: ComputedRef<number>;
}

/**
 * {@link FlowNodeLabelConfig} 的注入键。
 * 与 {@link FlowActiveWaypointKey} 同理走 `Symbol.for`，
 * 在 Storybook + Vite HMR 下也能保证 provide / inject 用的是同一个 Symbol。
 */
export const FlowNodeLabelConfigKey: InjectionKey<FlowNodeLabelConfig> = Symbol.for(
  'aix-flow-node-label',
) as InjectionKey<FlowNodeLabelConfig>;

/**
 * 节点复制/删除菜单的全局触发开关，由 FlowGraph 注入。
 * 单节点可通过 `node.data.menuOnClick / menuOnHover` 覆盖。
 */
export interface FlowNodeMenuConfig {
  /** 左击是否弹出菜单（默认 true） */
  onClick: ComputedRef<boolean>;
  /** hover 是否弹出菜单（默认 true） */
  onHover: ComputedRef<boolean>;
}

export const FlowNodeMenuConfigKey: InjectionKey<FlowNodeMenuConfig> = Symbol.for(
  'aix-flow-node-menu',
) as InjectionKey<FlowNodeMenuConfig>;

/**
 * "点击删除被拦截"的注入回调：当节点 `data.deletable === false` 时，
 * BaseNode 的删除菜单仍可点击（视觉为禁用样式），点击后由此回调上报到 FlowGraph，
 * 进而 emit 公共事件 `node-delete-blocked`，业务层可弹 toast。
 *
 * 单独使用 BaseNode（脱离 FlowGraph）时回退为 `null`，点击仍被拦截但无事件抛出。
 */
export const FlowNodeDeleteBlockedKey: InjectionKey<(nodeId: string) => void> = Symbol.for(
  'aix-flow-node-delete-blocked',
) as InjectionKey<(nodeId: string) => void>;

/**
 * FlowGraph 子组件共享的翻译 ComputedRef。
 * 由 FlowGraph 通过 `useLocale` 解析后 provide，BaseNode / ColorEdge / FlowSearch / FlowControls
 * 通过 inject 读取，避免每个子组件重复 inject 全局 locale 并加载组件语言包。
 */
export const FlowGraphLocaleKey: InjectionKey<ComputedRef<FlowGraphLocale>> = Symbol.for(
  'aix-flow-graph-locale',
) as InjectionKey<ComputedRef<FlowGraphLocale>>;

/** 当前选中的拐点（跨 edge 单选；由 FlowGraph 持有并按需重置） */
export interface FlowActiveWaypoint {
  edgeId: string;
  index: number;
}

/**
 * 当前选中拐点的注入键。
 * 使用 `Symbol.for` 走全局注册表，相同 key 永远返回同一 Symbol，
 * 在 Storybook + Vite HMR 下也不会因 types.ts 被重新求值而产生新 Symbol，
 * 保证 inject 始终能匹配到对应 FlowGraph 实例的 provider。
 */
export const FlowActiveWaypointKey: InjectionKey<Ref<FlowActiveWaypoint | null>> = Symbol.for(
  'aix-flow-active-waypoint',
) as InjectionKey<Ref<FlowActiveWaypoint | null>>;

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
  /**
   * 是否在节点上方常驻显示 `data.label` 文本气泡，默认 `true`。
   * 关闭后节点不再显示名称。
   */
  showNodeLabel?: boolean;
  /**
   * 常驻 label 显示阈值：`viewport.zoom` 低于此值时整体隐藏，默认 `0.6`。
   * 设为 `0` 表示任何缩放都显示。
   */
  labelZoomThreshold?: number;
  /**
   * 左击节点时是否弹出复制/删除菜单，默认 `true`。
   * 关闭后点击仍切换 active 高亮、仍触发 `node-click` 事件，仅不弹菜单。
   * 单节点可通过 `node.data.menuOnClick` 覆盖。
   */
  nodeMenuOnClick?: boolean;
  /**
   * hover 节点时是否弹出复制/删除菜单，默认 `true`。
   * 单节点可通过 `node.data.menuOnHover` 覆盖。
   */
  nodeMenuOnHover?: boolean;
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
  /**
   * 删除 `data.deletable === false` 的节点被拦截时触发，载荷为被拦截的节点 id 列表，
   * 业务层可据此提示用户为何无法删除。两条路径都会上报：
   * - 键盘 Delete/Backspace 命中（由 FlowGraph.onKeyDelete 统一拦截）；
   * - 点击右键菜单中已视觉置灰的"删除"项（由 useNodeInteraction.onCommand 经
   *   {@link FlowNodeDeleteBlockedKey} 注入回调转发到此 emit）。
   */
  'node-delete-blocked': [nodeIds: string[]];
}
