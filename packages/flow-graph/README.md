# @aix/flow-graph

基于 Vue 3 和 Vue Flow 的流程图编辑/预览组件。

## 安装

```bash
pnpm add @aix/flow-graph
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

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `nodes` | `Array<FlowNode>` | - | - | v-model:nodes 绑定的节点数组 |
| `edges` | `Array<FlowEdge>` | - | - | v-model:edges 绑定的边数组 |
| `connectable` | `boolean` | - | - | 是否允许手动连线（拖拽节点 Handle 创建新边），默认 `false` |
| `snapGrid` | `boolean` | `true` | - | 是否开启栅格吸附（拖拽节点结束时吸附到网格），默认 `true` |
| `gridSize` | `number` | - | - | 栅格尺寸（px），同时作为背景线间距，默认 `40` |
| `defaultNodeSize` | `number` | - | - | 默认圆形节点尺寸（px），默认 `28` |
| `defaultHexagonSize` | `number` | - | - | 默认六边形节点尺寸（px），默认 `40` |
| `suggestionsMaxHeight` | `number` | - | - | 搜索联想列表最大高度（px），超出后滚动，默认 200 |
| `nodeTypes` | `NodeTypesMap` | - | - | 自定义节点类型映射；会与内置 `default`/`hexagon` 合并，key 冲突时覆盖内置 |
| `edgeTypes` | `EdgeTypesMap` | - | - | 自定义边类型映射；会与内置 `default` 合并，key 冲突时覆盖内置 |
| `edgesDeletable` | `boolean` | `true` | - | 是否允许删除边（右键菜单删除），默认 `true`；单条边可通过 `edge.deletable` 覆盖 |
| `bottomBarPosition` | `PanelPositionType \| { position?: PanelPositionType; offset?: { x?: number; y?: number; }; }` | - | - | 底部工具栏位置，默认 `'bottom-center'`；支持字符串或带偏移的对象形式 |
| `showNodeLabel` | `boolean` | `true` | - | 是否在节点上方常驻显示 `data.label` 文本气泡，默认 `true`。 关闭后节点不再显示名称。 |
| `labelZoomThreshold` | `number` | - | - | 常驻 label 显示阈值：`viewport.zoom` 低于此值时整体隐藏，默认 `0.6`。 设为 `0` 表示任何缩放都显示。 |
| `nodeMenuOnClick` | `boolean` | `true` | - | 左击节点时是否弹出复制/删除菜单，默认 `true`。 关闭后点击仍切换 active 高亮、仍触发 `node-click` 事件，仅不弹菜单。 单节点可通过 `node.data.menuOnClick` 覆盖。 |
| `nodeMenuOnHover` | `boolean` | `true` | - | hover 节点时是否弹出复制/删除菜单，默认 `true`。 单节点可通过 `node.data.menuOnHover` 覆盖。 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:nodes` | `FlowNode[]` | 节点数组变化（v-model:nodes）；由 useControllable 在受控/非受控两态下统一上抛 |
| `update:edges` | `FlowEdge[]` | 边数组变化（v-model:edges）；由 useControllable 在受控/非受控两态下统一上抛 |
| `connect` | `FlowConnection` | 建立新连线（来自 VueFlow 的 `connect` 事件） |
| `node-click` | `{ node: FlowNode; event: MouseTouchEvent; }` | 节点被点击时触发，携带节点对象与原始事件 |
| `node-right-click` | `{ node: FlowNode; event: MouseTouchEvent; }` | 节点被右键点击时触发，携带节点对象与原始事件 |
| `node-add` | `FlowNode` | 通过内部交互（按钮新建 / 双击空白 / 复制）新增节点时触发 |
| `node-remove` | `string[]` | 通过内部交互（右键删除 / Delete 键）删除节点时触发，载荷为节点 id 列表 |
| `edge-remove` | `string[]` | 通过内部交互（右键删除 / Delete 键）删除边时触发，载荷为边 id 列表 |
| `node-delete-blocked` | `string[]` | 删除 `data.deletable === false` 的节点被拦截时触发，载荷为被拦截的节点 id 列表， 业务层可据此提示用户为何无法删除。两条路径都会上报： - 键盘 Delete/Backspace 命中（由 FlowGraph.onKeyDelete 统一拦截）； - 点击右键菜单中已视觉置灰的"删除"项（由 useNodeInteraction.onCommand 经 {@link FlowNodeDeleteBlockedKey} 注入回调转发到此 emit）。 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `bottom-bar` | - |

### 暴露方法

通过模板 ref 获取实例（类型为 `FlowGraphInstance`）：

| 方法 | 签名 | 说明 |
|------|------|------|
| `fitView` | `(params?: { nodes?: string[]; duration?: number; padding?: number }) => void` | 适应视图（包裹所有节点） |
| `addNode` | `() => void` | 在视口中心螺旋寻位新建一个圆形节点 |
| `openSearch` | `() => void` | 打开搜索面板并 focus |
| `closeSearch` | `() => void` | 关闭搜索面板并清空高亮 |
| `resetNodeStates` | `() => void` | 重置所有节点的交互状态（active / context / selecting） |
