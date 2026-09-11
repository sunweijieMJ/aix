---
name: docs-generator
description: Use when the user asks to generate/update VitePress docs / API 文档 / 组件文档 for a component in the AIX 组件库. Drives the repo's real pipeline (pnpm docs:gen) and writes only the hand-authored prose sections — the API tables are machine-generated and must not be hand-written.
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "2.0.0"
  category: documentation
---

# 文档生成器 Skill

## 核心原则：API 表格不是手写的

本仓的组件 API 文档由**确定性管线**生成，`docs/components/<pkg>.md` 里的 `## API` 段是
**机器所有的区域**，每次运行都会被整段覆盖。它自己就带着横幅写明了这件事：

```
::: warning 自动生成的 API 文档
以下 API 文档由 `pnpm docs:gen` 从组件源码自动生成。请勿手动编辑此部分。
:::
```

> ❌ 不要用 Read + Write 手写 Props/Emits/Slots 表格。手写的表格会在下一次
> `pnpm docs:gen` 被无声抹掉，或者和生成结果并存成两份互相矛盾的 API 说明。
> 本 Skill 的上一版就是这么错的——它教人手写 `## Props` / `## Events` 顶层小节，
> 而真实结构是 `## API` → `### Props`。
>
> ✅ 改 JSDoc → 跑管线 → 只手写管线不管的散文部分。

---

## 管线是怎么跑的

```
组件源码的 JSDoc
      │  vue-docgen-api 解析（scripts/docs/gen-docs.ts）
      ▼
packages/<pkg>/README.md 的 ## API 段        ← 机器所有
      │  抽取 + 注入（scripts/docs/sync-docs.ts）
      ▼
docs/components/<pkg>.md 的 ## API 段        ← 机器所有
```

| 命令 | 做的事 |
|------|--------|
| `pnpm gen:docs` | vue-docgen 解析组件 → 覆写各包 `README.md` 的 `## API` 段 |
| `pnpm sync:docs` | 从各包 README 抽 `## API` 段 → 注入 `docs/components/<pkg>.md` |
| **`pnpm docs:gen`** | **= 上面两步，日常用这个** |
| `pnpm docs:dev` | 起 VitePress（`http://localhost:5173`） |

两个重要约束：

- **`gen:docs` 只处理 `packages/*/src/*.vue`**（包根下的主组件）。子组件
  （`src/components/*.vue`）不在解析范围内——它们的 Props 即使写了 JSDoc 也不会进 API 表格。
  这是为什么"对外暴露的组件 Props 必须放 `src/types.ts` 并被主组件引用"是硬要求。
- **`sync:docs` 缺文档会让命令失败**（退出码非 0），这是有意的。已登记豁免的包写在
  `sync-docs.ts` 的 `PACKAGES_WITHOUT_COMPONENT_DOC`：`hooks` / `theme` 不是组件，
  `ai-chat` / `audio` / `flow-graph` 是"文档待写"。新增组件包**要么补文档，要么显式加进这个集合**。

---

## 执行流程

### 步骤 1: 先判断该改哪里

| 用户想要的 | 该动的地方 |
|-----------|-----------|
| Props/Emits 的类型、默认值、说明不对或缺失 | **改组件源码的 JSDoc**，然后跑 `pnpm docs:gen` |
| 缺"何时使用"、代码演示、最佳实践 | 手写 `docs/components/<pkg>.md` 的**非 API 区域** |
| 新包第一次建文档页 | 按下方骨架新建，然后跑 `pnpm docs:gen` 填 API |

### 步骤 2: 改 JSDoc（API 内容的唯一来源）

API 表格的每一列都来自 JSDoc，`@default` 标签尤其关键——漏了默认值列就是空的：

```typescript
// packages/<pkg>/src/types.ts
export interface ButtonProps {
  /**
   * 按钮类型
   * @default 'default'
   */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';
}
```

细则见 `docs/guide/component-jsdoc.md`。

### 步骤 3: 手写散文部分

`docs/components/<pkg>.md` 的真实骨架（照 `docs/components/button.md`）：

````markdown
---
title: Button 按钮
outline: deep
---

<script setup>
import { Button } from '@aix/button'
</script>

# Button 按钮

按钮用于开始一个即时操作。

## 何时使用

<!-- 什么场景该用它、和相近组件的区别 -->

## 代码演示

### 按钮类型

按钮有五种类型：主按钮、次按钮、虚线按钮、文本按钮和链接按钮。

<div class="demo-block">
  <Button type="primary">Primary Button</Button>
  <Button>Default Button</Button>
</div>

```vue
<template>
  <Button type="primary">Primary Button</Button>
</template>
```

## API

<!-- ↑ 到此为止是手写区；## API 段由 pnpm docs:gen 覆写，不要手动填 -->
````

三条格式约定（都是从现有文档核出来的，别自创）：

1. **frontmatter 用 `title` + `outline: deep`**，不是裸 `# 标题`。
2. **活的演示用 `<div class="demo-block">` 包真实组件**，再跟一个 vue 代码块给人抄。
   VitePress 会把 markdown 里的组件真实渲染出来，所以顶部要 `<script setup>` 导入。
3. **一页里可以有多个 `<script setup>` 块**（`icons.md` 有 13 个），VitePress 会合并。
   不必为了"只能有一个"去重构。

### 步骤 4: 跑管线并检查

```bash
pnpm docs:gen      # 生成 + 同步，失败会明确告诉你哪个包缺文档
pnpm docs:dev      # http://localhost:5173/components/<pkg>
```

`pnpm docs:gen` 的退出码要看——`sync:docs` 会因为"包有 README 的 API 段但没有组件文档页"
而失败，这时补文档页或登记豁免，不要忽略。

### 步骤 5: 侧边栏

新增文档页要挂进 `docs/.vitepress/config.ts` 的 sidebar。先读现有配置照邻居的分组写，
不要凭空造分类。

---

## 常见错误

| 症状 | 原因 |
|------|------|
| API 表格是空的 / 没有默认值列 | JSDoc 缺 `@default`，或 Props 没写在被主组件引用的 `types.ts` 里 |
| 手写的 API 表格消失了 | 它在 `## API` 段内，被管线覆写了——这是预期行为 |
| 出现两个 API 段 | README 的标题不是**精确** `## API`（`gen-docs.ts` 用 `/^## API$/m` 严格匹配，不匹配时会在文件末尾追加一份） |
| `pnpm docs:gen` 报某个包缺文档 | 补 `docs/components/<pkg>.md`，或加进 `sync-docs.ts` 的 `PACKAGES_WITHOUT_COMPONENT_DOC` |
| 子组件的 Props 没进文档 | 正常：`gen:docs` 只解析 `packages/*/src/*.vue` |

---

## 相关文档

- `scripts/docs/gen-docs.ts` / `scripts/docs/sync-docs.ts` — 管线实现（本 Skill 的事实来源）
- `docs/guide/component-jsdoc.md` — JSDoc 注释规范
- `docs/components/button.md` — 文档页的参考实现
- [component-design.md](../../agents/component-design.md) — 组件设计规范
- [coding-standards.md](../../agents/coding-standards.md) — 编码规范
