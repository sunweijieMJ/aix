---
title: Video API
outline: deep
---

# Video API

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
| `src` | `string` | - | ✅ | 视频源地址 |
| `poster` | `string` | - | - | 封面图 |
| `autoplay` | `boolean` | `false` | - | 是否自动播放 |
| `loop` | `boolean` | `false` | - | 是否循环播放 |
| `muted` | `boolean` | `false` | - | 是否静音 |
| `controls` | `boolean` | `true` | - | 是否显示控制栏 |
| `responsive` | `boolean` | `true` | - | 是否响应式 |
| `fluid` | `boolean` | `true` | - | 是否流式布局 |
| `width` | `number` \| `string` | - | - | 宽度 |
| `height` | `number` \| `string` | - | - | 高度 |
| `aspectRatio` | `string` | - | - | 宽高比 |
| `preload` | `"auto"` \| `"metadata"` \| `"none"` | `auto` | - | 预加载策略 |
| `transparent` | `boolean` | `false` | - | 是否透明背景 |
| `crossOrigin` | `boolean` | `true` | - | 是否跨域 |
| `enableDebugLog` | `boolean` | `false` | - | 是否启用调试日志 |
| `options` | `Partial` | - | - | video.js 额外配置 |
| `streamOptions` | `Omit` | - | - | 流适配器配置 |
| `sourceType` | `VideoSourceType` | - | - | 视频源类型（不指定时自动推断） |
| `customControls` | `boolean` | `false` | - | 是否使用自定义控制栏 |
| `enableTouchEvents` | `boolean` | `true` | - | 是否启用触摸事件优化 (移动端) |
| `autoFullscreenOnLandscape` | `boolean` | `false` | - | 横屏时是否自动全屏 |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `ready` | `VideoJsPlayer` | - |
| `play` | `-` | - |
| `pause` | `-` | - |
| `ended` | `-` | - |
| `timeupdate` | `number` | - |
| `progress` | `number` | - |
| `error` | `Error` | - |
| `volumechange` | `number` | - |
| `fullscreenchange` | `boolean` | - |
| `canplay` | `-` | - |
| `loadeddata` | `-` | - |
| `autoplayMuted` | `{ reason: 'mobile-policy'; originalMuted: boolean }` | 移动端自动播放策略触发静音 |
| `networkOffline` | `-` | 网络离线 |
| `networkOnline` | `-` | 网络恢复在线 |
| `networkSlow` | `NetworkStatus` | 网络变慢 |
| `networkChange` | `NetworkStatus` | 网络状态变化 |

## Slots

| 插槽名 | 说明 |
|--------|------|
| `controls` | - |
