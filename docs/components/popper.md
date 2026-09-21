---
title: Popper 弹出层
outline: deep
---

<script setup>
import { ref } from 'vue'
import { Tooltip, Popover, Dropdown, DropdownItem, ContextMenu } from '@aix/popper'

const dropdownOptions = [
  { command: 'edit', label: '编辑' },
  { command: 'duplicate', label: '创建副本' },
  { command: 'archive', label: '归档', disabled: true },
  { command: 'delete', label: '删除', divided: true },
]
const lastCommand = ref('')
const menuCommand = ref('')
const controlled = ref(false)
</script>

<style>
.popper-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}

.popper-demo > * + * {
  margin-left: 0;
}

.popper-demo__zone {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 240px;
  height: 120px;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 8px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}
</style>

# Popper 弹出层

基于 [Floating UI](https://floating-ui.com/) 的弹出层工具包：底层 `Popper` 负责定位、翻转、箭头与 Teleport，
上层封装出 **Tooltip**（文字提示）、**Popover**（气泡卡片）、**Dropdown**（下拉菜单）、**ContextMenu**（右键菜单）。

## 何时使用

按承载的内容和触发方式选组件，不要都用 Popover 硬凑：

| 要做的事 | 用 |
|---------|----|
| 悬停解释一个图标、一段截断文字 | `Tooltip` |
| 需要标题、正文、按钮的富内容卡片 | `Popover` |
| 一组命令，选完就关 | `Dropdown` |
| 右键唤出的命令菜单 | `ContextMenu` |
| 以上都不合适，要自己定义显示时机与内容 | `Popper` |

整页级的浮层（对话框、抽屉、全局通知）不归这里；侧边导航的层级菜单用
[Menu 菜单](/components/menu)，它的 flyout 子菜单已经内建了定位逻辑。

## 安装

```bash
pnpm add @aix/popper
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/popper/style';
import '@aix/theme/style';
```

组件自身只有一条文案：`ContextMenu` 浮层的 `aria-label`（上下文菜单 / Context menu），
需要改用 `createLocale(locale, { messages: { popper: { contextMenu: '…' } } })` 覆盖。

## 代码演示

### Tooltip 文字提示

hover 触发，`content` 给纯文本、`content` 插槽给富内容。`placement` 共 12 个方位。

<ClientOnly>
<div class="demo-block popper-demo">
  <Tooltip content="顶部提示"><button>top</button></Tooltip>
  <Tooltip content="右侧提示" placement="right"><button>right</button></Tooltip>
  <Tooltip content="底部提示" placement="bottom"><button>bottom</button></Tooltip>
  <Tooltip placement="left">
    <button>自定义内容</button>
    <template #content><strong>支持</strong> 任意节点</template>
  </Tooltip>
</div>
</ClientOnly>

```vue
<template>
  <Tooltip content="顶部提示">
    <button>top</button>
  </Tooltip>

  <Tooltip placement="left">
    <button>自定义内容</button>
    <template #content><strong>支持</strong> 任意节点</template>
  </Tooltip>
</template>

<script setup lang="ts">
import { Tooltip } from '@aix/popper';
</script>
```

### Popover 气泡卡片

触发元素放 `reference` 插槽，卡片内容放默认插槽。`trigger` 可选 click / hover / focus / manual，
`v-model:open` 做受控。

<ClientOnly>
<div class="demo-block popper-demo">
  <Popover title="删除确认" width="220">
    <template #reference><button>点击弹出</button></template>
    <div>删除后不可恢复，确定继续？</div>
  </Popover>
  <Popover title="悬停查看" trigger="hover" placement="right" width="220">
    <template #reference><button>悬停弹出</button></template>
    <div>trigger="hover" 时用 showDelay / hideDelay 控制延迟。</div>
  </Popover>
  <Popover v-model:open="controlled" trigger="manual" placement="bottom" width="200">
    <template #reference><button @click="controlled = !controlled">受控：{{ controlled ? '关闭' : '打开' }}</button></template>
    <div>manual 模式下只由 v-model:open 决定显隐。</div>
  </Popover>
</div>
</ClientOnly>

```vue
<template>
  <Popover title="删除确认" width="220">
    <template #reference><button>点击弹出</button></template>
    <div>删除后不可恢复，确定继续？</div>
  </Popover>

  <Popover v-model:open="open" trigger="manual">
    <template #reference><button @click="open = !open">受控</button></template>
    <div>只由 v-model:open 决定显隐。</div>
  </Popover>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Popover } from '@aix/popper';

const open = ref(false);
</script>
```

### Dropdown 下拉菜单

`options` 数据驱动与 `dropdown` 插槽两种写法二选一，点击菜单项抛 `command` 事件。
`divided` 在项前加分割线，`disabled` 置灰且不可点。

<ClientOnly>
<div class="demo-block popper-demo">
  <Dropdown :options="dropdownOptions" @command="lastCommand = $event">
    <template #reference><button>数据驱动</button></template>
  </Dropdown>
  <Dropdown trigger="hover" placement="bottom-end" @command="lastCommand = $event">
    <template #reference><button>插槽写法（hover）</button></template>
    <template #dropdown>
      <DropdownItem command="rename">重命名</DropdownItem>
      <DropdownItem command="move">移动到…</DropdownItem>
      <DropdownItem command="remove" divided>删除</DropdownItem>
    </template>
  </Dropdown>
  <span style="font-size: 13px; color: var(--vp-c-text-2);">最近命令：{{ lastCommand || '（无）' }}</span>
</div>
</ClientOnly>

```vue
<template>
  <Dropdown :options="options" @command="onCommand">
    <template #reference><button>数据驱动</button></template>
  </Dropdown>

  <Dropdown trigger="hover" @command="onCommand">
    <template #reference><button>插槽写法</button></template>
    <template #dropdown>
      <DropdownItem command="rename">重命名</DropdownItem>
      <DropdownItem command="remove" divided>删除</DropdownItem>
    </template>
  </Dropdown>
</template>

<script setup lang="ts">
import { Dropdown, DropdownItem } from '@aix/popper';
import type { DropdownMenuItem } from '@aix/popper';

const options: DropdownMenuItem[] = [
  { command: 'edit', label: '编辑' },
  { command: 'delete', label: '删除', divided: true },
];

function onCommand(command: string | number) {
  console.log(command);
}
</script>
```

### ContextMenu 右键菜单

默认在 `default` 插槽的区域内监听右键，按鼠标坐标弹出。`trigger="manual"` 时改由实例的
`show(eventOrElement)` 触发：传 `MouseEvent` 按坐标固定，传 `HTMLElement` 则跟随元素位移。

<ClientOnly>
<div class="demo-block popper-demo">
  <ContextMenu @command="menuCommand = $event">
    <div class="popper-demo__zone">在这块区域内点右键</div>
    <template #menu>
      <DropdownItem command="open">打开</DropdownItem>
      <DropdownItem command="rename">重命名</DropdownItem>
      <DropdownItem command="delete" divided>删除</DropdownItem>
    </template>
  </ContextMenu>
  <span style="font-size: 13px; color: var(--vp-c-text-2);">最近命令：{{ menuCommand || '（无）' }}</span>
</div>
</ClientOnly>

```vue
<template>
  <ContextMenu @command="onCommand">
    <div class="canvas">在这块区域内点右键</div>
    <template #menu>
      <DropdownItem command="open">打开</DropdownItem>
      <DropdownItem command="delete" divided>删除</DropdownItem>
    </template>
  </ContextMenu>
</template>

<script setup lang="ts">
import { ContextMenu, DropdownItem } from '@aix/popper';
</script>
```

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

**Popper** — 浮层定位底层组件：基于 Floating UI 做定位、翻转与平移，本包其余组件都由它构建。

### Popper Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `placement` | `Placement` | `'bottom'` | - | 浮动元素相对于参考元素的位置，取 `'top' \| 'right' \| 'bottom' \| 'left'` 及其 `-start` / `-end` 变体，共 12 个方位（Floating UI 的 Placement） |
| `strategy` | `Strategy` | `'absolute'` | - | CSS 定位策略 |
| `offset` | `number` | `8` | - | 参考元素与浮动元素之间的距离 (px) |
| `arrow` | `boolean` | `false` | - | 是否显示箭头 |
| `arrowSize` | `number` | `8` | - | 箭头大小 (px) |
| `flip` | `boolean` | `true` | - | 是否启用翻转 (空间不足时自动翻转到对面) |
| `shift` | `boolean` | `true` | - | 是否启用平移 (溢出边界时自动平移) |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |
| `transition` | `string` | `'aix-popper-fade'` | - | 过渡动画名称 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `open` | `boolean` | - | - | 受控的显示状态 (v-model:open) |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |
| `popperStyle` | `string \| Record<string, string>` | - | - | 浮动元素的自定义 style |
| `zIndex` | `number` | - | - | 自定义 z-index |
| `middleware` | `Middleware[]` | - | - | 额外的 Floating UI middleware（追加到内置的 offset/flip/shift/arrow 之后） |

### Popper Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `value: boolean` | 显示状态变更 |
| `show` | - | 显示后触发 |
| `hide` | - | 隐藏后触发 |
| `before-show` | - | 显示前触发 |
| `before-hide` | - | 隐藏前触发 |

### Popper Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `reference` | - | 参考元素（触发元素） |
| `default` | - | 浮动内容 |

### Popper Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示浮动元素 |
| `hide` | `() => void` | 隐藏浮动元素 |
| `update` | `() => void` | 手动更新位置 |
| `referenceRef` | `Ref<HTMLElement \| null>` | 参考元素引用（用于手动绑定触发元素） |

---

**PopperArrow** — 浮层箭头：位置由 Popper 按定位结果算好传入，不单独使用。

### PopperArrow Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `style` | `CSSProperties` | - | - | 箭头定位样式，由 Popper 按浮层位置计算后传入 |

---

**Tooltip** — 文字提示：悬停触发的轻量提示气泡。

### Tooltip Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `content` | `string` | - | - | 提示内容 |
| `placement` | `Placement` | `'top'` | - | 弹出位置，取 `'top' \| 'right' \| 'bottom' \| 'left'` 及其 `-start` / `-end` 变体，共 12 个方位（Floating UI 的 Placement） |
| `showDelay` | `number` | `100` | - | 显示延迟 (ms) |
| `hideDelay` | `number` | `100` | - | 隐藏延迟 (ms) |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `open` | `boolean` | - | - | 受控的显示状态 (v-model:open) |
| `arrowSize` | `number` | `6` | - | 箭头大小 (px) |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |
| `transition` | `string` | `'aix-popper-fade'` | - | 过渡动画名称 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |

### Tooltip Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `value: boolean` | 显示状态变更 |
| `show` | - | 显示后触发 |
| `hide` | - | 隐藏后触发 |

### Tooltip Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | - | 触发元素 |
| `content` | - | 自定义提示内容（优先于 content prop） |

### Tooltip Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示 |
| `hide` | `() => void` | 隐藏 |

---

**Popover** — 气泡卡片：点击或悬停触发，相比 Tooltip 可承载标题与富内容。

### Popover Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `title` | `string` | - | - | 标题 |
| `trigger` | `Extract<TriggerType, 'click' \| 'hover' \| 'focus' \| 'manual'>` | `'click'` | - | 触发方式 |
| `placement` | `Placement` | `'top'` | - | 弹出位置，取 `'top' \| 'right' \| 'bottom' \| 'left'` 及其 `-start` / `-end` 变体，共 12 个方位（Floating UI 的 Placement） |
| `width` | `number \| string` | - | - | 弹出层宽度 |
| `arrow` | `boolean` | `true` | - | 是否显示箭头 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `open` | `boolean` | - | - | 受控的显示状态 (v-model:open) |
| `offset` | `number` | `12` | - | 偏移距离 (px) |
| `transition` | `string` | `'aix-popper-fade'` | - | 过渡动画名称 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |
| `showDelay` | `number` | `100` | - | 显示延迟 (ms，hover 模式生效) |
| `hideDelay` | `number` | `100` | - | 隐藏延迟 (ms，hover 模式生效) |

### Popover Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `value: boolean` | 显示状态变更 |
| `show` | - | 显示后触发 |
| `hide` | - | 隐藏后触发 |

### Popover Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `reference` | - | 参考元素（触发元素） |
| `title` | - | 自定义标题（优先于 title prop） |
| `default` | - | 弹出内容 |

### Popover Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示 |
| `hide` | `() => void` | 隐藏 |

---

**Dropdown** — 下拉菜单：options 数据驱动与 DropdownItem 插槽自定义二选一。

### Dropdown Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `trigger` | `Extract<TriggerType, 'click' \| 'hover'>` | `'click'` | - | 触发方式 |
| `placement` | `Placement` | `'bottom-start'` | - | 弹出位置，取 `'top' \| 'right' \| 'bottom' \| 'left'` 及其 `-start` / `-end` 变体，共 12 个方位（Floating UI 的 Placement） |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `open` | `boolean` | - | - | 受控的显示状态 (v-model:open) |
| `hideOnClick` | `boolean` | `true` | - | 选择后是否自动关闭 |
| `showDelay` | `number` | `150` | - | 显示延迟 (ms，hover 模式) |
| `hideDelay` | `number` | `150` | - | 隐藏延迟 (ms，hover 模式) |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |
| `options` | `DropdownMenuItem[]` | - | - | 菜单项数据 (也可用 slot) |

### Dropdown Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `value: boolean` | 受控模式状态变更 |
| `command` | `command: string \| number` | 菜单项点击时触发 |
| `visible-change` | `visible: boolean` | 显示状态变更时触发 |

### Dropdown Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `reference` | - | 触发元素 |
| `dropdown` | - | 自定义下拉菜单内容（使用 DropdownItem） |

### Dropdown Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示 |
| `hide` | `() => void` | 隐藏 |

---

**DropdownItem** — 下拉菜单项：点击抛出 command，可禁用，可在自身上方加一条分割线。

### DropdownItem Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `command` | `string \| number` | - | - | 命令标识 |
| `label` | `string` | - | - | 显示文本 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `divided` | `boolean` | `false` | - | 是否在此项前显示分割线 |

### DropdownItem Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `click` | `command: string \| number \| undefined` | 菜单项被点击时触发，载荷为 command；一般用 Dropdown 的 command 事件统一处理，需要单项自己响应时用它 |

### DropdownItem Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | - | 自定义菜单项内容（优先于 label prop） |

---

**ContextMenu** — 右键菜单：默认监听右键在鼠标位置弹出，也可由 show(target) 手动唤起。

### ContextMenu Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `trigger` | `Extract<TriggerType, 'contextmenu' \| 'manual'>` | `'contextmenu'` | - | 触发方式<br>- `'contextmenu'`（默认）：右键弹出，由组件自动监听<br>- `'manual'`：不绑定任何事件，仅通过 expose 的 `show(eventOrEl)` 弹出。<br>- 传 `MouseEvent` 时按鼠标坐标定位（虚拟元素，位置固定，常用于右键菜单）；<br>- 传 `HTMLElement` 时以元素为锚，floating-ui 的 autoUpdate 会持续跟随元素位移 （适合「点击节点弹菜单」且后续节点可能被滚动/平移到其他位置的场景）。 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |

### ContextMenu Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `command` | `command: string \| number` | 菜单项点击时触发 |
| `visible-change` | `visible: boolean` | 显示状态变更时触发 |

### ContextMenu Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | - | 触发区域，trigger 为 contextmenu 时在其内右键弹出菜单 |
| `menu` | - | 菜单内容（使用 DropdownItem） |

### ContextMenu Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `(target: MouseEvent \| HTMLElement) => void` | 弹出菜单：<br>- 传 `MouseEvent`：按 `clientX/clientY` 定位（虚拟元素，位置固定）。<br>- 传 `HTMLElement`：以该元素为锚定参考，菜单会跟随其位移（autoUpdate）。 |
| `hide` | `() => void` | 隐藏菜单 |

## 类型定义

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

```typescript
/** 触发器类型 */
export type TriggerType = 'hover' | 'click' | 'focus' | 'contextmenu' | 'manual';

/** Dropdown `items` 里的一项，点击后以 `command` 触发 `command` 事件 */
export interface DropdownMenuItem {
  /** 命令标识 */
  command: string | number;
  /** 显示文本 */
  label: string;
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;
  /**
   * 是否在此项前显示分割线
   * @default false
   */
  divided?: boolean;
}

/** Dropdown 通过 `DROPDOWN_INJECTION_KEY` 注入给 DropdownItem 的上下文 */
export interface DropdownContext {
  /** DropdownItem 被点击时回调，带上该项的 `command` */
  handleItemClick: (command?: string | number) => void;
}
```

## 组件列表

| 组件 | 说明 | 导入方式 |
|------|------|---------|
| `Popper` | 底层定位组件，上层组件都基于它构建；仅在需要完全自定义行为时直接用它 | `import { Popper } from '@aix/popper'` |
| `Tooltip` | 鼠标悬停时显示的简单文字提示 | `import { Tooltip } from '@aix/popper'` |
| `Popover` | 点击或悬停触发的富内容气泡卡片，比 Tooltip 能承载更多内容 | `import { Popover } from '@aix/popper'` |
| `Dropdown` | 点击或悬停触发的下拉菜单，`options` 数据驱动与 `DropdownItem` 插槽二选一 | `import { Dropdown } from '@aix/popper'` |
| `DropdownItem` | 配合 `Dropdown` 使用的菜单项 | `import { DropdownItem } from '@aix/popper'` |
| `ContextMenu` | 监听右键点击，在鼠标位置弹出菜单 | `import { ContextMenu } from '@aix/popper'` |

各组件的 Props / Events / Slots / Expose 见下方 [API](#api)。

---

## DropdownMenuItem 数据结构

`Dropdown` 的 `options` 项：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `command` | `string \| number` | - | 命令标识（必填） |
| `label` | `string` | - | 显示文本（必填） |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `divided` | `boolean` | `false` | 是否在此项前显示分割线 |
