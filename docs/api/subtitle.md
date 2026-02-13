---
title: Subtitle API
outline: deep
---

# Subtitle API

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
| `source` | `SubtitleSource` | - | - | 字幕来源 |
| `currentTime` | `number` | - | - | 当前播放时间 (秒) - 用于外部控制 |
| `visible` | `boolean` | `true` | - | 是否显示字幕 |
| `position` | `"top"` \| `"bottom"` \| `"center"` | `bottom` | - | 字幕位置 |
| `fontSize` | `number` \| `string` | `20` | - | 字体大小 |
| `background` | `"blur"` \| `"solid"` \| `"none"` | `blur` | - | 背景样式 |
| `maxWidth` | `number` \| `string` | `1200px` | - | 最大宽度 |
| `singleLine` | `boolean` | `false` | - | 是否单行显示（固定高度场景） |
| `fixedHeight` | `number` | - | - | 固定高度（用于计算分段，单位 px） |
| `autoSegment` | `boolean` | `false` | - | 是否自动分段（文字过长时分多段轮播显示） |
| `segmentDuration` | `number` | `3000` | - | 每段显示时长（毫秒），默认 3000ms |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `loaded` | `Array` | 字幕加载完成 |
| `error` | `Error` | 字幕加载失败 |
| `change` | `union` | 当前字幕变化 |

## Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | - |
