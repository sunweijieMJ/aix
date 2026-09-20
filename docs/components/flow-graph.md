---
title: FlowGraph 流程图
outline: deep
---

<script setup>
import { ref } from 'vue'
import { FlowGraph, createNodeId } from '@aix/flow-graph'

const basicNodes = ref([
  { id: '1', type: 'hexagon', position: { x: 60, y: 140 }, data: { label: '开始' } },
  { id: '2', position: { x: 266, y: 66 }, data: { label: '活动 1.1 认识人工智能' } },
  { id: '3', position: { x: 266, y: 226 }, data: { label: '活动 1.2 机器学习入门' } },
  { id: '4', position: { x: 466, y: 146 }, data: { label: '活动 1.3 深度学习基础' } },
])
const basicEdges = ref([
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
])

const connectNodes = ref([
  { id: 'a', position: { x: 80, y: 100 }, data: { label: 'A' } },
  { id: 'b', position: { x: 300, y: 100 }, data: { label: 'B' } },
  { id: 'c', type: 'hexagon', position: { x: 300, y: 260 }, data: { label: 'C' } },
  { id: 'd', position: { x: 520, y: 180 }, data: { label: 'D' } },
])
const connectEdges = ref([{ id: 'e-a-b', source: 'a', target: 'b' }])
const connectLog = ref('')
function onConnect(connection) {
  connectEdges.value.push({
    id: `e-${connection.source}-${connection.target}-${Date.now()}`,
    source: connection.source,
    target: connection.target,
  })
  connectLog.value = `${connection.source} → ${connection.target}`
}

const RED = '#e34935'
const BLUE = '#1546f2'
const GREEN = '#00b42a'
const pathNodes = ref([
  { id: 'a1', position: { x: 80, y: 60 }, data: { label: 'A1', color: RED } },
  { id: 'a2', position: { x: 80, y: 180 }, data: { label: 'A2', color: BLUE } },
  { id: 'a3', position: { x: 80, y: 300 }, data: { label: 'A3', color: GREEN } },
  { id: 'b', position: { x: 280, y: 120 }, data: { label: 'B（共用）', color: RED, pathColors: [RED, BLUE] } },
  { id: 'c', type: 'hexagon', position: { x: 480, y: 180 }, data: { label: 'C（共用）', color: RED, pathColors: [RED, BLUE, GREEN] } },
  { id: 'd1', position: { x: 680, y: 60 }, data: { label: 'D1', color: RED } },
  { id: 'd2', position: { x: 680, y: 300 }, data: { label: 'D2', color: GREEN } },
])
const pathEdges = ref([
  { id: 'e-a1-b', source: 'a1', target: 'b', data: { color: RED } },
  { id: 'e-a2-b', source: 'a2', target: 'b', data: { color: BLUE } },
  { id: 'e-b-c', source: 'b', target: 'c', data: { color: RED, sharedColors: [BLUE] } },
  { id: 'e-a3-c', source: 'a3', target: 'c', data: { color: GREEN } },
  { id: 'e-c-d1', source: 'c', target: 'd1', data: { color: RED } },
  { id: 'e-c-d2', source: 'c', target: 'd2', data: { color: GREEN } },
])

const barNodes = ref([
  { id: '1', position: { x: 100, y: 120 }, data: { label: '节点 1' } },
  { id: '2', type: 'hexagon', position: { x: 300, y: 120 }, data: { label: '节点 2' } },
])
const barEdges = ref([{ id: 'e1-2', source: '1', target: '2' }])
function addHexagon() {
  barNodes.value.push({
    id: createNodeId('hex'),
    type: 'hexagon',
    position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 100 },
    data: { label: '六边形' },
  })
}

