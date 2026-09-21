---
title: Subtitle 字幕
outline: deep
---

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Subtitle } from '@aix/subtitle'
import { VideoPlayer } from '@aix/video'

// 演示用的公开测试源：video.js 官方示例视频与配套英文字幕
const MP4 = 'https://vjs.zencdn.net/v/oceans.mp4'
const VTT = 'https://vjs.zencdn.net/v/oceans.vtt'

const nativeRef = ref()
const nativeTime = ref(0)
const playerTime = ref(0)
const showSubtitle = ref(true)

// 演示用的字幕数据
const subtitleCues = [
  { startTime: 0, endTime: 3, text: '欢迎使用 AIX 字幕组件' },
  { startTime: 3, endTime: 6, text: '支持多种字幕格式：VTT、SRT、ASS' },
  { startTime: 6, endTime: 9, text: '可自定义样式和位置' },
  { startTime: 9, endTime: 12, text: '与视频播放器完美配合' },
]

const currentTime = ref(0)
const isPlaying = ref(false)
let timer = null

const togglePlay = () => {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    timer = setInterval(() => {
      currentTime.value += 0.1
      if (currentTime.value >= 12) {
        currentTime.value = 0
      }
    }, 100)
  } else {
    clearInterval(timer)
  }
}

const reset = () => {
  currentTime.value = 0
  isPlaying.value = false
  clearInterval(timer)
}

// 供后续演示自走的时钟，0～12 秒循环
const loopTime = ref(0)
let loopTimer = null

onMounted(() => {
  loopTimer = setInterval(() => {
    loopTime.value = Number(((loopTime.value + 0.1) % 12).toFixed(1))
  }, 100)
})

const arrayCues = [
  { startTime: 0, endTime: 4, text: '数组是最直接的来源：自己拼 cues' },
  { startTime: 4, endTime: 8, text: 'startTime / endTime 单位是秒' },
  { startTime: 8, endTime: 12, text: 'text 就是这一条要显示的文字' },
]

const srtText = `
1
00:00:00,500 --> 00:00:04,000
SRT 文本可以直接喂给组件

2
00:00:04,000 --> 00:00:08,000
时间戳按 时:分:秒,毫秒 解析

3
00:00:08,000 --> 00:00:12,000
换成 vtt / ass / sbv 只需改 format
`

const longCues = [
  {
    startTime: 0,
    endTime: 12,
    text: '这是一条很长的字幕：启用 autoSegment 之后，它会按 fixedHeight 计算能放下多少字，再拆成若干段轮流显示，而不是把整块文字堆在画面上挡住内容。',
  },
]

onUnmounted(() => {
  clearInterval(timer)
  clearInterval(loopTimer)
})
</script>

