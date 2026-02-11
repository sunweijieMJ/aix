---
title: PdfViewer API
outline: deep
---

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
| `source` | `string` \| `ArrayBuffer` | - | ✅ | PDF 文件 URL 或 ArrayBuffer |
| `initialPage` | `number` | `1` | - | 初始页码 |
| `config` | `Partial` | `() => ({})` | - | 配置项 |
| `imageLayerConfig` | `Partial` | `() => ({})` | - | 图片层配置 |
| `contextMenuConfig` | `Partial` | `() => ({})` | - | 右键菜单配置 |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `ready` | `number` | - |
| `error` | `Error` | - |
| `pageChange` | `number` | - |
| `scaleChange` | `number` | - |
| `textSelect` | `string` | - |
| `imageClick` | `PdfImageInfo` | - |
| `imageSelect` | `Array` | - |
| `contextMenu` | `ContextMenuContext` | - |

## Slots

| 插槽名 | 说明 |
|--------|------|
| `toolbar` | - |