const menuNodes = ref([
  { id: 'root', position: { x: 80, y: 120 }, data: { label: '根节点（不可删除）', deletable: false } },
  { id: 'n2', position: { x: 300, y: 120 }, data: { label: '可删除' } },
  { id: 'n3', position: { x: 520, y: 120 }, data: { label: '不弹菜单', menuOnClick: false, menuOnHover: false } },
])
const menuEdges = ref([
  { id: 'e-root-n2', source: 'root', target: 'n2' },
  { id: 'e-n2-n3', source: 'n2', target: 'n3', data: { deletable: false } },
])
const blockedTip = ref('')
let blockedTimer = null
function onBlocked(ids) {
  blockedTip.value = `已拦截删除：${ids.join(', ')}`
  if (blockedTimer) clearTimeout(blockedTimer)
  blockedTimer = setTimeout(() => (blockedTip.value = ''), 2000)
}
</script>

<style>
.flow-graph-demo {
  padding: 0;
  overflow: hidden;
}

.flow-graph-demo > * + * {
  margin-left: 0;
}

.flow-graph-demo__canvas {
  height: 420px;
}

.flow-graph-demo__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--aix-colorBorder);
  background: var(--aix-colorBgLayout);
  color: var(--aix-colorTextSecondary);
  font-size: 13px;
}

.flow-graph-demo__tip {
  margin-left: auto;
  padding: 2px 10px;
  border-radius: 4px;
  background: var(--aix-colorWarningBg);
  color: var(--aix-colorWarning);
}

.flow-graph-demo__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 42px;
  padding: 0 8px;
  border-radius: var(--aix-borderRadiusLG);
  background: var(--aix-colorBgElevated);
  box-shadow: var(--aix-shadowMD);
}

.flow-graph-demo__btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--aix-colorBorder);
  border-radius: 8px;
  background: transparent;
  color: var(--aix-colorText);
  font-size: 13px;
  cursor: pointer;
}

.flow-graph-demo__btn--primary {
  border-color: var(--aix-colorPrimary);
  background: var(--aix-colorPrimary);
  color: var(--aix-colorWhite);
}

.flow-graph-demo__divider {
  width: 1px;
  height: 18px;
  background: var(--aix-colorBorder);
}
</style>

# FlowGraph 流程图

基于 [Vue Flow](https://vueflow.dev/) 的流程图编辑 / 预览组件。内置圆形与六边形两种节点、带箭头的彩色折线边、节点上方常驻名称气泡、底部「添加节点 / 缩放 / 搜索」工具栏，以及节点右键菜单（复制 / 删除）、拖拽连线、栅格吸附、多路径共用着色等交互。

## 何时使用

- 学习路径、课程活动流、任务依赖等需要以「节点 + 有向边」表达的编排场景
- 需要用户在画布上直接增删节点、拖拽连线、搜索定位节点的轻量编辑器
- 同一节点或边被多条业务路径共用，需要用颜色区分路径归属的可视化

## 安装

```bash
pnpm add @aix/flow-graph
```

组件样式与主题变量需要在应用入口各引入一次；节点与边的右键菜单来自 `@aix/popper`，它的样式也要一并引入：

```ts
import '@aix/flow-graph/style';
import '@aix/popper/style';
import '@aix/theme/style';
```

## 代码演示

### 基础用法

`v-model:nodes` / `v-model:edges` 双向绑定节点与边，数据结构即 Vue Flow 的 `Node` / `Edge`，业务字段放在 `data` 里（`label` / `color` / `size` 等，见 `NodeData`）。节点 `type` 缺省为圆形，`'hexagon'` 为六边形。画布自带背景网格、右下角缩略图与底部工具栏；双击空白处新增节点，右键节点弹出复制 / 删除菜单，选中后按 Delete 删除。**容器必须有确定高度**，Vue Flow 才能计算视口。

<ClientOnly>
<div class="demo-block flow-graph-demo">
  <div class="flow-graph-demo__canvas">
    <FlowGraph v-model:nodes="basicNodes" v-model:edges="basicEdges" />
  </div>
</div>
</ClientOnly>

```vue
<template>
  <FlowGraph v-model:nodes="nodes" v-model:edges="edges" style="width: 100%; height: 480px" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { FlowGraph, type FlowEdge, type FlowNode } from '@aix/flow-graph';

const nodes = ref<FlowNode[]>([
  { id: '1', type: 'hexagon', position: { x: 60, y: 140 }, data: { label: '开始' } },
  { id: '2', position: { x: 266, y: 66 }, data: { label: '活动 1.1 认识人工智能' } },
  { id: '3', position: { x: 266, y: 226 }, data: { label: '活动 1.2 机器学习入门' } },
  { id: '4', position: { x: 466, y: 146 }, data: { label: '活动 1.3 深度学习基础' } },
]);

const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
]);
</script>
```

### 连线与栅格

`connectable` 开启后可从节点的连接点拖出新边，松手时触发 `connect` 事件；组件只上报连接意图，边由业务侧写入 `edges`，便于校验去重或补充 `data`。`gridSize` 同时决定背景线间距与吸附步长，`snapGrid` 默认开启，拖拽结束时节点吸附到网格。

<ClientOnly>
<div class="demo-block flow-graph-demo">
  <div class="flow-graph-demo__bar">
    从节点边缘拖出连线到另一节点；栅格 20px。
    <span v-if="connectLog" class="flow-graph-demo__tip">connect：{{ connectLog }}</span>
  </div>
  <div class="flow-graph-demo__canvas">
    <FlowGraph v-model:nodes="connectNodes" v-model:edges="connectEdges" connectable :grid-size="20" @connect="onConnect" />
  </div>
</div>
</ClientOnly>

```vue
<template>
  <FlowGraph v-model:nodes="nodes" v-model:edges="edges" connectable :grid-size="20" @connect="onConnect" />
</template>

<script setup lang="ts">
import type { FlowConnection } from '@aix/flow-graph';

function onConnect(connection: FlowConnection) {
  edges.value.push({
    id: `e-${connection.source}-${connection.target}-${Date.now()}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: connection.targetHandle ?? undefined,
  });
}
</script>
```

### 多路径着色

`data.color` 决定节点与边的主色。一个节点被多条路径共用时传 `pathColors`，节点按扇形分色，选中时的十字装饰也按多色渐变；一条边被多条路径共用时传 `sharedColors`，与 `color` 一起渐变着色。`selecting` / `dimmed` 由业务写入，分别表现为外圈高亮与 0.4 透明度淡化，适合「高亮当前路径、淡化其他路径」的场景。

<ClientOnly>
<div class="demo-block flow-graph-demo">
  <div class="flow-graph-demo__canvas">
    <FlowGraph v-model:nodes="pathNodes" v-model:edges="pathEdges" />
  </div>
</div>
</ClientOnly>

```ts
const nodes: FlowNode[] = [
  { id: 'a1', position: { x: 80, y: 60 }, data: { label: 'A1', color: RED } },
  { id: 'b', position: { x: 280, y: 120 }, data: { label: 'B（共用）', color: RED, pathColors: [RED, BLUE] } },
];
const edges: FlowEdge[] = [
  { id: 'e-a1-b', source: 'a1', target: 'b', data: { color: RED } },
  { id: 'e-b-c', source: 'b', target: 'c', data: { color: RED, sharedColors: [BLUE] } },
];
```

### 自定义底部工具栏

`bottom-bar` 插槽整体替换默认的「添加节点 / 缩放控件 / 搜索」三件套，作用域给出 `addNode` / `openSearch` / `closeSearch` / `fitView` / `zoomIn` / `zoomOut`。`addNode` 只新建圆形节点，其他形状由业务自行 push，`createNodeId` 生成不重复的 id。工具栏位置由 `bottomBarPosition` 控制，右侧有抽屉时可传 `{ position: 'bottom-center', offset: { x: -300 } }` 让它避开遮挡。

<ClientOnly>
<div class="demo-block flow-graph-demo">
  <div class="flow-graph-demo__canvas">
    <FlowGraph v-model:nodes="barNodes" v-model:edges="barEdges">
      <template #bottom-bar="{ addNode, openSearch, fitView, zoomIn, zoomOut }">
        <div class="flow-graph-demo__toolbar">
          <button type="button" class="flow-graph-demo__btn flow-graph-demo__btn--primary" @click="addNode">+ 圆形</button>
          <button type="button" class="flow-graph-demo__btn" @click="addHexagon">+ 六边形</button>
          <span class="flow-graph-demo__divider" />
          <button type="button" class="flow-graph-demo__btn" @click="zoomOut()">－</button>
          <button type="button" class="flow-graph-demo__btn" @click="zoomIn()">＋</button>
          <button type="button" class="flow-graph-demo__btn" @click="fitView()">适应视图</button>
          <span class="flow-graph-demo__divider" />
          <button type="button" class="flow-graph-demo__btn" @click="openSearch">搜索</button>
        </div>
      </template>
    </FlowGraph>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <FlowGraph v-model:nodes="nodes" v-model:edges="edges" :bottom-bar-position="{ position: 'bottom-center', offset: { x: -300 } }">
    <template #bottom-bar="{ addNode, openSearch, fitView, zoomIn, zoomOut }">
      <MyToolbar @add-circle="addNode" @add-hexagon="addHexagon" @fit="fitView()" @zoom-in="zoomIn()" @zoom-out="zoomOut()" @search="openSearch" />
    </template>
  </FlowGraph>
</template>

<script setup lang="ts">
import { createNodeId, type FlowNode } from '@aix/flow-graph';

function addHexagon() {
  nodes.value.push({ id: createNodeId('hex'), type: 'hexagon', position: { x: 200, y: 200 }, data: { label: '六边形' } });
}
</script>
```