<style>
.subtitle-demo {
  position: relative;
  display: block;
  min-height: 140px;
  padding: 24px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.subtitle-demo--video {
  min-height: 0;
  padding: 0;
  background: none;
}
</style>

# Subtitle 字幕

字幕渲染组件：按外部给的播放时间挑出当前该显示的 cue 并叠加渲染，来源支持 VTT / SRT / ASS / SBV / JSON
五种格式，也可以直接喂数组。

## 何时使用

- 视频、音频播放时要在画面上叠字幕，且字幕文件格式不止一种
- 需要控制字幕的位置、字号、底色，或在窄容器里做单行分段轮播
- 已有自己的播放器，只缺一个"按时间显示文字"的渲染层

组件不解析视频、也不自己走时间轴——`currentTime` 必须由播放器驱动。要的是完整播放器请用
[VideoPlayer 视频播放器](/components/video)，两者配合的写法见下方演示。

## 安装

```bash
pnpm add @aix/subtitle
```

组件样式需要在应用入口单独引入：

```ts
import '@aix/subtitle/style';
```

## 代码演示

### 交互演示

点击播放按钮查看字幕效果：

<div class="demo-block" style="position: relative; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 8px; padding: 40px 20px; min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
  <div style="position: relative; width: 100%; max-width: 600px; height: 120px; display: flex; align-items: center; justify-content: center;">
    <Subtitle
      :source="{ type: 'cues', cues: subtitleCues }"
      :currentTime="currentTime"
      position="center"
      fontSize="18px"
      background="blur"
    />
  </div>
  <div style="display: flex; gap: 12px; margin-top: 20px; align-items: center;">
    <button
      @click="togglePlay"
      style="padding: 8px 20px; border-radius: 4px; border: none; background: #409eff; color: white; cursor: pointer; font-size: 14px;"
    >
      {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
    </button>
    <button
      @click="reset"
      style="padding: 8px 20px; border-radius: 4px; border: 1px solid #ddd; background: white; cursor: pointer; font-size: 14px;"
    >
      ↺ 重置
    </button>
    <span style="color: #999; font-size: 14px; margin-left: 12px;">
      时间: {{ currentTime.toFixed(1) }}s
    </span>
  </div>
</div>

### 基础用法

组件不碰视频，只按 `currentTime` 决定显示哪条 cue——把播放器的时间接过来即可。
下面用一个原生 `<video>` 驱动，字幕绝对定位叠在视频上。

<ClientOnly>
<div class="demo-block subtitle-demo subtitle-demo--video">
  <video
    ref="nativeRef"
    :src="MP4"
    controls
    preload="metadata"
    style="width: 100%; border-radius: 6px;"
    @timeupdate="nativeTime = nativeRef?.currentTime ?? 0"
  ></video>
  <Subtitle :source="{ type: 'url', url: VTT }" :currentTime="nativeTime" position="bottom" />
</div>
</ClientOnly>

```vue
<template>
  <div class="video-container">
    <video ref="videoRef" :src="videoSrc" controls @timeupdate="onTimeUpdate" />
    <Subtitle :source="subtitleSource" :currentTime="currentTime" position="bottom" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Subtitle } from '@aix/subtitle';
import '@aix/subtitle/style';

const videoRef = ref<HTMLVideoElement>();
const currentTime = ref(0);
const videoSrc = 'https://vjs.zencdn.net/v/oceans.mp4';
const subtitleSource = { type: 'url' as const, url: 'https://vjs.zencdn.net/v/oceans.vtt' };

const onTimeUpdate = () => {
  currentTime.value = videoRef.value?.currentTime ?? 0;
};
</script>

<style scoped>
.video-container {
  position: relative;
}
</style>
```

### 从 URL 加载

格式按文件扩展名推断，跨域时字幕服务需要回 CORS 头。下面这块用页面里的定时器驱动时间，
加载的是 video.js 官方示例视频配套的英文字幕。

<div class="demo-block subtitle-demo">
  <Subtitle :source="{ type: 'url', url: VTT }" :currentTime="loopTime" />
</div>

```vue
<template>
  <Subtitle :source="{ type: 'url', url: subtitleUrl }" :currentTime="currentTime" />
</template>

<script setup lang="ts">
const subtitleUrl = 'https://vjs.zencdn.net/v/oceans.vtt';
</script>
```

### 从文本加载

已经拿到字幕文本时用 `type: 'text'`，必须显式给 `format`——文本里没有扩展名可供推断。

<div class="demo-block subtitle-demo">
  <Subtitle :source="{ type: 'text', content: srtText, format: 'srt' }" :currentTime="loopTime" />
</div>

```vue
<template>
  <Subtitle
    :source="{ type: 'text', content: srtContent, format: 'srt' }"
    :currentTime="currentTime"
  />
</template>

<script setup lang="ts">
const srtContent = `
1
00:00:01,000 --> 00:00:04,000
这是第一句字幕

2
00:00:05,000 --> 00:00:08,000
这是第二句字幕
`;
</script>
```

### 从数组加载

直接传入字幕条目数组。下面这块的 `currentTime` 由页面里的一个定时器驱动，0～12 秒循环。

<div class="demo-block subtitle-demo">
  <Subtitle :source="{ type: 'cues', cues: arrayCues }" :currentTime="loopTime" />
</div>

```vue
<template>
  <Subtitle
    :source="{ type: 'cues', cues: subtitleCues }"
    :currentTime="currentTime"
  />
</template>

<script setup lang="ts">
import type { SubtitleCue } from '@aix/subtitle';

const subtitleCues: SubtitleCue[] = [
  { startTime: 1, endTime: 4, text: '这是第一句字幕' },
  { startTime: 5, endTime: 8, text: '这是第二句字幕' },
];
</script>
```

### 自定义样式

`position` / `fontSize` / `background` / `maxWidth` 控制字幕的位置与观感，`background` 三种取值分别是
毛玻璃、渐变底、全透明。

<div class="demo-block subtitle-demo">
  <Subtitle
    :source="{ type: 'cues', cues: arrayCues }"
    :currentTime="loopTime"
    position="top"
    fontSize="18px"
    background="solid"
    maxWidth="80%"
  />
</div>

```vue
<template>
  <Subtitle
    :source="subtitleSource"
    :currentTime="currentTime"
    position="top"
    fontSize="18px"
    background="solid"
    maxWidth="80%"
  />
</template>
```

### 自动分段

一条 cue 的文字放不下时，`autoSegment` 会按 `fixedHeight` 能容纳的字数把它拆成几段，每段显示
`segmentDuration` 毫秒后轮换，而不是让文字溢出或压住画面。

<div class="demo-block subtitle-demo">
  <Subtitle
    :source="{ type: 'cues', cues: longCues }"
    :currentTime="loopTime"
    singleLine
    autoSegment
    :segmentDuration="3000"
    :fixedHeight="40"
  />
</div>

```vue
<template>
  <Subtitle
    :source="subtitleSource"
    :currentTime="currentTime"
    singleLine
    autoSegment
    :segmentDuration="3000"
    :fixedHeight="40"
  />
</template>
```

### 配合 VideoPlayer 使用

和 [VideoPlayer](/components/video) 搭配时，把播放器的 `timeupdate` 时间接到字幕的 `currentTime`，
再用 `visible` 控制字幕开关。两者各自渲染，字幕层叠在播放器之上。

<ClientOnly>
<div class="demo-block subtitle-demo subtitle-demo--video">
  <VideoPlayer :src="MP4" preload="metadata" @timeupdate="playerTime = $event" />
  <Subtitle :source="{ type: 'url', url: VTT }" :currentTime="playerTime" :visible="showSubtitle" />
  <button style="position: relative; z-index: 2; margin-top: 12px;" @click="showSubtitle = !showSubtitle">
    {{ showSubtitle ? '隐藏字幕' : '显示字幕' }}
  </button>
</div>
</ClientOnly>

```vue
<template>
  <div class="player-container">
    <VideoPlayer :src="videoSrc" @timeupdate="onTimeUpdate" />
    <Subtitle
      :source="subtitleSource"
      :currentTime="currentTime"
      :visible="showSubtitle"
      @loaded="onSubtitleLoaded"
      @change="onSubtitleChange"
    />
    <button @click="showSubtitle = !showSubtitle">
      {{ showSubtitle ? '隐藏字幕' : '显示字幕' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { VideoPlayer } from '@aix/video';
import { Subtitle, type SubtitleCue } from '@aix/subtitle';
import '@aix/video/style';
import '@aix/subtitle/style';

const currentTime = ref(0);
const showSubtitle = ref(true);
const videoSrc = 'https://vjs.zencdn.net/v/oceans.mp4';
const subtitleSource = { type: 'url' as const, url: 'https://vjs.zencdn.net/v/oceans.vtt' };

// VideoPlayer 的 timeupdate 第一个参数是当前时间（秒），第二个是总时长
const onTimeUpdate = (time: number) => {
  currentTime.value = time;
};

const onSubtitleLoaded = (cues: SubtitleCue[]) => {
  console.log('字幕加载完成，共', cues.length, '条');
};

const onSubtitleChange = (cue: SubtitleCue | null, index: number) => {
  console.log('当前字幕:', cue?.text, '索引:', index);
};
</script>

<style scoped>
.player-container {
  position: relative;
}
</style>
```

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

**Subtitle** — 字幕显示组件

支持加载 VTT/SRT/JSON/SBV/ASS 格式字幕文件，根据时间显示对应字幕

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `source` | `{ type: 'url'; url: string; format?: SubtitleFormat } \| { type: 'text'; content: string; format: SubtitleFormat } \| { type: 'cues'; cues: SubtitleCue[] }` | - | - | 字幕来源 |
| `currentTime` | `number` | - | - | 当前播放时间 (秒)，用于外部控制字幕显示 |
| `visible` | `boolean` | `true` | - | 是否显示字幕 |
| `position` | `'top' \| 'bottom' \| 'center'` | `'bottom'` | - | 字幕位置 |
| `fontSize` | `number \| string` | `20` | - | 字体大小，可以是数字(px)或 CSS 字符串 |
| `background` | `'blur' \| 'solid' \| 'none'` | `'blur'` | - | 背景样式：blur-毛玻璃、solid-渐变、none-透明 |
| `maxWidth` | `number \| string` | `'1200px'` | - | 最大宽度，可以是数字(px)或 CSS 字符串 |
| `singleLine` | `boolean` | `false` | - | 是否单行显示（固定高度场景下启用，需配合 fixedHeight 使用） |
| `fixedHeight` | `number` | - | - | 固定高度（用于计算分段，单位 px） |
| `autoSegment` | `boolean` | `false` | - | 是否自动分段（文字过长时分多段轮播显示） |
| `segmentDuration` | `number` | `3000` | - | 每段显示时长（毫秒） |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `loaded` | `cues: SubtitleCue[]` | 字幕加载完成，返回所有字幕条目 |
| `error` | `error: Error` | 字幕加载失败，返回错误信息 |
| `change` | `cue: SubtitleCue \| null, index: number` | 当前字幕变化，返回当前字幕条目和索引（null 表示无字幕） |

### Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | `props: SubtitleSlotScope` | 自定义字幕渲染，默认渲染当前分段文本 |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `getCues` | `() => SubtitleCue[]` | 获取所有字幕条目 |
| `getCurrentCue` | `() => SubtitleCue \| null` | 获取当前字幕 |
| `getCurrentIndex` | `() => number` | 获取当前字幕索引 |
| `getCueAtTime` | `(time: number) => SubtitleCue \| null` | 根据时间获取字幕 |
| `reload` | `() => Promise<void>` | 重新加载字幕 |
| `loading` | `Ref<boolean>` | 是否正在加载 |
| `error` | `Ref<Error \| null>` | 加载错误 |

## 类型定义

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

```typescript
/** 字幕条目 */
export interface SubtitleCue {
  /** 唯一标识 (可选) */
  id?: string;
  /** 开始时间 (秒) */
  startTime: number;
  /** 结束时间 (秒) */
  endTime: number;
  /** 字幕文本 */
  text: string;
  /** 扩展数据 (用于存储 PPT 索引等业务数据) */
  data?: Record<string, unknown>;
}

/** 字幕文件格式 */
export type SubtitleFormat = 'vtt' | 'srt' | 'json' | 'sbv' | 'ass';

/** 字幕来源类型 */
export type SubtitleSource =
  | { type: 'url'; url: string; format?: SubtitleFormat }
  | { type: 'text'; content: string; format: SubtitleFormat }
  | { type: 'cues'; cues: SubtitleCue[] };

/** 默认插槽的作用域 */
export interface SubtitleSlotScope {
  /** 当前分段文本 */
  text: string;
  /** 当前字幕条目的完整文本 */
  fullText: string;
  /** 当前分段序号（从 1 开始） */
  currentSegment: number;
  /** 分段总数 */
  totalSegments: number;
  /** 当前字幕条目的扩展数据 */
  data?: Record<string, unknown>;
}

/** 字幕解析器接口 */
export interface SubtitleParser {
  /** 解析字幕内容 */
  parse: (content: string) => SubtitleCue[];
}
```

## 支持的字幕格式

| 格式 | 说明 | 文件扩展名 |
|------|------|-----------|
| `vtt` | WebVTT 格式 | `.vtt` |
| `srt` | SubRip 格式 | `.srt` |
| `ass` | Advanced SubStation Alpha | `.ass` |
| `sbv` | YouTube SBV 格式 | `.sbv` |
| `json` | JSON 格式 | `.json` |

::: tip 提示
从 URL 加载时，格式会根据文件扩展名自动推断。从文本加载时，需要手动指定 `format`。
:::
