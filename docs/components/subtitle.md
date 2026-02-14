---
title: Subtitle 字幕
outline: deep
---

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Subtitle } from '@aix/subtitle'

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

onUnmounted(() => {
  clearInterval(timer)
})
</script>

字幕组件，支持多种字幕格式（VTT、SRT、JSON、SBV、ASS），可与视频播放器配合使用。

## 何时使用

- 需要在视频上显示字幕
- 需要支持多种字幕格式
- 需要自定义字幕样式或位置

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

配合视频元素使用，通过 `currentTime` 同步字幕。

```vue
<template>
  <div class="video-container">
    <video ref="videoRef" src="/video.mp4" @timeupdate="onTimeUpdate" />
    <Subtitle
      :source="subtitleSource"
      :currentTime="currentTime"
      position="bottom"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Subtitle } from '@aix/subtitle';
import '@aix/subtitle/style';

const videoRef = ref<HTMLVideoElement>();
const currentTime = ref(0);

const subtitleSource = {
  type: 'url' as const,
  url: '/subtitles/video.vtt',
};

const onTimeUpdate = () => {
  currentTime.value = videoRef.value?.currentTime ?? 0;
};
</script>
```

### 从 URL 加载

从远程 URL 加载字幕文件，格式会根据文件扩展名自动推断。

```vue
<template>
  <Subtitle
    :source="{ type: 'url', url: '/subtitles/video.vtt' }"
    :currentTime="currentTime"
  />
</template>
```

### 从文本加载

直接从字幕文本内容加载，需要指定格式。

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

直接传入字幕条目数组。

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

可以自定义字幕的位置、字体大小、背景样式等。

```vue
<template>
  <Subtitle
    :source="subtitleSource"
    :currentTime="currentTime"
    position="bottom"
    fontSize="18px"
    background="blur"
    maxWidth="80%"
  />
</template>
```

### 自动分段

当字幕文本过长时，启用自动分段可以分多段轮播显示。

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

与 `@aix/video` 配合使用的完整示例。

```vue
<template>
  <div class="player-container">
    <VideoPlayer
      :src="videoSrc"
      @ready="onPlayerReady"
      @timeupdate="onTimeUpdate"
    />
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
const videoSrc = '/videos/sample.mp4';

const subtitleSource = {
  type: 'url' as const,
  url: '/subtitles/video.vtt',
};

const onPlayerReady = () => {
  console.log('播放器就绪');
};

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
```

## API

::: warning 自动生成的 API 文档
以下 API 文档由 `pnpm docs:gen` 从组件源码自动生成。请勿手动编辑此部分。

如需更新 API 文档，请：
1. 修改组件源码中的 JSDoc 注释
2. 运行 `pnpm docs:gen` 生成到 README.md
3. 运行 `pnpm docs:sync` 同步到此文档
:::

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `source` | `SubtitleSource` | - | - | 字幕来源 |
| `currentTime` | `number` | - | - | 当前播放时间 (秒)，用于外部控制字幕显示 |
| `visible` | `boolean` | `true` | - | 是否显示字幕 |
| `position` | `"top" \| "bottom" \| "center"` | `'bottom'` | - | 字幕位置 |
| `fontSize` | `number \| string` | `20` | - | 字体大小，可以是数字(px)或 CSS 字符串 |
| `background` | `"blur" \| "solid" \| "none"` | `'blur'` | - | 背景样式：blur-毛玻璃、solid-渐变、none-透明 |
| `maxWidth` | `number \| string` | `'1200px'` | - | 最大宽度，可以是数字(px)或 CSS 字符串 |
| `singleLine` | `boolean` | `false` | - | 是否单行显示（固定高度场景下启用，需配合 fixedHeight 使用） |
| `fixedHeight` | `number` | - | - | 固定高度（用于计算分段，单位 px） |
| `autoSegment` | `boolean` | `false` | - | 是否自动分段（文字过长时分多段轮播显示） |
| `segmentDuration` | `number` | `3000` | - | 每段显示时长（毫秒） |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `loaded` | `SubtitleCue[]` | 字幕加载完成，返回所有字幕条目 |
| `error` | `Error` | 字幕加载失败，返回错误信息 |
| `change` | `SubtitleCue \| null` | 当前字幕变化，返回当前字幕条目和索引（null 表示无字幕） |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | - |

## 类型定义

### SubtitleCue

```typescript
interface SubtitleCue {
  id?: string;
  startTime: number;  // 开始时间（秒）
  endTime: number;    // 结束时间（秒）
  text: string;       // 字幕文本
  data?: Record<string, unknown>;  // 扩展数据
}
```

### SubtitleSource

```typescript
type SubtitleSource =
  | { type: 'url'; url: string; format?: SubtitleFormat }
  | { type: 'text'; content: string; format: SubtitleFormat }
  | { type: 'cues'; cues: SubtitleCue[] };
```

### SubtitleFormat

```typescript
type SubtitleFormat = 'vtt' | 'srt' | 'json' | 'sbv' | 'ass';
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