同样一组方法也通过 `defineExpose` 暴露在组件实例上（另有 `resetNodeStates` 清空所有节点的 active / context / selecting 状态），用 `ref<FlowGraphInstance>()` 接住即可在工具栏之外调用。

### 节点菜单与删除控制

左击或 hover 节点默认弹出复制 / 删除菜单，`nodeMenuOnClick` / `nodeMenuOnHover` 全局关闭，单节点用 `data.menuOnClick` / `data.menuOnHover` 覆盖；关闭菜单不影响 active 高亮与 `node-click` 事件。节点 `data.deletable: false` 时菜单的「删除」项置灰、键盘 Delete 也被拦截，两种被拦截的尝试都触发 `node-delete-blocked`，业务可据此提示原因。边的删除由 `edgesDeletable` 全局控制，单条边用 `data.deletable` 覆盖。

<ClientOnly>
<div class="demo-block flow-graph-demo">
  <div class="flow-graph-demo__bar">
    右键「根节点」尝试删除，或选中后按 Delete；右键 n2 → n3 的边观察删除项被禁用。
    <span v-if="blockedTip" class="flow-graph-demo__tip">{{ blockedTip }}</span>
  </div>
  <div class="flow-graph-demo__canvas">
    <FlowGraph v-model:nodes="menuNodes" v-model:edges="menuEdges" @node-delete-blocked="onBlocked" />
  </div>
</div>
</ClientOnly>

```vue
<template>
  <FlowGraph
    v-model:nodes="nodes"
    v-model:edges="edges"
    :node-menu-on-hover="false"
    :edges-deletable="false"
    @node-delete-blocked="onBlocked"
    @node-remove="onNodeRemove"
  />
</template>

<script setup lang="ts">
const nodes = ref<FlowNode[]>([
  { id: 'root', position: { x: 80, y: 120 }, data: { label: '根节点', deletable: false } },
  { id: 'n3', position: { x: 520, y: 120 }, data: { label: '不弹菜单', menuOnClick: false, menuOnHover: false } },
]);

function onBlocked(ids: string[]) {
  // 弹 toast 提示「根节点不可删除」
}

function onNodeRemove(ids: string[]) {
  // 内部交互（右键删除 / Delete 键）删除节点后的业务同步
}
</script>
```

