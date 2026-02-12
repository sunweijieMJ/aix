---
title: Button API
outline: deep
---

# Button API

::: warning 自动生成
此文档由 `pnpm docs:sync` 自动生成。请勿手动编辑此文件。

如需更新 API 文档，请修改组件源码注释，然后运行：

```bash
pnpm docs:gen  # 生成 API 到 README.md
pnpm docs:sync # 同步到文档站点
```

:::

## Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `type` | `"primary"` \| `"default"` \| `"dashed"` \| `"text"` \| `"link"` | `default` | - | 按钮类型 |
| `size` | `"small"` \| `"medium"` \| `"large"` | `medium` | - | 按钮尺寸 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `loading` | `boolean` | `false` | - | 是否加载中 |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `click` | `MouseEvent` | - |

## Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | - |
