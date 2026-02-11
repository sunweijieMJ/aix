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

| 属性 | 类型 | 默认值 | 必填 | 描述 |
|------|------|--------|:----:|------|
| src | `string` | - | ✅ | 视频源地址 |
| poster | `string` | - | ❌ | 封面图 |
| autoplay | `boolean` | `false` | ❌ | 是否自动播放 |
| loop | `boolean` | `false` | ❌ | 是否循环播放 |
| muted | `boolean` | `false` | ❌ | 是否静音 |
| controls | `boolean` | `true` | ❌ | 是否显示控制栏 |
| responsive | `boolean` | `true` | ❌ | 是否响应式 |
| fluid | `boolean` | `true` | ❌ | 是否流式布局 |
| width | `number \| string` | - | ❌ | 宽度 |
| height | `number \| string` | - | ❌ | 高度 |
| aspectRatio | `string` | - | ❌ | 宽高比（如 `'16:9'`） |
| preload | `'auto' \| 'metadata' \| 'none'` | `'auto'` | ❌ | 预加载策略 |
| transparent | `boolean` | `false` | ❌ | 是否透明背景 |
| crossOrigin | `boolean` | `true` | ❌ | 是否跨域 |
| enableDebugLog | `boolean` | `false` | ❌ | 是否启用调试日志 |
| options | `Partial<VideoJsOptions>` | - | ❌ | video.js 额外配置 |
| streamOptions | `StreamAdapterOptions` | - | ❌ | 流适配器配置 |
| sourceType | `VideoSourceType` | - | ❌ | 视频源类型（不指定时自动推断） |
| customControls | `boolean` | `false` | ❌ | 是否使用自定义控制栏 |
| enableTouchEvents | `boolean` | `true` | ❌ | 是否启用触摸事件优化（移动端） |
| autoFullscreenOnLandscape | `boolean` | `false` | ❌ | 横屏时是否自动全屏 |

### VideoSourceType

支持的视频源类型：

```typescript
type VideoSourceType = 'mp4' | 'hls' | 'flv' | 'dash' | 'rtsp' | 'webrtc';
```

### Events

| 事件名 | 参数 | 描述 |
|--------|------|------|
| ready | `player: VideoJsPlayer` | 播放器就绪 |
| play | - | 开始播放 |
| pause | - | 暂停播放 |
| ended | - | 播放结束 |
| timeupdate | `currentTime: number, duration: number` | 播放时间更新 |
| progress | `buffered: number` | 缓冲进度更新 |
| error | `error: Error` | 播放错误 |
| volumechange | `volume: number, muted: boolean` | 音量变化 |
| fullscreenchange | `isFullscreen: boolean` | 全屏状态变化 |
| canplay | - | 可以播放 |
| loadeddata | - | 数据加载完成 |
| autoplayMuted | `reason: { reason: string; originalMuted: boolean }` | 移动端自动播放策略触发静音 |
| networkOffline | - | 网络离线 |
| networkOnline | - | 网络恢复在线 |
| networkSlow | `status: NetworkStatus` | 网络变慢 |
| networkChange | `status: NetworkStatus` | 网络状态变化 |

### Expose

组件暴露以下方法和状态：

#### 状态

| 属性 | 类型 | 描述 |
|------|------|------|
| isReady | `Ref<boolean>` | 播放器是否就绪 |
| isPlaying | `Ref<boolean>` | 是否正在播放 |
| isMuted | `Ref<boolean>` | 是否静音 |
| isReconnecting | `Ref<boolean>` | 是否正在重连 |
| autoPlayFailed | `Ref<boolean>` | 自动播放是否失败 |
| isNativeFullscreen | `Ref<boolean>` | 是否处于浏览器原生全屏 |

#### 方法

| 方法 | 参数 | 返回值 | 描述 |
|------|------|--------|------|
| getPlayer | - | `VideoJsPlayer \| null` | 获取 video.js 播放器实例 |
| getVideo | - | `HTMLVideoElement \| null` | 获取 video 元素 |
| play | - | `Promise<void>` | 播放 |
| pause | - | `void` | 暂停 |
| seek | `time: number` | `void` | 跳转到指定时间（秒） |
| setVolume | `volume: number` | `void` | 设置音量（0-1） |
| getVolume | - | `number` | 获取音量（0-1） |
| toggleMute | - | `void` | 切换静音 |
| toggleFullscreen | - | `void` | 进入/退出全屏 |
| enterNativeFullscreen | - | `void` | 进入浏览器原生全屏 |
| exitNativeFullscreen | - | `void` | 退出浏览器原生全屏 |
| togglePictureInPicture | - | `Promise<void>` | 进入/退出画中画 |
| getCurrentTime | - | `number` | 获取当前播放时间（秒） |
| getDuration | - | `number` | 获取视频时长（秒） |
| setPlaybackRate | `rate: number` | `void` | 设置播放速率（0.25-4） |
| getPlaybackRate | - | `number` | 获取播放速率 |
| reload | - | `void` | 重新加载视频 |
| forceReload | `shouldPlay?: boolean` | `void` | 强制重载播放器（用于修复卡顿/黑屏） |

### Slots

| 插槽名 | 插槽参数 | 描述 |
|--------|----------|------|
| controls | `{ playerState, controls }` | 自定义控制栏（需设置 `customControls: true`） |

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
