# @aix/popper

基于 Floating UI 的 Vue 3 浮动定位组件集，包含 Popper、Tooltip、Popover、Dropdown、ContextMenu 五类组件。

## 特性

- 🎯 **精准定位**：基于 Floating UI，自动翻转和偏移，始终保持最佳位置
- 📦 **五类组件**：Popper（底层）、Tooltip（提示）、Popover（气泡卡片）、Dropdown（下拉菜单）、ContextMenu（右键菜单）
- 🔄 **多种触发方式**：hover、click、focus、contextmenu、manual
- 🎨 **过渡动画**：内置淡入淡出动画，支持自定义过渡
- 📌 **箭头支持**：可配置箭头大小和显示
- 🚀 **Teleport**：默认传送到 body，避免溢出裁剪
- ⌨️ **键盘导航**：Dropdown 支持上下箭头和 Enter 键操作
- 🎯 **TypeScript**：完整的类型定义，提供最佳开发体验

## 安装

```bash
pnpm add @aix/popper
# 或
npm install @aix/popper
# 或
yarn add @aix/popper
```

## 使用

### Tooltip 提示

```vue
<template>
  <Tooltip content="这是提示文字">
    <button>悬停查看提示</button>
  </Tooltip>
</template>

<script setup lang="ts">
import { Tooltip } from '@aix/popper';
</script>
```

### Popover 气泡卡片

```vue
<template>
  <Popover title="标题" trigger="click" placement="bottom">
    <template #reference>
      <button>点击弹出</button>
    </template>
    <p>这是气泡卡片的内容。</p>
  </Popover>
</template>

<script setup lang="ts">
import { Popover } from '@aix/popper';
</script>
```

### Dropdown 下拉菜单

```vue
<template>
  <Dropdown :options="menuItems" @command="handleCommand">
    <button>下拉菜单 ▼</button>
  </Dropdown>
</template>

<script setup lang="ts">
import { Dropdown, type DropdownMenuItem } from '@aix/popper';

const menuItems: DropdownMenuItem[] = [
  { command: 'edit', label: '编辑' },
  { command: 'delete', label: '删除', divided: true },
];

const handleCommand = (command: string | number) => {
  console.log('选择了:', command);
};
</script>
```

### Dropdown 自定义菜单项

```vue
<template>
  <Dropdown @command="handleCommand">
    <button>操作 ▼</button>
    <template #dropdown>
      <DropdownItem command="copy" label="复制" />
      <DropdownItem command="paste" label="粘贴" />
      <DropdownItem command="delete" label="删除" divided />
    </template>
  </Dropdown>
</template>

<script setup lang="ts">
import { Dropdown, DropdownItem } from '@aix/popper';

const handleCommand = (command: string | number) => {
  console.log('选择了:', command);
};
</script>
```

### ContextMenu 右键菜单

```vue
<template>
  <ContextMenu ref="menuRef" @command="handleCommand">
    <DropdownItem command="copy" label="复制" />
    <DropdownItem command="paste" label="粘贴" />
  </ContextMenu>

  <div @contextmenu.prevent="(e) => menuRef?.show(e)">
    右键点击此区域
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ContextMenu, DropdownItem, type ContextMenuExpose } from '@aix/popper';

const menuRef = ref<ContextMenuExpose>();

const handleCommand = (command: string | number) => {
  console.log('选择了:', command);
};
</script>
```

### Popper 底层组件

```vue
<template>
  <Popper placement="bottom" :offset="8" arrow>
    <template #reference>
      <button>参考元素</button>
    </template>
    <div>浮动内容</div>
  </Popper>
</template>

<script setup lang="ts">
import { Popper } from '@aix/popper';
</script>
```

## API

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

## 类型定义

```typescript
/** 触发器类型 */
export type TriggerType = 'hover' | 'click' | 'focus' | 'contextmenu' | 'manual';

/** 下拉菜单项 */
export interface DropdownMenuItem {
  command: string | number;
  label: string;
  disabled?: boolean;
  divided?: boolean;
}
```