### 常驻名称与缩放阈值

`data.label` 以气泡形式常驻在节点上方，超长单行省略、hover 展开多行。`:show-node-label="false"` 整体隐藏；`labelZoomThreshold`（默认 `0.6`）指定视口缩放低于多少时隐藏全部气泡，避免缩小到全貌时文字堆叠，`:label-zoom-threshold="0"` 表示任何缩放都显示。

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

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
| `connectable` | `boolean` | `false` | - | 是否允许手动连线（拖拽节点 Handle 创建新边） |
| `snapGrid` | `boolean` | `true` | - | 是否开启栅格吸附（拖拽节点结束时吸附到网格），默认 `true` |
| `gridSize` | `number` | `40` | - | 栅格尺寸（px），同时作为背景线间距 |
| `defaultNodeSize` | `number` | `28` | - | 默认圆形节点尺寸（px） |
| `defaultHexagonSize` | `number` | `40` | - | 默认六边形节点尺寸（px） |
| `suggestionsMaxHeight` | `number` | `200` | - | 搜索联想列表最大高度（px），超出后滚动 |
| `nodeTypes` | `Record<string, Component>` | - | - | 自定义节点类型映射；会与内置 `default`/`hexagon` 合并，key 冲突时覆盖内置 |
| `edgeTypes` | `Record<string, Component>` | - | - | 自定义边类型映射；会与内置 `default` 合并，key 冲突时覆盖内置 |
| `edgesDeletable` | `boolean` | `true` | - | 是否允许删除边（右键菜单删除），默认 `true`；单条边可通过 `edge.deletable` 覆盖 |
| `bottomBarPosition` | `PanelPositionType \| { position?: PanelPositionType; offset?: { x?: number; y?: number } }` | `'bottom-center'` | - | 底部工具栏位置；支持字符串或带偏移的对象形式 |
| `showNodeLabel` | `boolean` | `true` | - | 是否在节点上方常驻显示 `data.label` 文本气泡，默认 `true`。关闭后节点不再显示名称。 |
| `labelZoomThreshold` | `number` | `0.6` | - | 常驻 label 显示阈值：`viewport.zoom` 低于此值时整体隐藏。设为 `0` 表示任何缩放都显示。 |
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
| `bottom-bar` | `props: FlowGraphBottomBarSlotProps` | 底部操作栏，默认渲染新建节点按钮、缩放控件与搜索入口 |

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
| `default` | `props: FlowBaseNodeSlotScope` | 节点主体内容，由子类按 size / nodeState 渲染形状 |

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

## 类型定义

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

```typescript
/** 面板位置类型 */
export type PanelPositionType =
  'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

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
  /** 放大，可传过渡时长；resolve 为是否发生了缩放 */
  zoomIn: ZoomInOut;
  /** 缩小，可传过渡时长；resolve 为是否发生了缩放 */
  zoomOut: ZoomInOut;
}

/** BaseNode 默认插槽的作用域，由子类节点据此渲染形状 */
export interface FlowBaseNodeSlotScope {
  /** 节点尺寸（px），取 `data.size`，缺省回退 `defaultSize` */
  size: number;
  /** 节点交互状态 */
  nodeState: NonNullable<NodeData['state']>;
  /** 点击反馈动画是否正在播放 */
  clicking: boolean;
  /** 节点左击处理：切换 active 状态并按配置弹出菜单 */
  onClick: (event: MouseEvent) => void;
}

/** FlowGraph `connect` 事件的载荷；sourceHandle/targetHandle 已规范化为 `string | null`（不含 undefined） */
export interface FlowConnection {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}
```
