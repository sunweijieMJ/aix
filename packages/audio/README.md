# @aix/audio

Vue 3 语音 SDK：ASR 语音识别、TTS 语音合成、录音、波形可视化。提供 Headless Composable 和开箱即用 UI 组件，支持浏览器原生、阿里云、代理等多种供应商。

## 特性

- 🎙️ **ASR 语音识别**：支持浏览器原生 / 阿里云 / WebSocket 代理，双 Buffer 结果（中间结果 + 最终结果）
- 🔊 **TTS 语音合成**：支持浏览器原生 / 阿里云 WebSocket / HTTP 代理
- 🎚️ **录音管理**：VAD 静音检测、重采样、最大时长控制
- 📊 **波形可视化**：实时录音波形 + 静态回放波形，Canvas 渲染
- 🧩 **Headless 优先**：所有能力均以 Composable 形式提供，UI 层完全可替换
- 🔌 **适配器架构**：可扩展的 ASR / TTS 适配器基类，方便接入自定义供应商
- 🎨 **CSS Variables 主题**：样式通过 CSS 变量完全暴露，无硬编码颜色
- 📦 **Tree-shakeable**：ESM / CJS 双格式，按需引用

## 安装

```bash
pnpm add @aix/audio
# 或
npm install @aix/audio
```

## 快速开始

### 统一入口：`useSpeech`

`useSpeech` 是最推荐的使用方式，它统一协调 ASR、TTS 和录音，适合"对话式"场景。

```vue
<script setup lang="ts">
import { useSpeech } from '@aix/audio';
import '@aix/audio/style';

const {
  // ASR 识别结果
  displayText,
  finalText,
  interimText,
  // 录音状态
  isRecording,
  formattedDuration,
  recordingResult,
  // 波形数据
  waveformData,
  waveformProgress,
  // 方法
  startRecording,
  stopRecording,
  speak,
} = useSpeech({
  asr: {
    provider: 'browser',
    language: 'zh-CN',
  },
  tts: {
    provider: 'browser',
  },
});
</script>

<template>
  <div>
    <button @click="startRecording">开始录音</button>
    <button @click="stopRecording">停止录音</button>
    <p>识别结果：{{ displayText }}</p>

    <button @click="speak('你好，世界！')">朗读文字</button>
  </div>
</template>
```

### UI 组件：`AudioPlayer`

```vue
<script setup lang="ts">
import { AudioPlayer } from '@aix/audio';
import '@aix/audio/style';
</script>

<template>
  <AudioPlayer
    src="https://example.com/audio.mp3"
    :waveform="waveformData"
    :show-waveform="true"
    @play="onPlay"
    @ended="onEnded"
  />
</template>
```

---

## Composables

### `useSpeech(config?)` — 统一入口

整合 ASR + TTS + 录音，推荐大多数场景使用。

```typescript
import { useSpeech } from '@aix/audio';

const speech = useSpeech({
  asr: {
    provider: 'aliyun',
    auth: { mode: 'token-proxy', tokenEndpoint: '/api/asr/token' },
    language: 'zh-CN',
  },
  tts: {
    provider: 'aliyun',
    wsEndpoint: 'wss://your-backend/tts',
  },
  // 供应商失败时降级到浏览器原生
  fallback: { asr: 'browser', tts: 'browser' },
});
```

**返回值**

| 属性 / 方法 | 类型 | 说明 |
|---|---|---|
| `state` | `Ref<ASRState>` | ASR 状态机 |
| `finalText` | `Ref<string>` | 已确认的识别文本 |
| `interimText` | `Ref<string>` | 实时中间结果（随时更新） |
| `displayText` | `ComputedRef<string>` | `finalText + interimText`，直接展示用 |
| `asrError` | `Ref<Error \| null>` | ASR 错误 |
| `ttsState` | `Ref<TTSState>` | TTS 状态机 |
| `ttsError` | `Ref<Error \| null>` | TTS 错误 |
| `isSpeaking` | `ComputedRef<boolean>` | TTS 是否正在播放 |
| `isRecording` | `Ref<boolean>` | 是否录音中 |
| `duration` | `Ref<number>` | 录音时长（秒） |
| `formattedDuration` | `ComputedRef<string>` | 格式化时长，如 `"01:23"` |
| `recordingResult` | `Ref<RecordingResult \| null>` | 录音结果（停止后填充） |
| `waveformData` | `Ref<number[]>` | 实时波形数据点（0-1） |
| `waveformProgress` | `Ref<number>` | 波形播放进度（0-1） |
| `startRecording()` | `() => Promise<void>` | 开始录音并启动 ASR |
| `stopRecording()` | `() => Promise<RecordingResult \| null>` | 停止录音，返回结果 |
| `pauseRecording()` | `() => void` | 暂停录音 |
| `resumeRecording()` | `() => void` | 恢复录音 |
| `resetRecording()` | `() => Promise<void>` | 重置所有录音状态 |
| `speak(text, opts?)` | `(text: string, opts?: TTSOptions) => Promise<void>` | TTS 朗读文字 |
| `pauseSpeaking()` | `() => void` | 暂停 TTS |
| `resumeSpeaking()` | `() => void` | 恢复 TTS |
| `stopSpeaking()` | `() => void` | 停止 TTS |
| `setProvider(type, opts)` | `(type: 'asr' \| 'tts', opts) => void` | 运行时切换供应商 |
| `setWaveformProgress(v)` | `(v: number) => void` | 设置波形进度（播放回放时使用） |
| `loadWaveform(data)` | `(data: number[]) => void` | 加载静态波形数据 |

---

### `useASR(options?)` — 单独使用 ASR

只需语音识别，不需要录音管理时使用。

```typescript
import { useASR } from '@aix/audio';

const {
  state, finalText, interimText, displayText, error,
  isIdle, isRecording,
  connect, startRecognition, stopRecognition, resetText,
  switchProvider,
} = useASR({
  provider: 'browser',
  language: 'zh-CN',
  enableInterimResults: true,
});

// 连接并开始识别
await connect();
startRecognition();

// 停止识别
stopRecognition();
```

**返回值**

| 属性 / 方法 | 类型 | 说明 |
|---|---|---|
| `state` | `Ref<ASRState>` | ASR 状态机 |
| `finalText` | `Ref<string>` | 已确认文本（追加模式） |
| `interimText` | `Ref<string>` | 中间结果（随时变化） |
| `displayText` | `ComputedRef<string>` | `finalText + interimText` |
| `error` | `Ref<Error \| null>` | 错误信息 |
| `isIdle` | `ComputedRef<boolean>` | 是否空闲 |
| `isRecording` | `ComputedRef<boolean>` | 是否识别中 |
| `connect()` | `() => Promise<void>` | 连接 ASR 服务 |
| `startRecognition()` | `() => void` | 开始识别 |
| `stopRecognition()` | `() => void` | 停止识别 |
| `resetText()` | `() => void` | 清空识别结果 |
| `switchProvider(opts)` | `(opts: ASROptions) => Promise<void>` | 切换 ASR 供应商 |

---

### `useTTS(options?)` — 单独使用 TTS

```typescript
import { useTTS } from '@aix/audio';

const {
  state, error, currentText,
  isIdle, isPlaying, isLoading,
  speak, pause, resume, stop, switchProvider,
} = useTTS({
  provider: 'browser',
  defaultVoice: 'zh-CN-XiaoxiaoNeural',
});

await speak('你好，世界！', { rate: 1.2, volume: 0.8 });
```

**返回值**

| 属性 / 方法 | 类型 | 说明 |
|---|---|---|
| `state` | `Ref<TTSState>` | TTS 状态机 |
| `error` | `Ref<Error \| null>` | 错误信息 |
| `currentText` | `Ref<string>` | 当前正在朗读的文本 |
| `isIdle` | `ComputedRef<boolean>` | 是否空闲 |
| `isPlaying` | `ComputedRef<boolean>` | 是否播放中 |
| `isLoading` | `ComputedRef<boolean>` | 是否加载中 |
| `speak(text, opts?)` | `(text: string, opts?: TTSOptions) => Promise<void>` | 朗读文字 |
| `pause()` | `() => void` | 暂停 |
| `resume()` | `() => void` | 恢复 |
| `stop()` | `() => void` | 停止 |
| `switchProvider(opts)` | `(opts: TTSProviderOptions) => void` | 切换 TTS 供应商 |

---

### `useWaveform()` — 波形数据管理

