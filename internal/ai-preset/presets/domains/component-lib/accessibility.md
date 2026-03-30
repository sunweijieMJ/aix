---
id: component-lib/accessibility
title: 无障碍规范
description: ARIA 属性、键盘导航、焦点管理
layer: domain
priority: 210
platforms: []
tags: [a11y, accessibility, agent]
version: "1.0.0"
---

## 职责

负责组件库的无障碍（A11y）合规指导。

---

## ARIA 属性规范

### 必须的 ARIA 属性

| 组件类型 | 必须属性 | 说明 |
|---------|---------|------|
| 按钮 | `role="button"` (非 button 元素时) | 语义化 |
| 对话框 | `role="dialog"`, `aria-modal="true"` | 模态状态 |
| 选项卡 | `role="tablist"`, `role="tab"`, `role="tabpanel"` | 选项卡语义 |
| 表单控件 | `aria-label` 或 `aria-labelledby` | 无可见标签时 |
| 加载状态 | `aria-busy="true"` | 异步操作中 |
| 展开/收起 | `aria-expanded` | 当前展开状态 |

### 示例

```vue
<template>
  <!-- ✅ 正确: 完整的 ARIA 属性 -->
  <button
    :aria-disabled="disabled"
    :aria-busy="loading"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <slot />
  </button>
</template>
```

## 键盘导航

### 必须支持的键盘操作

| 按键 | 行为 |
|------|------|
| `Tab` | 在可聚焦元素间移动 |
| `Enter` / `Space` | 激活按钮/链接 |
| `Escape` | 关闭对话框/弹出层 |
| `Arrow Keys` | 在选项卡/列表/菜单中移动 |
| `Home` / `End` | 跳到首/末项 |

### 焦点管理

```typescript
// 打开对话框时将焦点移入
function openDialog() {
  dialogVisible.value = true;
  nextTick(() => {
    dialogRef.value?.querySelector<HTMLElement>('[autofocus], button')?.focus();
  });
}

// 关闭时将焦点返回触发元素
function closeDialog() {
  dialogVisible.value = false;
  triggerRef.value?.focus();
}
```

## 焦点陷阱

对话框等模态组件必须实现焦点陷阱，防止 Tab 键跳出模态区域。
