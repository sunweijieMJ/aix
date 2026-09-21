---
title: VideoPlayer 视频播放器
outline: deep
---

<script setup>
import { ref } from 'vue'
import { VideoPlayer } from '@aix/video'

// 演示用的公开测试源
const MP4 = 'https://vjs.zencdn.net/v/oceans.mp4'
const HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

const playerRef = ref()
const muted = ref(false)

function call(method) {
  playerRef.value?.[method]()
  if (method === 'toggleMute') muted.value = !muted.value
}

function fmt(seconds) {
  const s = Math.floor(seconds || 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
</script>

<style>
.video-demo {
  display: block;
  max-width: 640px;
  padding: 0;
}

.video-demo__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
}

.video-demo__custom {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 0 0 6px 6px;
  background: var(--vp-c-bg-alt);
  font-size: 13px;
}
</style>

# VideoPlayer 视频播放器

基于 [video.js](https://videojs.com/) 的播放器，按 URL 自动识别 MP4 / HLS / DASH / FLV / RTSP / WebRTC 并加载对应内核，
控制栏分点播与直播两套，可整体替换。

## 何时使用

- 页面里要播一段点播视频或一路直播流，且来源不止 MP4（`.m3u8`、`.flv`、`.mpd` 都要能放）
- 需要接管控制栏：换按钮、加业务操作、做移动端手势
- 需要监听网络与播放状态做降级或埋点

只放一段本地 MP4、不需要控制栏定制时，原生 `<video>` 更省事——本组件会把 video.js 与对应流媒体内核一起打进产物。
要展示的是音频波形或语音，用 [Audio 语音](/components/audio)；需要字幕轨道叠加，配合
[Subtitle 字幕](/components/subtitle) 使用。

## 安装

```bash
pnpm add @aix/video
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/video/style';
import '@aix/theme/style';
```

## 代码演示

本节的活演示用两个公开测试源：MP4 取自 [video.js 官方示例](https://vjs.zencdn.net/v/oceans.mp4)，
HLS 取自 [Mux 公共测试流](https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8)。都需要联网才能播放。

### 基础用法

传入视频地址即可播放，`sourceType` 不传时按 URL 自动推断。

<ClientOnly>
<div class="demo-block video-demo">
  <VideoPlayer :src="MP4" preload="metadata" />
</div>
</ClientOnly>

```vue
<template>
  <div style="max-width: 640px">
    <VideoPlayer :src="videoSrc" preload="metadata" />
  </div>
</template>

<script setup lang="ts">
import { VideoPlayer } from '@aix/video';
import '@aix/video/style';

const videoSrc = 'https://vjs.zencdn.net/v/oceans.mp4';
</script>
```

### 播放 HLS 流

`.m3u8` 会自动走 hls.js；也可以用 `sourceType` 显式指定，跳过推断。直播流常配 `autoplay` + `muted`，
因为浏览器不允许带声音的自动播放。

<ClientOnly>
<div class="demo-block video-demo">
  <VideoPlayer :src="HLS" source-type="hls" muted preload="metadata" />
</div>
</ClientOnly>

```vue
<template>
  <VideoPlayer :src="hlsUrl" source-type="hls" muted autoplay />
</template>

<script setup lang="ts">
import { VideoPlayer } from '@aix/video';
import '@aix/video/style';

const hlsUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
</script>
```

### 使用 ref 控制

组件实例暴露了播放、跳转、音量、全屏、画中画、变速等方法，完整清单见下方 Expose 表。

<ClientOnly>
<div class="demo-block video-demo">
  <VideoPlayer ref="playerRef" :src="MP4" preload="metadata" />
  <div class="video-demo__bar">
    <button @click="call('play')">播放</button>
    <button @click="call('pause')">暂停</button>
    <button @click="call('toggleMute')">{{ muted ? '取消静音' : '静音' }}</button>
    <button @click="playerRef?.seek(30)">跳到 0:30</button>
    <button @click="playerRef?.setPlaybackRate(1.5)">1.5 倍速</button>
    <button @click="call('toggleFullscreen')">全屏</button>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <VideoPlayer ref="playerRef" :src="videoSrc" />
  <button @click="playerRef?.play()">播放</button>
  <button @click="playerRef?.seek(30)">跳到 0:30</button>
  <button @click="playerRef?.setPlaybackRate(1.5)">1.5 倍速</button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { VideoPlayer, type VideoPlayerExpose } from '@aix/video';
import '@aix/video/style';

const playerRef = ref<VideoPlayerExpose>();
const videoSrc = 'https://vjs.zencdn.net/v/oceans.mp4';
</script>
```

### 自定义控制栏

`customControls` 为 `true` 时渲染 `controls` 插槽，作用域给出 `playerState` 快照与 `controls` 方法集；
同时把原生 `controls` 关掉，避免两套控制栏叠在一起。

<ClientOnly>
<div class="demo-block video-demo">
  <VideoPlayer :src="MP4" preload="metadata" custom-controls :controls="false">
    <template #controls="{ playerState, controls }">
      <div class="video-demo__custom">
        <button v-if="!playerState.isPlaying" @click="controls.play()">播放</button>
        <button v-else @click="controls.pause()">暂停</button>
        <span>{{ fmt(playerState.currentTime) }} / {{ fmt(playerState.duration) }}</span>
        <input
          type="range"
          min="0"
          max="100"
          :value="playerState.volume * 100"
          @input="controls.setVolume($event.target.value / 100)"
        />
        <button @click="controls.toggleFullscreen()">全屏</button>
      </div>
    </template>
  </VideoPlayer>
</div>
</ClientOnly>

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

网络事件要真的断网、限速才会触发，文档站里演示不出来，这节只给代码。

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

触摸手势与横屏全屏只在真机上有效果，桌面浏览器看不出差别，这节只给代码。

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

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

**VideoPlayer** — 视频播放器组件

基于 video.js 的 Vue 3 视频播放器，支持 HLS/RTMP/FLV 等多种视频格式

### VideoPlayer Props

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
| `width` | `number \| string` | - | - | 宽度，数字按 px 处理；未设时由 fluid / responsive 决定 |
| `height` | `number \| string` | - | - | 高度，数字按 px 处理；未设时由 fluid / responsive 决定 |
| `aspectRatio` | `string` | - | - | 宽高比（如 '16:9'） |
| `preload` | `'auto' \| 'metadata' \| 'none'` | `'auto'` | - | 预加载策略 |
| `transparent` | `boolean` | `false` | - | 是否透明背景 |
| `crossOrigin` | `boolean` | `true` | - | 是否给 video 元素加 `crossorigin="anonymous"`；跨域截帧 / 取像素需要它，但源站未回 CORS 头时会导致加载失败，此时关掉 |
| `enableDebugLog` | `boolean` | `false` | - | 是否启用调试日志 |
| `options` | `Partial<VideoJsOptions>` | - | - | video.js 额外配置 |
| `streamOptions` | `Omit<StreamAdapterOptions, 'onReady' \| 'onError' \| 'onFirstFrame'>` | - | - | 流适配器配置 |
| `sourceType` | `VideoSourceType` | - | - | 视频源类型（不指定时自动推断） |
| `customControls` | `boolean` | `false` | - | 是否使用自定义控制栏 |
| `enableTouchEvents` | `boolean` | `true` | - | 是否启用触摸事件优化（移动端） |
| `autoFullscreenOnLandscape` | `boolean` | `false` | - | 横屏时是否自动全屏 |

### VideoPlayer Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `ready` | `player: VideoJsPlayer` | 播放器就绪，返回 video.js 播放器实例 |
| `play` | - | 开始播放 |
| `pause` | - | 暂停播放 |
| `ended` | - | 播放结束 |
| `timeupdate` | `currentTime: number, duration: number` | 播放时间更新，返回当前时间和总时长（秒） |
| `progress` | `buffered: number` | 缓冲进度更新，返回已缓冲的百分比（0-1） |
| `error` | `error: Error` | 播放错误，返回错误信息 |
| `volumechange` | `volume: number, muted: boolean` | 音量变化，返回音量值（0-1）和是否静音 |
| `fullscreenchange` | `isFullscreen: boolean` | 全屏状态变化，返回是否全屏 |
| `canplay` | - | 可以播放（已加载足够数据） |
| `loadeddata` | - | 数据加载完成 |
| `autoplayMuted` | `reason: { reason: 'mobile-policy'; originalMuted: boolean }` | 移动端自动播放策略触发静音，返回原因信息 |
| `networkOffline` | - | 网络离线 |
| `networkOnline` | - | 网络恢复在线 |
| `networkSlow` | `status: NetworkStatus` | 网络变慢，返回网络状态信息 |
| `networkChange` | `status: NetworkStatus` | 网络状态变化，返回网络状态信息 |

### VideoPlayer Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `controls` | `props: VideoPlayerControlsSlotScope` | 自定义控制栏，customControls 为 true 时渲染 |

### VideoPlayer Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `isReady` | `Ref<boolean>` | 播放器是否就绪 |
| `isPlaying` | `Ref<boolean>` | 是否正在播放 |
| `isMuted` | `Ref<boolean>` | 是否静音 |
| `isReconnecting` | `Ref<boolean>` | 是否正在重连 |
| `autoPlayFailed` | `Ref<boolean>` | 自动播放是否失败 |
| `isNativeFullscreen` | `Ref<boolean>` | 是否处于浏览器原生全屏 |
| `getPlayer` | `() => VideoJsPlayer \| null` | 获取 video.js 播放器实例 |
| `getVideo` | `() => HTMLVideoElement \| null` | 获取 video 元素 |
| `play` | `() => Promise<void>` | 播放 |
| `pause` | `() => void` | 暂停 |
| `seek` | `(time: number) => void` | 跳转到指定时间 (秒) |
| `setVolume` | `(volume: number) => void` | 设置音量 (0-1) |
| `getVolume` | `() => number` | 获取音量 (0-1) |
| `toggleMute` | `() => void` | 切换静音 |
| `toggleFullscreen` | `() => void` | 进入/退出全屏 |
| `enterNativeFullscreen` | `() => void` | 进入浏览器原生全屏 |
| `exitNativeFullscreen` | `() => void` | 退出浏览器原生全屏 |
| `togglePictureInPicture` | `() => Promise<void>` | 进入/退出画中画 |
| `getCurrentTime` | `() => number` | 获取当前播放时间 (秒) |
| `getDuration` | `() => number` | 获取视频时长 (秒) |
| `setPlaybackRate` | `(rate: number) => void` | 设置播放速率 (0.25-4) |
| `getPlaybackRate` | `() => number` | 获取播放速率 |
| `reload` | `() => void` | 重新加载视频 |
| `forceReload` | `(shouldPlay?: boolean) => void` | 强制重载播放器（保留状态，用于修复卡顿/黑屏） |

---

**DefaultControls** — 默认控制栏：播放 / 暂停、音量与全屏，点播与直播都能用。

### DefaultControls Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `playerState` | `PlayerState` | - | ✅ | 播放器状态 |
| `controls` | `ControlMethods` | - | ✅ | 控制方法 |

---

**LiveControls** — 直播控制栏：LIVE 标识、刷新、音量与全屏，没有进度条与倍速。

### LiveControls Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `playerState` | `PlayerState` | - | ✅ | 播放器状态 |
| `controls` | `ControlMethods` | - | ✅ | 控制方法 |
| `autoHideDelay` | `number` | `3000` | - | 自动隐藏延迟(ms)，0 表示禁用 |
| `showLiveBadge` | `boolean` | `true` | - | 是否显示 LIVE 标识 |
| `showRefresh` | `boolean` | `true` | - | 是否显示刷新按钮 |

---

**PlaybackControls** — 点播控制栏：进度条、时间、倍速与全屏，闲置一段时间后自动隐藏。

### PlaybackControls Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `playerState` | `PlayerState` | - | ✅ | 播放器状态 |
| `controls` | `ControlMethods` | - | ✅ | 控制方法 |
| `autoHideDelay` | `number` | `3000` | - | 自动隐藏延迟(ms)，0 表示禁用 |
| `playbackRates` | `number[]` | `[0.5, 0.75, 1, 1.25, 1.5, 2]` | - | 可用的倍速选项 |
| `showPlaybackRate` | `boolean` | `true` | - | 是否显示倍速按钮 |
| `showTime` | `boolean` | `true` | - | 是否显示时间 |

## 类型定义

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

```typescript
/**
 * video.js Player 实例类型
 */
export type VideoJsPlayer = ReturnType<typeof videojs>;

/**
 * video.js 播放器配置选项
 */
export interface VideoJsOptions {
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

/**
 * SDK 加载配置
 */
export interface SdkLoaderConfig {
  /** SDK 名称 */
  name: string;
  /** 全局变量名 */
  globalName?: string;
  /** CDN 地址 */
  cdnUrl?: string;
  /** ES 模块导入函数 */
  importFn?: () => Promise<unknown>;
  /** 是否必须加载成功 */
  required?: boolean;
  /** 加载前的钩子 (用于加载 CSS 等前置依赖) */
  beforeLoad?: () => Promise<void>;
}

/** `controls` 插槽的作用域 */
export interface VideoPlayerControlsSlotScope {
  /** 播放器当前状态快照 */
  playerState: PlayerState;
  /** 播放器控制方法集合 */
  controls: ControlMethods;
}

/**
 * 控制方法接口
 * 暴露给自定义控制栏的播放器控制方法
 */
export interface ControlMethods {
  /** 播放 */
  play: () => Promise<void>;
  /** 暂停 */
  pause: () => void;
  /** 跳转到指定时间 (秒) */
  seek: (time: number) => void;
  /** 设置音量 (0-1) */
  setVolume: (volume: number) => void;
  /** 获取音量 (0-1) */
  getVolume: () => number;
  /** 切换静音 */
  toggleMute: () => void;
  /** 进入/退出全屏 */
  toggleFullscreen: () => void;
  /** 进入浏览器原生全屏 */
  enterNativeFullscreen: () => void;
  /** 退出浏览器原生全屏 */
  exitNativeFullscreen: () => void;
  /** 进入/退出画中画 */
  togglePictureInPicture: () => Promise<void>;
  /** 设置播放速率 (0.25-4) */
  setPlaybackRate: (rate: number) => void;
  /** 获取播放速率 */
  getPlaybackRate: () => number;
  /** 重新加载视频 */
  reload: () => void;
  /** 强制重载播放器 */
  forceReload: (shouldPlay?: boolean) => void;
}
```

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
