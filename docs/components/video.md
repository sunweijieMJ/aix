---
title: VideoPlayer 视频播放器
outline: deep
---

基于 video.js 的视频播放器组件，支持 HLS、FLV、DASH、RTSP、WebRTC 等多种流媒体协议。

## 何时使用

- 需要在网页中嵌入视频播放功能
- 需要支持多种流媒体协议（HLS、DASH、RTSP 等）
- 需要自定义控制栏或移动端优化

## 代码演示

### 基础用法

最简单的用法，传入视频地址即可播放。

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

支持 HLS 协议的直播流或点播流。

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

通过 ref 获取组件实例，可以调用组件方法进行控制。

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

通过 `controls` 插槽可以完全自定义控制栏。

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

监听网络状态变化，自动处理断网重连。

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

启用触摸手势和横屏自动全屏。

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
| `options` | `Partial<VideoJsOptions>` | - | - | video.js 额外配置 |
| `streamOptions` | `StreamAdapterOptions` | - | - | 流适配器配置 |
| `sourceType` | `VideoSourceType` | - | - | 视频源类型（不指定时自动推断） |
| `customControls` | `boolean` | `false` | - | 是否使用自定义控制栏 |
| `enableTouchEvents` | `boolean` | `true` | - | 是否启用触摸事件优化 (移动端) |
| `autoFullscreenOnLandscape` | `boolean` | `false` | - | 横屏时是否自动全屏 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `ready` | `VideoJsPlayer` | 播放器初始化完成 |
| `play` | - | 开始播放 |
| `pause` | - | 暂停播放 |
| `ended` | - | 播放结束 |
| `timeupdate` | `number` | 播放时间更新 |
| `progress` | `number` | 缓冲进度更新 |
| `error` | `Error` | 播放错误 |
| `volumechange` | `number` | 音量变化 |
| `fullscreenchange` | `boolean` | 全屏状态变化 |
| `canplay` | - | 可以播放 |
| `loadeddata` | - | 数据加载完成 |
| `autoplayMuted` | `{ reason: 'mobile-policy'; originalMuted: boolean }` | 移动端自动播放策略触发静音 |
| `networkOffline` | - | 网络离线 |
| `networkOnline` | - | 网络恢复在线 |
| `networkSlow` | `NetworkStatus` | 网络变慢 |
| `networkChange` | `NetworkStatus` | 网络状态变化 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `controls` | 自定义控制栏，接收 `{ playerState, controls }` 参数 |

### Expose

通过 ref 可以获取以下方法：

| 方法名 | 类型 | 说明 |
|--------|------|------|
| `play` | `() => void` | 播放视频 |
| `pause` | `() => void` | 暂停视频 |
| `toggleMute` | `() => void` | 切换静音 |
| `toggleFullscreen` | `() => void` | 切换全屏 |
| `seek` | `(time: number) => void` | 跳转到指定时间 |
| `setVolume` | `(volume: number) => void` | 设置音量 |

## 支持的视频源类型

| 类型 | 说明 | 文件扩展名 |
|------|------|-----------|
| `mp4` | MP4 视频 | `.mp4` |
| `webm` | WebM 视频 | `.webm` |
| `hls` | HLS 流 | `.m3u8` |
| `dash` | DASH 流 | `.mpd` |
| `flv` | FLV 视频 | `.flv` |
| `rtsp` | RTSP 流 | `rtsp://` |
| `webrtc` | WebRTC 流 | `webrtc://` |

::: tip 提示
视频源类型会根据 URL 自动推断，也可以通过 `sourceType` 属性手动指定。
:::
