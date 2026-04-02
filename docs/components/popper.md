---
title: Popper 弹出层
outline: deep
---

# Popper 弹出层

基于 [Floating UI](https://floating-ui.com/) 的弹出层工具包，提供一系列弹出层组件，包括 **Tooltip**（文字提示）、**Popover**（气泡卡片）、**Dropdown**（下拉菜单）和 **ContextMenu**（右键菜单）。

## 特性

- 底层 Popper 组件提供位置计算、翻转/平移、箭头、Teleport 等完整能力
- Tooltip：轻量文字提示，hover 触发
- Popover：富内容气泡卡片，支持 click / hover / focus / manual 四种触发方式
- Dropdown：下拉菜单，支持数据驱动和插槽两种用法
- ContextMenu：右键菜单，跟随鼠标位置弹出
- 支持 `v-model:open` 受控模式
- 统一的过渡动画和主题变量

## 组件列表

| 组件 | 说明 | 导入方式 |
|------|------|---------|
| `Popper` | 底层定位组件 | `import { Popper } from '@aix/popper'` |
| `Tooltip` | 文字提示 | `import { Tooltip } from '@aix/popper'` |
| `Popover` | 气泡卡片 | `import { Popover } from '@aix/popper'` |
| `Dropdown` | 下拉菜单 | `import { Dropdown } from '@aix/popper'` |
| `DropdownItem` | 下拉菜单项 | `import { DropdownItem } from '@aix/popper'` |
| `ContextMenu` | 右键菜单 | `import { ContextMenu } from '@aix/popper'` |

---

## Popper 底层组件

所有上层组件（Tooltip / Popover / Dropdown / ContextMenu）均基于 Popper 构建。通常情况下直接使用上层组件即可，仅在需要完全自定义行为时使用 Popper。

### Popper Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `placement` | `Placement` | `'bottom'` | 浮动元素相对于参考元素的位置 |
| `strategy` | `Strategy` | `'absolute'` | CSS 定位策略 |
| `offset` | `number` | `8` | 参考元素与浮动元素之间的距离（px） |
| `arrow` | `boolean` | `false` | 是否显示箭头 |
| `arrowSize` | `number` | `8` | 箭头大小（px） |
| `flip` | `boolean` | `true` | 是否启用翻转（空间不足时自动翻转到对面） |
| `shift` | `boolean` | `true` | 是否启用平移（溢出边界时自动平移） |
| `teleportTo` | `string \| HTMLElement` | `'body'` | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | 是否禁用 Teleport |
| `transition` | `string` | `'aix-popper-fade'` | 过渡动画名称 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `open` | `boolean` | — | 受控的显示状态（`v-model:open`） |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | — | 浮动元素的自定义 class |
| `popperStyle` | `string \| Record<string, string>` | — | 浮动元素的自定义 style |
| `zIndex` | `number` | — | 自定义 z-index |
| `middleware` | `Middleware[]` | — | 额外的 Floating UI middleware |

### Popper Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `(value: boolean)` | 显示状态变更 |
| `show` | — | 显示后触发 |
| `hide` | — | 隐藏后触发 |
| `before-show` | — | 显示前触发 |
| `before-hide` | — | 隐藏前触发 |

### Popper Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示浮动元素 |
| `hide` | `() => void` | 隐藏浮动元素 |
| `update` | `() => void` | 手动更新位置 |
| `referenceRef` | `Ref<HTMLElement \| null>` | 参考元素引用 |

---

## Tooltip 文字提示

鼠标悬停时显示的简单文字提示。

### Tooltip Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `content` | `string` | — | 提示内容 |
| `placement` | `Placement` | `'top'` | 弹出位置 |
| `showDelay` | `number` | `100` | 显示延迟（ms） |
| `hideDelay` | `number` | `100` | 隐藏延迟（ms） |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `open` | `boolean` | — | 受控的显示状态（`v-model:open`） |
| `arrowSize` | `number` | `6` | 箭头大小（px） |
| `transition` | `string` | `'aix-popper-fade'` | 过渡动画名称 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | 是否禁用 Teleport |

### Tooltip Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `(value: boolean)` | 显示状态变更 |
| `show` | — | 显示后触发 |
| `hide` | — | 隐藏后触发 |

### Tooltip Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示提示 |
| `hide` | `() => void` | 隐藏提示 |

---

## Popover 气泡卡片

点击或悬停触发的富内容气泡卡片，相比 Tooltip 可承载更多内容。

### Popover Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `title` | `string` | — | 标题 |
| `trigger` | `'click' \| 'hover' \| 'focus' \| 'manual'` | `'click'` | 触发方式 |
| `placement` | `Placement` | `'top'` | 弹出位置 |
| `width` | `number \| string` | — | 弹出层宽度 |
| `arrow` | `boolean` | `true` | 是否显示箭头 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `open` | `boolean` | — | 受控的显示状态（`v-model:open`） |
| `offset` | `number` | `12` | 偏移距离（px） |
| `transition` | `string` | `'aix-popper-fade'` | 过渡动画名称 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | 是否禁用 Teleport |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | — | 浮动元素的自定义 class |
| `showDelay` | `number` | `100` | 显示延迟（ms，hover 模式生效） |
| `hideDelay` | `number` | `100` | 隐藏延迟（ms，hover 模式生效） |

### Popover Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `(value: boolean)` | 显示状态变更 |
| `show` | — | 显示后触发 |
| `hide` | — | 隐藏后触发 |

### Popover Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示气泡卡片 |
| `hide` | `() => void` | 隐藏气泡卡片 |

---

## Dropdown 下拉菜单

点击或悬停触发的下拉菜单，支持通过 `options` 数据驱动或 `DropdownItem` 插槽自定义。

### Dropdown Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `trigger` | `'click' \| 'hover'` | `'click'` | 触发方式 |
| `placement` | `Placement` | `'bottom-start'` | 弹出位置 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `open` | `boolean` | — | 受控的显示状态（`v-model:open`） |
| `hideOnClick` | `boolean` | `true` | 选择后是否自动关闭 |
| `showDelay` | `number` | `150` | 显示延迟（ms，hover 模式） |
| `hideDelay` | `number` | `150` | 隐藏延迟（ms，hover 模式） |
| `teleportTo` | `string \| HTMLElement` | `'body'` | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | 是否禁用 Teleport |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | — | 浮动元素的自定义 class |
| `options` | `DropdownMenuItem[]` | — | 菜单项数据（也可用插槽） |

### DropdownMenuItem 数据结构

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `command` | `string \| number` | — | 命令标识（必填） |
| `label` | `string` | — | 显示文本（必填） |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `divided` | `boolean` | `false` | 是否在此项前显示分割线 |

### Dropdown Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `(value: boolean)` | 受控模式状态变更 |
| `command` | `(command: string \| number)` | 菜单项点击时触发 |
| `visible-change` | `(visible: boolean)` | 显示状态变更时触发 |

### Dropdown Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示下拉菜单 |
| `hide` | `() => void` | 隐藏下拉菜单 |

---

## DropdownItem 下拉菜单项

配合 `Dropdown` 使用的菜单项组件，通过插槽方式自定义菜单内容。

### DropdownItem Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `command` | `string \| number` | — | 命令标识 |
| `label` | `string` | — | 显示文本 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `divided` | `boolean` | `false` | 是否在此项前显示分割线 |

### DropdownItem Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `click` | `(command: string \| number \| undefined)` | 点击菜单项时触发 |

---

## ContextMenu 右键菜单

监听右键点击事件，在鼠标位置弹出菜单。

### ContextMenu Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `disabled` | `boolean` | `false` | 是否禁用 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | 是否禁用 Teleport |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | — | 浮动元素的自定义 class |

### ContextMenu Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `command` | `(command: string \| number)` | 菜单项点击时触发 |
| `visible-change` | `(visible: boolean)` | 显示状态变更时触发 |

### ContextMenu Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `show` | `(event: MouseEvent) => void` | 在鼠标位置显示菜单 |
| `hide` | `() => void` | 隐藏菜单 |

## API

::: warning 自动生成的 API 文档
以下 API 文档由 `pnpm docs:gen` 从组件源码自动生成。请勿手动编辑此部分。

如需更新 API 文档，请：
1. 修改组件源码中的 JSDoc 注释
2. 运行 `pnpm docs:gen` 生成到 README.md
3. 运行 `pnpm docs:sync` 同步到此文档
:::

### Popper Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `placement` | `Placement` | `'bottom'` | - | 浮动元素相对于参考元素的位置 |
| `strategy` | `'absolute' \| 'fixed'` | `'absolute'` | - | CSS 定位策略 |
| `offset` | `number` | `8` | - | 参考元素与浮动元素之间的距离（px） |
| `arrow` | `boolean` | `false` | - | 是否显示箭头 |
| `arrowSize` | `number` | `8` | - | 箭头大小（px） |
| `flip` | `boolean` | `true` | - | 空间不足时是否自动翻转 |
| `shift` | `boolean` | `true` | - | 溢出边界时是否自动平移 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |
| `transition` | `string` | `'aix-popper-fade'` | - | 过渡动画名称 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `open` | `boolean` | - | - | 受控的显示状态（v-model:open） |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |
| `popperStyle` | `string \| Record<string, string>` | - | - | 浮动元素的自定义 style |
| `zIndex` | `number` | - | - | 自定义 z-index |
| `middleware` | `Middleware[]` | - | - | 额外的 Floating UI middleware |

### Popper Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `boolean` | 显示状态变更 |
| `show` | - | 显示后触发 |
| `hide` | - | 隐藏后触发 |
| `before-show` | - | 显示前触发 |
| `before-hide` | - | 隐藏前触发 |

### Popper Expose

| 方法 | 类型 | 说明 |
|------|------|------|
| `show` | `() => void` | 显示浮动元素 |
| `hide` | `() => void` | 隐藏浮动元素 |
| `update` | `() => void` | 手动更新位置 |
| `referenceRef` | `Ref<HTMLElement \| null>` | 参考元素引用 |

### Popper Slots

| 插槽名 | 说明 |
|--------|------|
| `reference` | 参考元素（触发元素） |
| `default` | 浮动内容 |

---

### Tooltip Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `content` | `string` | - | - | 提示内容 |
| `placement` | `Placement` | `'top'` | - | 弹出位置 |
| `showDelay` | `number` | `100` | - | 显示延迟（ms） |
| `hideDelay` | `number` | `100` | - | 隐藏延迟（ms） |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `open` | `boolean` | - | - | 受控的显示状态（v-model:open） |
| `arrowSize` | `number` | `6` | - | 箭头大小（px） |
| `transition` | `string` | `'aix-popper-fade'` | - | 过渡动画名称 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |

### Tooltip Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `boolean` | 显示状态变更 |
| `show` | - | 显示后触发 |
| `hide` | - | 隐藏后触发 |

### Tooltip Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | 触发元素 |
| `content` | 自定义提示内容（优先于 content prop） |

---

### Popover Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `title` | `string` | - | - | 标题 |
| `trigger` | `'click' \| 'hover' \| 'focus' \| 'manual'` | `'click'` | - | 触发方式 |
| `placement` | `Placement` | `'top'` | - | 弹出位置 |
| `width` | `number \| string` | - | - | 弹出层宽度 |
| `arrow` | `boolean` | `true` | - | 是否显示箭头 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `open` | `boolean` | - | - | 受控的显示状态（v-model:open） |
| `offset` | `number` | `12` | - | 偏移距离（px） |
| `transition` | `string` | `'aix-popper-fade'` | - | 过渡动画名称 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |
| `showDelay` | `number` | `100` | - | 显示延迟（ms，hover 模式生效） |
| `hideDelay` | `number` | `100` | - | 隐藏延迟（ms，hover 模式生效） |

### Popover Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `boolean` | 显示状态变更 |
| `show` | - | 显示后触发 |
| `hide` | - | 隐藏后触发 |

### Popover Slots

| 插槽名 | 说明 |
|--------|------|
| `reference` | 参考元素（触发元素） |
| `default` | 弹出内容 |

---

### Dropdown Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `trigger` | `'click' \| 'hover'` | `'click'` | - | 触发方式 |
| `placement` | `Placement` | `'bottom-start'` | - | 弹出位置 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `open` | `boolean` | - | - | 受控的显示状态（v-model:open） |
| `hideOnClick` | `boolean` | `true` | - | 选择后是否自动关闭 |
| `showDelay` | `number` | `150` | - | 显示延迟（ms，hover 模式） |
| `hideDelay` | `number` | `150` | - | 隐藏延迟（ms，hover 模式） |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |
| `options` | `DropdownMenuItem[]` | - | - | 菜单项数据（也可用 slot） |

### Dropdown Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:open` | `boolean` | 受控模式状态变更 |
| `command` | `string \| number` | 菜单项点击时触发 |
| `visible-change` | `boolean` | 显示状态变更时触发 |

### Dropdown Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | 触发元素 |
| `dropdown` | 自定义下拉菜单内容（使用 DropdownItem） |

---

### DropdownItem Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `command` | `string \| number` | - | - | 命令标识 |
| `label` | `string` | - | - | 显示文本 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `divided` | `boolean` | `false` | - | 是否在此项前显示分割线 |

### DropdownItem Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | 自定义菜单项内容（优先于 label prop） |

---

### ContextMenu Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `teleportTo` | `string \| HTMLElement` | `'body'` | - | Teleport 目标 |
| `teleportDisabled` | `boolean` | `false` | - | 是否禁用 Teleport |
| `popperClass` | `string \| string[] \| Record<string, boolean>` | - | - | 浮动元素的自定义 class |

### ContextMenu Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `command` | `string \| number` | 菜单项点击时触发 |
| `visible-change` | `boolean` | 显示状态变更时触发 |

### ContextMenu Expose

| 方法 | 类型 | 说明 |
|------|------|------|
| `show` | `(event: MouseEvent) => void` | 在鼠标事件位置显示菜单 |
| `hide` | `() => void` | 隐藏菜单 |

### ContextMenu Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | 菜单内容（使用 DropdownItem） |
