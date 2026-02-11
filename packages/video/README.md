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

### Events

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

### Slots

| 插槽名 | 说明 |
|--------|------|
| `controls` | - |

## 使用示例

### 基础用法

```vue
<template>
  <div style="width: 800px; height: 450px">
    <VideoPlayer :src="videoSrc" />
  </div>
</template>

<script setup lang="ts">
import { VideoPlayer } from '@aix/video';
import '@aix/video/style';

const videoSrc = '/videos/sample.mp4';
</script>
```

### 播放 HLS 流

```vue
<template>
  <VideoPlayer
    :src="hlsUrl"
    source-type="hls"
    :autoplay="true"
    :muted="true"
  />
</template>

<script setup lang="ts">
import { VideoPlayer } from '@aix/video';
import '@aix/video/style';

const hlsUrl = 'https://example.com/stream.m3u8';
</script>
```

### 使用 ref 控制

```vue
<template>
  <div>
    <div class="toolbar">
      <button @click="playerRef?.play()">播放</button>
      <button @click="playerRef?.pause()">暂停</button>
      <button @click="playerRef?.toggleMute()">静音</button>
      <button @click="playerRef?.toggleFullscreen()">全屏</button>
    </div>
    <VideoPlayer ref="playerRef" :src="videoSrc" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { VideoPlayer, type VideoPlayerExpose } from '@aix/video';
import '@aix/video/style';

const playerRef = ref<VideoPlayerExpose>();
const videoSrc = '/videos/sample.mp4';
</script>
```

### 自定义控制栏

```vue
<template>
  <VideoPlayer
    :src="videoSrc"
    :custom-controls="true"
    :controls="false"
  >
    <template #controls="{ playerState, controls }">
      <div class="custom-controls">
        <button @click="controls.play()" v-if="!playerState.isPlaying">
          播放
        </button>
        <button @click="controls.pause()" v-else>
          暂停
        </button>
        <span>
          {{ formatTime(playerState.currentTime) }} /
          {{ formatTime(playerState.duration) }}
        </span>
        <input
          type="range"
          :value="playerState.volume * 100"
          @input="controls.setVolume($event.target.value / 100)"
        />
      </div>
    </template>
  </VideoPlayer>
</template>

<script setup lang="ts">
import { VideoPlayer } from '@aix/video';
import '@aix/video/style';

const videoSrc = '/videos/sample.mp4';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
</script>
```

### 网络状态监听

```vue
<template>
  <VideoPlayer
    :src="videoSrc"
    @networkOffline="onOffline"
    @networkOnline="onOnline"
    @networkSlow="onNetworkSlow"
  />
</template>

<script setup lang="ts">
import { VideoPlayer, type NetworkStatus } from '@aix/video';
import '@aix/video/style';

const videoSrc = '/videos/sample.mp4';

const onOffline = () => {
  console.log('网络已断开');
};

const onOnline = () => {
  console.log('网络已恢复');
};

const onNetworkSlow = (status: NetworkStatus) => {
  console.log('网络变慢:', status);
};
</script>
```

### 移动端优化

```vue
<template>
  <VideoPlayer
    :src="videoSrc"
    :enable-touch-events="true"
    :auto-fullscreen-on-landscape="true"
  />
</template>

<script setup lang="ts">
import { VideoPlayer } from '@aix/video';
import '@aix/video/style';

const videoSrc = '/videos/sample.mp4';

// 触摸手势：
// - 单击：播放/暂停
// - 双击：全屏
// - 左滑：快退 10 秒
// - 右滑：快进 10 秒
</script>
```

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
