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