```typescript
import { useWaveform } from '@aix/audio';

const {
  points, progress, isCapturing, hasData,
  startCapture, stopCapture,
  setProgress, snapshot, fullSnapshot, loadStatic, reset,
} = useWaveform();

// 录音时接入 MediaStream
startCapture(mediaStream);

// 停止后获取完整波形快照（用于回放）
const waveformData = fullSnapshot(80);
```

**返回值**

| 属性 / 方法 | 类型 | 说明 |
|---|---|---|
| `points` | `Ref<number[]>` | 当前波形点（滚动窗口，最多 80 点） |
| `progress` | `Ref<number>` | 播放进度（0-1） |
| `isCapturing` | `Ref<boolean>` | 是否采集中 |
| `hasData` | `ComputedRef<boolean>` | 是否有波形数据 |
| `startCapture(stream)` | `(stream: MediaStream) => void` | 开始从 MediaStream 采集波形 |
| `stopCapture()` | `() => void` | 停止采集 |
| `setProgress(v)` | `(v: number) => void` | 设置进度（0-1） |
| `snapshot()` | `() => number[]` | 当前窗口快照 |
| `fullSnapshot(barCount?)` | `(barCount?: number) => number[]` | 完整录音降采样快照，默认 80 点 |
| `loadStatic(data)` | `(data: number[]) => void` | 加载外部波形数据 |
| `reset()` | `() => void` | 重置所有状态 |

---

## UI 组件

### `AudioPlayer`

轻量音频播放器，内置波形可视化和进度控制，无额外图标依赖。

```vue
<template>
  <AudioPlayer
    :src="audioUrl"
    :waveform="waveformData"
    :show-waveform="true"
    :autoplay="false"
    @play="onPlay"
    @pause="onPause"
    @ended="onEnded"
    @timeupdate="onTimeUpdate"
  />
</template>

<script setup lang="ts">
import { AudioPlayer } from '@aix/audio';

const audioUrl = 'https://example.com/audio.mp3';
const waveformData = [0.2, 0.5, 0.8, 0.3, 0.6, 0.9, 0.4]; // 0-1 归一化
</script>
```

**Props**

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `src` | `string \| Blob` | - | ✅ | 音频来源（URL 或 Blob） |
| `waveform` | `number[]` | `[]` | - | 波形数据（0-1 归一化），由 `useWaveform.fullSnapshot()` 获取 |
| `showWaveform` | `boolean` | `true` | - | 是否显示波形 |
| `autoplay` | `boolean` | `false` | - | 是否自动播放 |

**Events**

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `play` | - | 开始播放 |
| `pause` | - | 暂停播放 |
| `ended` | - | 播放结束 |
| `timeupdate` | `number` | 播放进度更新，返回当前时间（秒） |

---

### `WaveformCanvas`

波形渲染原语组件，可独立使用或嵌入自定义播放器。

```vue
<template>
  <WaveformCanvas
    :data="waveformData"
    :progress="0.4"
    :height="48"
    :bar-width="3"
    :bar-gap="2"
    active-color="var(--aix-colorPrimary)"
    inactive-color="var(--aix-colorFillSecondary)"
  />
</template>

<script setup lang="ts">
import { WaveformCanvas } from '@aix/audio';
</script>
```

**Props**

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `data` | `number[]` | `[]` | 波形数据点（0-1 归一化） |
| `progress` | `number` | `0` | 播放进度（0-1），控制激活颜色的覆盖范围 |
| `width` | `number` | `0` | 画布宽度（px），`0` 表示自适应父容器 |
| `height` | `number` | `32` | 画布高度（px） |
| `barWidth` | `number` | `3` | 柱宽（px） |
| `barGap` | `number` | `2` | 柱间间距（px） |
| `activeColor` | `string` | `var(--aix-colorPrimary)` | 已播放部分颜色 |
| `inactiveColor` | `string` | `var(--aix-colorFillSecondary)` | 未播放部分颜色 |

---

## 适配器

适配器架构允许灵活切换 ASR / TTS 供应商，也可继承基类实现自定义适配器。

### ASR 适配器

| 适配器 | Provider 值 | 说明 |
|--------|-------------|------|
| `BrowserASR` | `'browser'` | 浏览器原生 `SpeechRecognition`，无需后端 |
| `AliyunASR` | `'aliyun'` | 阿里云实时语音识别（WebSocket） |
| `ProxyASR` | `'proxy'` | WebSocket 全链路透传代理 |

#### 阿里云 ASR 配置

