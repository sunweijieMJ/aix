---
name: docs-generator
description: Use when the user asks to generate VitePress docs / API 文档 / 组件文档 for a Vue component. Extracts Props/Emits/Slots from source, builds API tables and example code for AIX 组件库.
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
  category: documentation
---

# 文档生成器 Skill

## 功能概述

从 Vue 组件自动提取 API 信息，生成 VitePress 文档，包括：
- Props API 表格
- Emits API 表格
- Slots API 表格
- 使用示例代码
- 类型定义文档

## 使用方式

```bash
# 方式 1: 为单个组件生成文档
/docs-generator packages/button

# 方式 2: 为整个包生成文档
/docs-generator packages/button --all

# 方式 3: 更新现有文档
/docs-generator packages/button --update

# 方式 4: 交互式模式
/docs-generator
```

### 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|-------|------|
| 包路径 | 组件包路径 | 必需 | `packages/button` |
| `--all` | 生成包内所有组件的文档 | `false` | `--all` |
| `--update` | 更新现有文档 | `false` | `--update` |

## 执行流程

### 步骤 1: 读取组件文件

使用 Read 工具读取组件文件，提取：
- Props 定义（名称、类型、默认值、说明）
- Emits 定义（事件名、参数类型、说明）
- Slots 定义（名称、说明）
- 组件说明（从 JSDoc 注释提取）

### 步骤 2: 生成 API 表格

#### Props 表格

```markdown
## Props

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | `'primary' \| 'default' \| 'danger'` | `'default'` | 按钮类型 |
| size | `'small' \| 'medium' \| 'large'` | `'medium'` | 按钮尺寸 |
| disabled | `boolean` | `false` | 是否禁用 |
```

#### Emits 表格

```markdown
## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击按钮时触发 |
| change | `(value: string)` | 值改变时触发 |
```

#### Slots 表格

```markdown
## Slots

| 名称 | 说明 |
|------|------|
| default | 按钮内容 |
| icon | 图标插槽 |
```

### 步骤 3: 生成示例代码

```markdown
## 基础用法

<script setup>
import { Button } from '@aix/button';
</script>

<template>
  <Button type="primary">Primary Button</Button>
  <Button type="default">Default Button</Button>
  <Button type="danger">Danger Button</Button>
</template>

## 尺寸

<script setup>
import { Button } from '@aix/button';
</script>

<template>
  <Button size="small">Small</Button>
  <Button size="medium">Medium</Button>
  <Button size="large">Large</Button>
</template>

## 禁用状态

<script setup>
import { Button } from '@aix/button';
</script>

<template>
  <Button disabled>Disabled Button</Button>
</template>
```

### 步骤 4: 生成类型定义文档

```markdown
## 类型定义

\`\`\`typescript
interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'danger';

  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';

  /** 是否禁用 */
  disabled?: boolean;
}

interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
}
\`\`\`
```

### 步骤 5: 创建或更新文档文件

文档文件路径：`docs/components/{component-name}.md`

完整的文档结构：

```markdown
# Button 按钮

按钮用于触发操作。

## 基础用法

基本的按钮用法。

<script setup>
import { Button } from '@aix/button';
</script>

<template>
  <Button>Default Button</Button>
</template>

## Props

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | `'primary' \| 'default' \| 'danger'` | `'default'` | 按钮类型 |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击时触发 |

## Slots

| 名称 | 说明 |
|------|------|
| default | 按钮内容 |

## 类型定义

\`\`\`typescript
interface ButtonProps {
  type?: 'primary' | 'default' | 'danger';
}
\`\`\`
```

### 步骤 6: 更新侧边栏配置

更新 `docs/.vitepress/config.ts` 的侧边栏配置：

```typescript
sidebar: {
  '/components/': [
    {
      text: '基础组件',
      items: [
        { text: 'Button 按钮', link: '/components/button' },
        { text: 'Select 选择器', link: '/components/select' },
        // 新增的组件
      ]
    }
  ]
}
```

### 步骤 7: 展示结果

```
✅ 文档生成成功！

📁 生成的文件:
   - docs/components/{component-name}.md

📊 包含的内容:
   ✓ 组件说明
   ✓ Props API 表格 (3 个)
   ✓ Events API 表格 (2 个)
   ✓ Slots API 表格 (1 个)
   ✓ 使用示例 (5 个)
   ✓ 类型定义

💡 下一步:
   1. 运行文档服务: pnpm docs:dev
   2. 查看文档: http://localhost:5173/components/{component-name}
   3. 完善示例和说明
```

## 文档生成策略

### 1. API 提取规则

- Props: 从 `interface Props` 提取
- Emits: 从 `interface Emits` 提取
- Slots: 从模板的 `<slot>` 标签提取
- 说明: 从 JSDoc 注释提取

### 2. 示例代码生成

根据 Props 自动生成示例：
- 基础用法（默认 Props）
- Props 变体（type, size 等）
- 状态示例（disabled, loading 等）
- 事件示例（@click 等）
- 插槽示例（#default, #icon 等）

### 3. 类型定义格式化

```typescript
// 简化类型定义，移除实现细节
interface Props {
  /** Props 说明 */
  propName?: PropType;
}
```

## 遵守的规范

### 1. 文档结构

```markdown
# 组件名 中文名

组件描述

## 基础用法

基础示例

## Props

Props 表格

## Events

Events 表格

## Slots

Slots 表格

## 类型定义

类型定义代码块
```

### 2. 表格格式

```markdown
| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| ... | ... | ... | ... |
```

### 3. 代码块格式

```markdown
<script setup>
import { Component } from '@aix/package';
</script>

<template>
  <Component />
</template>
```

## 示例

### 为 Button 组件生成文档

```bash
# 1. 生成文档
/docs-generator packages/button

# 2. 运行文档服务
pnpm docs:dev

# 3. 查看文档
# 访问 http://localhost:5173/components/button

# 4. 完善文档
# 编辑 docs/components/button.md
# 添加更多示例和说明
```

### 批量生成文档

```bash
# 为所有组件生成文档
/docs-generator packages/button --all
/docs-generator packages/select --all
/docs-generator packages/dropdown --all
```

## 相关文档

- [component-design.md](../agents/component-design.md) - 组件设计规范
- [storybook-development.md](../agents/storybook-development.md) - Storybook 开发
- [coding-standards.md](../agents/coding-standards.md) - 编码规范
