# @aix/flow-graph

基于 Vue 3 和 Vue Flow 的流程图编辑/预览组件。

## 安装

```bash
pnpm add @aix/flow-graph
```

组件样式与主题变量需要在应用入口各引入一次；节点与连线的右键菜单来自 `@aix/popper`，它的样式也要一并引入：

```ts
import '@aix/flow-graph/style';
import '@aix/popper/style';
import '@aix/theme/style';
```

## 使用

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FlowGraph } from '@aix/flow-graph'
import type { FlowNode, FlowEdge, FlowConnection } from '@aix/flow-graph'

const nodes = ref<FlowNode[]>([
  { id: '1', position: { x: 80, y: 120 } },
  { id: '2', position: { x: 320, y: 120 } },
])

const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: '1', target: '2', label: '主链路' },
])

function onConnect(connection: FlowConnection) {
  edges.value.push({
    id: `e-${connection.source}-${connection.target}-${Date.now()}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: connection.targetHandle ?? undefined,
  })
}
</script>

<template>
  <FlowGraph
    v-model:nodes="nodes"
    v-model:edges="edges"
    :connectable="true"
    style="width: 100%; height: 480px"
    @connect="onConnect"
  />
</template>
```

## API

**FlowGraph** — AixFlowGraph：基于 `@vue-flow/core` 的流程图容器组件。

特性：
- 支持 v-model 双向绑定节点与边；
- 内置圆形 / 六边形节点与彩色折线边，可通过 `nodeTypes`/`edgeTypes` 扩展；
- 支持网格吸附（`snapGrid` + `gridSize`）与画布控制条；
- 双击空白处新增节点；底部面板按钮按螺旋算法在视口中心寻找不重叠位置新增节点；
- 提供 `#bottom-bar` 具名插槽（默认渲染 `添加节点 / Controls / 搜索` 三件套），
  插槽 props 暴露 `addNode / openSearch / closeSearch / fitView / zoomIn / zoomOut`。

### FlowGraph Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `nodes` | `FlowNode[]` | - | - | v-model:nodes 绑定的节点数组 |
| `edges` | `FlowEdge[]` | - | - | v-model:edges 绑定的边数组 |
| `connectable` | `boolean` | - | - | 是否允许手动连线（拖拽节点 Handle 创建新边），默认 `false` |
| `snapGrid` | `boolean` | `true` | - | 是否开启栅格吸附（拖拽节点结束时吸附到网格），默认 `true` |
| `gridSize` | `number` | - | - | 栅格尺寸（px），同时作为背景线间距，默认 `40` |
| `defaultNodeSize` | `number` | - | - | 默认圆形节点尺寸（px），默认 `28` |
| `defaultHexagonSize` | `number` | - | - | 默认六边形节点尺寸（px），默认 `40` |
| `suggestionsMaxHeight` | `number` | - | - | 搜索联想列表最大高度（px），超出后滚动，默认 200 |
| `nodeTypes` | `Record<string, Component>` | - | - | 自定义节点类型映射；会与内置 `default`/`hexagon` 合并，key 冲突时覆盖内置 |
| `edgeTypes` | `Record<string, Component>` | - | - | 自定义边类型映射；会与内置 `default` 合并，key 冲突时覆盖内置 |
| `edgesDeletable` | `boolean` | `true` | - | 是否允许删除边（右键菜单删除），默认 `true`；单条边可通过 `edge.deletable` 覆盖 |
| `bottomBarPosition` | `PanelPositionType \| { position?: PanelPositionType; offset?: { x?: number; y?: number } }` | - | - | 底部工具栏位置，默认 `'bottom-center'`；支持字符串或带偏移的对象形式 |
| `showNodeLabel` | `boolean` | `true` | - | 是否在节点上方常驻显示 `data.label` 文本气泡，默认 `true`。关闭后节点不再显示名称。 |
| `labelZoomThreshold` | `number` | - | - | 常驻 label 显示阈值：`viewport.zoom` 低于此值时整体隐藏，默认 `0.6`。设为 `0` 表示任何缩放都显示。 |
| `nodeMenuOnClick` | `boolean` | `true` | - | 左击节点时是否弹出复制/删除菜单，默认 `true`。关闭后点击仍切换 active 高亮、仍触发 `node-click` 事件，仅不弹菜单。单节点可通过 `node.data.menuOnClick` 覆盖。 |
| `nodeMenuOnHover` | `boolean` | `true` | - | hover 节点时是否弹出复制/删除菜单，默认 `true`。单节点可通过 `node.data.menuOnHover` 覆盖。 |

### FlowGraph Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:nodes` | `nodes: FlowNode[]` | 节点数组变化（v-model:nodes）；由 useControllable 在受控/非受控两态下统一上抛 |
| `update:edges` | `edges: FlowEdge[]` | 边数组变化（v-model:edges）；由 useControllable 在受控/非受控两态下统一上抛 |
| `connect` | `connection: FlowConnection` | 建立新连线（来自 VueFlow 的 `connect` 事件） |
| `node-click` | `payload: { node: FlowNode; event: MouseTouchEvent }` | 节点被点击时触发，携带节点对象与原始事件 |
| `node-right-click` | `payload: { node: FlowNode; event: MouseTouchEvent }` | 节点被右键点击时触发，携带节点对象与原始事件 |
| `node-add` | `node: FlowNode` | 通过内部交互（按钮新建 / 双击空白 / 复制）新增节点时触发 |
| `node-remove` | `nodeIds: string[]` | 通过内部交互（右键删除 / Delete 键）删除节点时触发，载荷为节点 id 列表 |
| `edge-remove` | `edgeIds: string[]` | 通过内部交互（右键删除 / Delete 键）删除边时触发，载荷为边 id 列表 |
| `node-delete-blocked` | `nodeIds: string[]` | 删除 `data.deletable === false` 的节点被拦截时触发，载荷为被拦截的节点 id 列表，业务层可据此提示用户为何无法删除。两条路径都会上报：<br>- 键盘 Delete/Backspace 命中（由 FlowGraph.onKeyDelete 统一拦截）；<br>- 点击右键菜单中已视觉置灰的"删除"项（由 useNodeInteraction.onCommand 经 {@link FlowNodeDeleteBlockedKey} 注入回调转发到此 emit）。 |

### FlowGraph Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `bottom-bar` | - | 底部操作栏，作用域给出 addNode / openSearch / closeSearch / fitView / zoomIn / zoomOut；默认渲染新建节点按钮与缩放控件 |

### FlowGraph Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `fitView` | `(params?: { nodes?: string[]; duration?: number; padding?: number }) => void` | 适应视图（包裹所有节点） |
| `addNode` | `() => void` | 在视口中心螺旋寻位新建一个圆形节点 |
| `openSearch` | `() => void` | 打开搜索面板并 focus |
| `closeSearch` | `() => void` | 关闭搜索面板并清空高亮 |
| `resetNodeStates` | `() => void` | 重置所有节点的交互状态（active/context/selecting） |

---

**BaseNode** — 节点公共骨架：
- 统一安装 ContextMenu（复制/删除）、节点上方常驻 label、NodeActiveCross、Handle；
- 统一挂载 useNodeInteraction（点击/右键/复制/删除的状态同步）；
- 视觉通过默认 slot 暴露 `{ size, nodeState, onClick }`，由子类渲染形状；
- Handle 的 pointer-events 由 `connectable` 控制。

### BaseNode Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `id` | `string` | - | ✅ | 节点 id（由 Vue Flow 注入） |
| `data` | `NodeData` | - | - | 节点数据 |
| `dragging` | `boolean` | - | - | 是否正在拖拽（由 Vue Flow 注入） |
| `connectable` | `HandleConnectable` | - | - | 连接点是否可连接（由 Vue Flow 注入） |
| `defaultSize` | `number` | - | ✅ | 节点默认尺寸（px）：当 data.size 未设置时使用 |
| `fallbackColor` | `string` | - | ✅ | NodeActiveCross 颜色回退值：当 data.color 未设置时使用 |

### BaseNode Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | - | 节点主体内容，作用域含 size / nodeState / clicking / onClick |

---

**CircleNode** — 圆形节点：默认节点类型。
所有交互（点击 active / 右键菜单 / 上方 label / Handle）均由 {@link BaseNode} 承载。

### CircleNode Props

Props 为 `@vue-flow/core` 的 `NodeProps<NodeData>`，由 VueFlow 在渲染节点时注入，业务侧不直接传。

---

**HexagonNode** — 六边形节点：与 CircleNode 行为一致，仅视觉不同；`context` 状态下内外填充对调。
交互壳由 {@link BaseNode} 承载。

### HexagonNode Props

Props 为 `@vue-flow/core` 的 `NodeProps<NodeData>`，由 VueFlow 在渲染节点时注入，业务侧不直接传。

---

**NodeActiveCross** — 节点 active 状态的四向渐变十字装饰。
- 单色：每条臂从 0.7 不透明度 → 0（淡出）。
- 多色：每条臂沿自身方向均匀分布多色，末色 alpha 为 0（淡出）。

### NodeActiveCross Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `uid` | `string` | - | ✅ | SVG 渐变 id 的唯一后缀，避免多个节点间互相覆盖 |
| `color` | `string` | - | ✅ | 路径颜色，colors 为空时使用 |
| `colors` | `string[]` | `[]` | - | 多路径颜色列表，优先级高于 color |

---

**ColorEdge** — 彩色折线边：
- 自动根据起止节点实际尺寸修正箭头贴边；
- 支持 waypoints（圆角折线），路径上按住左键插入新拐点并拖动，右键删除拐点；
- 选中时暴露拐点 handle；右键边本身弹出“删除”菜单（由 @aix/popper ContextMenu 承载）。

### ColorEdge Props

Props 为 `@vue-flow/core` 的 `EdgeProps<EdgeData>`，由 VueFlow 在渲染边时注入，业务侧不直接传。

---

**FlowControls** — 画布控制条：左下角 Panel，提供缩小 / 缩放百分比显示 / 放大 / 适应视图四个操作。
直接消费 VueFlow 的 `useVueFlow` 暴露的控制方法。

### FlowControls

暂无对外 API。

---

**FlowSearch** — 画布搜索面板：按关键字检索节点，选中后定位到画布上的该节点。

### FlowSearch Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `nodes` | `FlowNode[]` | - | ✅ | 参与搜索的节点列表 |
| `suggestionsMaxHeight` | `number` | - | - | 候选列表最大高度（px） |