```typescript
useSpeech({
  asr: {
    provider: 'aliyun',
    auth: {
      // Token 代理模式：前端请求后端签名，后端返回含 wsUrl 的 token
      mode: 'token-proxy',
      tokenEndpoint: '/api/asr/token',
    },
    sampleRate: 16000,
    language: 'zh-CN',
  },
});
```

#### 代理模式（统一网关）

```typescript
useSpeech({
  asr: {
    provider: 'proxy',
    auth: {
      mode: 'ws-proxy',
      wsEndpoint: 'wss://your-gateway/asr',
    },
  },
});
```

### TTS 适配器

| 适配器 | Provider 值 | 说明 |
|--------|-------------|------|
| `BrowserTTS` | `'browser'` | 浏览器原生 `SpeechSynthesis`，无需后端 |
| `AliyunTTS` | `'aliyun'` | 阿里云语音合成（WebSocket） |
| `ProxyTTS` | `'proxy'` | HTTP REST 代理（后端返回音频流） |

#### 阿里云 TTS 配置

```typescript
useSpeech({
  tts: {
    provider: 'aliyun',
    wsEndpoint: 'wss://your-backend/tts',
    defaultVoice: 'aixia', // 默认音色
    userNid: 'user-001',
    assistantNid: 'assistant-001',
    ttsVoiceType: 'standard',
  },
});
```

### 自定义适配器

继承基类实现自定义 ASR 供应商：

```typescript
import { BaseASRAdapter } from '@aix/audio';
import type { ASRAdapter } from '@aix/audio';

class MyASRAdapter extends BaseASRAdapter implements ASRAdapter {
  async connect(): Promise<void> {
    // 建立连接
  }
  start(): void {
    // 开始识别
  }
  stop(): void {
    // 停止识别
  }
}
```

---

## 全局注册（Vue 插件）

```typescript
import { createApp } from 'vue';
import AudioPlugin from '@aix/audio';
import '@aix/audio/style';
import App from './App.vue';

const app = createApp(App);
app.use(AudioPlugin);
// 注册后可直接使用 <AixAudioPlayer> 和 <AixWaveformCanvas>
app.mount('#app');
```

---

## 主题定制

组件暴露以下 CSS 变量，可在业务侧覆盖：

```css
:root {
  /* AudioPlayer 按钮背景色，默认读取 --aix-colorPrimary */
  --aix-audio-player-btn-bg: #1677ff;
  /* 进度条轨道背景色 */
  --aix-audio-player-track-bg: #f0f0f0;
  /* 进度条激活色 */
  --aix-audio-player-progress-bg: #1677ff;
  /* 时间文字颜色 */
  --aix-audio-player-time-color: rgba(0, 0, 0, 0.45);
}
```

---

## 类型定义

```typescript
// ASR 状态机
type ASRState = 'idle' | 'connecting' | 'ready' | 'recording' | 'paused' | 'stopped' | 'error' | 'reconnecting';

// TTS 状态机
type TTSState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

// ASR 配置
interface ASROptions {
  provider: 'browser' | 'iflytek' | 'aliyun' | 'tencent' | 'proxy';
  auth?: ASRAuthConfig;
  sampleRate?: number;       // 默认 16000
  language?: string;         // 默认 zh-CN
  enableInterimResults?: boolean; // 默认 true
  maxSilenceDuration?: number;
}

// TTS 供应商配置
interface TTSProviderOptions {
  provider: 'browser' | 'iflytek' | 'aliyun' | 'proxy';
  endpoint?: string;       // proxy 模式 HTTP 端点
  wsEndpoint?: string;     // aliyun WebSocket 代理地址
  defaultVoice?: string;
}

// TTS 播放选项
interface TTSOptions {
  voice?: string;
  rate?: number;    // 0.5-2
  pitch?: number;   // 0.5-2
  volume?: number;  // 0-1
}

// 录音结果
interface RecordingResult {
  blob: Blob;
  url: string;        // 临时 ObjectURL，页面关闭后失效
  duration: number;   // 录音时长（秒）
  waveform: number[]; // 波形数据（0-1）
  mimeType: string;
}

// Speech SDK 顶层配置
interface SpeechConfig {
  asr?: ASROptions;
  tts?: TTSProviderOptions;
  fallback?: {
    asr?: 'browser';
    tts?: 'browser';
  };
}
```
