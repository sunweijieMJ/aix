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
组件源码（types.ts + .vue 的类型声明与 JSDoc）
      │  vue-docgen-api + TypeScript AST（scripts/docs/extract-api.ts），结果只在内存里
      ├─ 渲染 → packages/<pkg>/README.md 的 ## API 段        ← 机器所有
      ├─ 渲染 → docs/components/<pkg>.md 的 ## API 段        ← 机器所有
      ├─ 两处已有 ## 类型定义 段的，由 src/types.ts 的导出重写   ← 机器所有
      ├─ 校验 docs/components/*.md、sidebar、组件总览三处登记一致
      └─ MCP Server extract 调用 scripts/docs/print-api.ts 拿同一份结果
```

| 命令 | 做的事 |
|------|--------|
| **`pnpm docs:gen`** | **解析组件 → 覆写各包 README 与文档页的 `## API` / `## 类型定义` 段 → 校验站点登记 → 刷新 MCP 数据，日常用这个** |
| `pnpm docs:check` | CI 同款：跑完 `docs:gen` 要求 README / 文档页零 diff |
| `pnpm docs:dev` | 起 VitePress（`http://localhost:5173`） |

几个重要约束：

- **参与生成的组件 = `src/index.ts` 导出的 .vue 组件**，不需要配置。内部子组件不导出就不进表；
  多组件包的表格以组件名为前缀（`### MenuItem Props`）。`icons` 的 580 个生成组件被硬编码排除
  （`exemptions.ts` 的 `PACKAGES_WITH_HANDWRITTEN_API`）。
- **类型列取源码声明文本**，本包内的类型别名会展开一层；事件参数、插槽作用域参数、
  `defineExpose({...} satisfies XExpose)` 的成员都会进表。改表格内容等于改源码声明或 JSDoc。
  插槽参数以 `defineSlots<{...}>()` 为准；没有它时只能从模板 `<slot :a :b>` 拿到绑定名，
  渲染成 `{ a, b }`、没有类型。默认值列来自 `withDefaults` 或 `@default` 标签，透传给子组件 /
  composable 兜底的默认值必须写 `@default`；说明里写了「默认 40」却没有标签，`docs:gen` 会给出黄色提示。
- **`## 类型定义` 段是可选的机器所有区**：README 或文档页里有这个二级标题，管线就用 `src/types.ts`
  导出的 type / interface / enum（已渲染成 Props / Emits / Slots / Expose 表的接口除外）整段重写它；
  没有该标题就不追加。有标题却没有可渲染类型会让命令失败。说明性散文不要写进这一段。
- **缺文档页会让命令失败**（退出码非 0），这是有意的。所有豁免集中在 `scripts/docs/exemptions.ts`：
  `NON_COMPONENT_PACKAGES`（`hooks` / `theme` 不是组件）、`COMPONENT_DOC_PENDING`
  （文档页待写的组件包，当前为空；补上文档页后必须从集合移除，否则同样失败）、
  `COMPONENTS_WITH_EXTERNAL_PROPS`（props 类型来自外部包的组件）。新增组件包**要么补文档，要么显式登记**。
- **文档页要在三处登记**：`docs/components/<pkg>.md`、`docs/.vitepress/config.ts` 的 sidebar、
  `docs/components/index.md` 的总览表。管线校验三处两两一致，漏任何一处都失败。

---

## 执行流程

### 步骤 1: 先判断该改哪里

| 用户想要的 | 该动的地方 |
|-----------|-----------|
| Props/Emits 的类型、默认值、说明不对或缺失 | **改组件源码的类型声明与 JSDoc**，然后跑 `pnpm docs:gen` |
| 子组件的 Props 要进表 | 从 `src/index.ts` 导出它，然后跑 `pnpm docs:gen` |
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

`pnpm docs:gen` 的退出码要看——它会因为"包有组件但没有文档页"而失败，
这时补文档页或登记豁免，不要忽略。

### 步骤 5: 侧边栏

新增文档页要挂进 `docs/.vitepress/config.ts` 的 sidebar。先读现有配置照邻居的分组写，
不要凭空造分类。

---

## 常见错误

| 症状 | 原因 |
|------|------|
| API 表格是空的 / 没有默认值列 | JSDoc 缺 `@default`，或 Props 没写在 `defineProps<T>()` 引用的接口里 |
| 手写的 API 表格消失了 | 它在 `## API` 段内，被管线覆写了——这是预期行为 |
| 出现两个 API 段 | README 的 API 标题不是以 `## API` 开头的二级标题，管线找不到就会在文件末尾追加一份 |
| `pnpm docs:gen` 报某个包缺文档 | 补 `docs/components/<pkg>.md`，或登记进 `exemptions.ts` 的 `COMPONENT_DOC_PENDING` |
| `pnpm docs:gen` 报"站点登记" | 把文档页同时挂进 `docs/.vitepress/config.ts` 的 sidebar 与 `docs/components/index.md` |
| 子组件的 Props 没进文档 | 它没从 `src/index.ts` 导出 |
| Events / Slots 的说明是 `-` | Emits 接口的调用签名没有 JSDoc；插槽没有 `defineSlots` JSDoc 也没有模板 `<!-- @slot -->` |
| Expose 表没出来 | `defineExpose` 的实参没用 `satisfies XExpose`，且包内找不到 `<组件名>Expose` 接口 |
| CI Docs Check 红 | 改了类型或 JSDoc 没跑 `pnpm docs:gen`，或生成后的 README / 文档页没一起提交 |

---

## 相关文档

- `scripts/docs/gen-docs.ts` — 管线入口（本 Skill 的事实来源）；`print-api.ts` 是给 MCP 的 JSON 出口
- `scripts/docs/component-files.ts` / `extract-api.ts` / `api-markdown.ts` — 组件发现、提取与渲染；`api-model.ts` 是数据结构
- `docs/guide/component-jsdoc.md` — JSDoc 注释规范
- `docs/components/button.md` — 文档页的参考实现
- [component-design.md](../../agents/component-design.md) — 组件设计规范
- [coding-standards.md](../../agents/coding-standards.md) — 编码规范
