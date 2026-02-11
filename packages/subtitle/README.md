# @aix/subtitle

Vue 3 字幕组件，支持多种字幕格式（VTT、SRT、JSON、SBV、ASS），可与视频播放器配合使用。

## ✨ 特性

- 支持多种字幕格式（VTT、SRT、JSON、SBV、ASS）
- 支持 URL、文本、数组三种数据来源
- 可配置显示位置（顶部、底部、居中）
- 支持自定义样式（字体大小、背景样式）
- 自动分段轮播（文字过长时）
- 单行/多行显示模式
- TypeScript 类型支持
- 轻量级实现

## 安装

```bash
pnpm add @aix/subtitle
```

## 快速开始

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

## API

### Props

| 属性 | 类型 | 默认值 | 必填 | 描述 |
|------|------|--------|:----:|------|
| source | `SubtitleSource` | - | ❌ | 字幕来源 |
| currentTime | `number` | - | ❌ | 当前播放时间（秒），用于外部控制 |
| visible | `boolean` | `true` | ❌ | 是否显示字幕 |
| position | `'top' \| 'bottom' \| 'center'` | `'bottom'` | ❌ | 字幕位置 |
| fontSize | `number \| string` | - | ❌ | 字体大小 |
| background | `'blur' \| 'solid' \| 'none'` | `'blur'` | ❌ | 背景样式 |
| maxWidth | `number \| string` | - | ❌ | 最大宽度 |
| singleLine | `boolean` | `false` | ❌ | 是否单行显示（固定高度场景） |
| fixedHeight | `number` | - | ❌ | 固定高度（用于计算分段，单位 px） |
| autoSegment | `boolean` | `false` | ❌ | 是否自动分段（文字过长时分多段轮播显示） |
| segmentDuration | `number` | `3000` | ❌ | 每段显示时长（毫秒） |

### SubtitleSource

字幕来源支持三种类型：

```typescript
// URL 来源
{ type: 'url', url: string, format?: SubtitleFormat }

// 文本来源
{ type: 'text', content: string, format: SubtitleFormat }

// 数组来源
{ type: 'cues', cues: SubtitleCue[] }
```

### SubtitleFormat

支持的字幕格式：`'vtt' | 'srt' | 'json' | 'sbv' | 'ass'`

### Events

| 事件名 | 参数 | 描述 |
|--------|------|------|
| loaded | `cues: SubtitleCue[]` | 字幕加载完成 |
| error | `error: Error` | 字幕加载失败 |
| change | `cue: SubtitleCue \| null, index: number` | 当前字幕变化 |

### Expose

组件暴露以下方法和状态：

| 属性/方法 | 类型 | 描述 |
|-----------|------|------|
| loading | `Ref<boolean>` | 是否正在加载 |
| error | `Ref<Error \| null>` | 加载错误 |
| getCues | `() => SubtitleCue[]` | 获取所有字幕条目 |
| getCurrentCue | `() => SubtitleCue \| null` | 获取当前字幕 |
| getCurrentIndex | `() => number` | 获取当前字幕索引 |
| getCueAtTime | `(time: number) => SubtitleCue \| null` | 根据时间获取字幕 |
| reload | `() => Promise<void>` | 重新加载字幕 |

## 使用示例

### 从 URL 加载

```vue
<template>
  <Subtitle
    :source="{ type: 'url', url: '/subtitles/video.vtt' }"
    :currentTime="currentTime"
  />
</template>
```

### 从文本加载

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

当字幕文本过长时，启用自动分段可以分多段轮播显示：

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

### 配合视频播放器使用

```vue
<template>
  <div class="player-container">
    <video
      ref="videoRef"
      :src="videoSrc"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
    />
    <Subtitle
      ref="subtitleRef"
      :source="subtitleSource"
      :currentTime="currentTime"
      :visible="showSubtitle"
      @loaded="onSubtitleLoaded"
      @change="onSubtitleChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Subtitle, type SubtitleCue, type SubtitleExpose } from '@aix/subtitle';
import '@aix/subtitle/style';

const videoRef = ref<HTMLVideoElement>();
const subtitleRef = ref<SubtitleExpose>();
const currentTime = ref(0);
const showSubtitle = ref(true);

const subtitleSource = {
  type: 'url' as const,
  url: '/subtitles/video.vtt',
};

const onTimeUpdate = () => {
  currentTime.value = videoRef.value?.currentTime ?? 0;
};

const onSubtitleLoaded = (cues: SubtitleCue[]) => {
  console.log('字幕加载完成，共', cues.length, '条');
};

const onSubtitleChange = (cue: SubtitleCue | null, index: number) => {
  console.log('当前字幕:', cue?.text, '索引:', index);
};
</script>
```

## 类型定义

```typescript
// 字幕条目
interface SubtitleCue {
  id?: string;
  startTime: number;  // 开始时间（秒）
  endTime: number;    // 结束时间（秒）
  text: string;       // 字幕文本
  data?: Record<string, unknown>;  // 扩展数据
}

// 字幕格式
type SubtitleFormat = 'vtt' | 'srt' | 'json' | 'sbv' | 'ass';

// 字幕来源
type SubtitleSource =
  | { type: 'url'; url: string; format?: SubtitleFormat }
  | { type: 'text'; content: string; format: SubtitleFormat }
  | { type: 'cues'; cues: SubtitleCue[] };
```

## License

MIT
