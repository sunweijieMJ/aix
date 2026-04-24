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
import type { FlowNode, FlowEdge, Connection } from '@aix/flow-graph'

const nodes = ref<FlowNode[]>([
  { id: '1', position: { x: 80, y: 120 } },
  { id: '2', position: { x: 320, y: 120 } },
])

const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: '1', target: '2', label: '主链路' },
])

function onConnect(connection: Connection) {
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
    mode="edit"
    :fit-view-on-init="true"
    style="width: 100%; height: 480px"
    @connect="onConnect"
  />
</template>
```

## Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `nodes` | `FlowNode[]` | `[]` | 节点数据，支持 `v-model:nodes` |
| `edges` | `FlowEdge[]` | `[]` | 边数据，支持 `v-model:edges` |
| `mode` | `'edit' \| 'view'` | `'edit'` | 编辑/只读模式 |
| `nodesSelectable` | `boolean` | `true` | 是否允许选择节点和边 |
| `nodesDraggable` | `boolean` | `true` | 是否允许拖拽节点 |
| `nodesConnectable` | `boolean` | `true` | 是否允许发起连线 |
| `showControls` | `boolean` | `true` | 是否显示缩放控制条 |
| `showMinimap` | `boolean` | `false` | 是否显示缩略图 |
| `showAddNodeButton` | `boolean` | `true` | 是否显示底部添加节点按钮 |
| `background` | `'dots' \| 'lines' \| 'cross' \| false` | `'dots'` | 背景样式，`cross` 会降级为 `dots` |
| `fitViewOnInit` | `boolean` | `false` | 初始化时是否自动适配视口 |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `connect` | `(connection: Connection)` | 用户完成一条连线 |
| `node-click` | `(event: MouseEvent, node: FlowNode)` | 节点点击 |
| `edge-click` | `(event: MouseEvent, edge: FlowEdge)` | 边点击 |
| `selection-change` | `({ nodes, edges })` | 选中元素变化 |
| `add-node-request` | `()` | 点击底部添加节点按钮 |

## Slots

| 插槽名 | 说明 |
|--------|------|
| `toolbar` | 顶部工具栏 |
| `controls` | 自定义缩放控制条 |
| `minimap` | 自定义缩略图 |
| `progress` | 底部操作区扩展内容 |

## 暴露方法

- `fitView()`
- `zoomIn() / zoomOut()`
- `setViewport() / getViewport()`
- `addNode() / removeNode() / updateNode() / getNode()`
- `addEdge() / removeEdge() / updateEdge() / getEdge()`
- `selectAll() / clearSelection()`

## API

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `nodes` | `Array<FlowNode>` | - | - | v-model:nodes 绑定的节点数组 |
| `edges` | `Array<FlowEdge>` | - | - | v-model:edges 绑定的边数组 |
| `connectable` | `boolean` | - | - | 是否允许手动连线（拖拽节点 Handle 创建新边），默认 `false` |
| `snapGrid` | `boolean` | - | - | 是否开启栅格吸附（拖拽节点结束时吸附到网格），默认 `true` |
| `gridSize` | `number` | - | - | 栅格尺寸（px），同时作为背景线间距，默认 `40` |
| `defaultNodeSize` | `number` | - | - | 默认圆形节点尺寸（px），默认 `28` |
| `defaultHexagonSize` | `number` | - | - | 默认六边形节点尺寸（px），默认 `40` |
| `suggestionsMaxHeight` | `number` | - | - | 搜索联想列表最大高度（px），超出后滚动，默认 200 |
| `nodeTypes` | `NodeTypesMap` | - | - | 自定义节点类型映射；会与内置 `default`/`hexagon` 合并，key 冲突时覆盖内置 |
| `edgeTypes` | `EdgeTypesMap` | - | - | 自定义边类型映射；会与内置 `default` 合并，key 冲突时覆盖内置 |
| `edgesDeletable` | `boolean` | - | - | 是否允许删除边（右键菜单删除），默认 `true`；单条边可通过 `edge.deletable` 覆盖 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `node-click` | `{ node: FlowNode; event: MouseTouchEvent }` | 节点被点击 |
| `node-right-click` | `{ node: FlowNode; event: MouseTouchEvent }` | - |
| `connect` | `FlowConnection` | - |
