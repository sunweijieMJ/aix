# @aix/video

基于 video.js 的 Vue 3 视频播放器组件，支持 HLS、FLV、DASH、RTSP、WebRTC 等多种流媒体协议。

## ✨ 特性

- 基于 video.js 8.x，功能强大且稳定
- 支持多种流媒体协议（HLS、FLV、DASH、RTSP、WebRTC）
- 自动推断视频源类型
- 自定义控制栏支持
- 移动端触摸手势优化
- 网络状态监听与自动恢复
- 横屏自动全屏
- 画中画支持
- TypeScript 类型支持
- 响应式设计

## 安装

```bash
pnpm add @aix/video
```

## 快速开始

```vue
<template>
  <VideoPlayer
    :src="videoSrc"
    :autoplay="false"
    :controls="true"
    @ready="onReady"
    @error="onError"
  />
</template>

<script setup lang="ts">
import { VideoPlayer } from '@aix/video';
import '@aix/video/style';

const videoSrc = 'https://example.com/video.mp4';

const onReady = (player) => {
  console.log('播放器已就绪');
};

const onError = (error: Error) => {
  console.error('播放器错误:', error);
};
</script>
```

## API

### Props

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
| `width` | `number \| string` | - | - | 宽度 |
| `height` | `number \| string` | - | - | 高度 |
| `aspectRatio` | `string` | - | - | 宽高比（如 '16:9'） |
| `preload` | `"auto" \| "metadata" \| "none"` | `'auto'` | - | 预加载策略 |
| `transparent` | `boolean` | `false` | - | 是否透明背景 |
| `crossOrigin` | `boolean` | `true` | - | 是否跨域 |
| `enableDebugLog` | `boolean` | `false` | - | 是否启用调试日志 |
| `options` | `Partial<VideoJsOptions>` | - | - | video.js 额外配置 |
| `streamOptions` | `Omit<TSImportType, union>` | - | - | 流适配器配置 |
| `sourceType` | `any` | - | - | 视频源类型（不指定时自动推断） |
| `customControls` | `boolean` | `false` | - | 是否使用自定义控制栏 |
| `enableTouchEvents` | `boolean` | `true` | - | 是否启用触摸事件优化（移动端） |
| `autoFullscreenOnLandscape` | `boolean` | `false` | - | 横屏时是否自动全屏 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `ready` | `VideoJsPlayer` | 播放器就绪，返回 video.js 播放器实例 |
| `play` | `-` | 开始播放 |
| `pause` | `-` | 暂停播放 |
| `ended` | `-` | 播放结束 |
| `timeupdate` | `number` | 播放时间更新，返回当前时间和总时长（秒） |
| `progress` | `number` | 缓冲进度更新，返回已缓冲的百分比（0-1） |
| `error` | `Error` | 播放错误，返回错误信息 |
| `volumechange` | `number` | 音量变化，返回音量值（0-1）和是否静音 |
| `fullscreenchange` | `boolean` | 全屏状态变化，返回是否全屏 |
| `canplay` | `-` | 可以播放（已加载足够数据） |
| `loadeddata` | `-` | 数据加载完成 |
| `autoplayMuted` | `{ reason: "mobile-policy"; originalMuted: boolean; }` | 移动端自动播放策略触发静音，返回原因信息 |
| `networkOffline` | `-` | 网络离线 |
| `networkOnline` | `-` | 网络恢复在线 |
| `networkSlow` | `NetworkStatus` | 网络变慢，返回网络状态信息 |
| `networkChange` | `NetworkStatus` | 网络状态变化，返回网络状态信息 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `controls` | - |
## 类型定义

```typescript
// video.js 播放器实例类型
type VideoJsPlayer = ReturnType<typeof videojs>;

// video.js 配置选项
interface VideoJsOptions {
  autoplay?: boolean | string;
  controls?: boolean;
  width?: number;
  height?: number;
  loop?: boolean;
  muted?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  src?: string;
  poster?: string;
  aspectRatio?: string;
  fluid?: boolean;
  responsive?: boolean;
  playsinline?: boolean;
  techOrder?: string[];
  sources?: Array<{ src: string; type: string }>;
  language?: string;
  [key: string]: unknown;
}

// 网络状态
interface NetworkStatus {
  online: boolean;
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
}
```

## License

MIT
