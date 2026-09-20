---
title: Audio 语音
outline: deep
---

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { AudioPlayer, WaveformCanvas, Recorder, useWaveform } from '@aix/audio'

const SAMPLE_RATE = 22050
const NOTES = [261.63, 329.63, 392.0, 523.25]

function synthesizeSamples() {
  const samples = new Float32Array(SAMPLE_RATE * NOTES.length)
  NOTES.forEach((freq, n) => {
    for (let i = 0; i < SAMPLE_RATE; i++) {
      const t = i / SAMPLE_RATE
      const envelope = Math.min(1, t * 20) * Math.exp(-t * 3)
      samples[n * SAMPLE_RATE + i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.6
    }
  })
  return samples
}

function encodeWav(samples) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([view.buffer], { type: 'audio/wav' })
}

function toWaveform(samples, bars = 80) {
  const size = Math.floor(samples.length / bars)
  const rms = Array.from({ length: bars }, (_, b) =>
    Math.sqrt(samples.slice(b * size, (b + 1) * size).reduce((sum, s) => sum + s * s, 0) / size),
  )
  const peak = Math.max(...rms) || 1
  return rms.map((v) => v / peak)
}

const toneBlob = ref(null)
const toneWaveform = ref([])
const playerLog = ref([])
const log = (msg) => { playerLog.value = [msg, ...playerLog.value].slice(0, 5) }

onMounted(() => {
  const samples = synthesizeSamples()
  toneBlob.value = encodeWav(samples)
  toneWaveform.value = toWaveform(samples)
})

const speechShape = Array.from({ length: 80 }, (_, i) =>
  Math.abs(Math.sin(i * 0.25)) * Math.exp(-(((i - 40) / 20) ** 2)) * 0.9 + 0.05,
)
const waveProgress = ref(0.35)

const waveform = useWaveform()
const recorder = ref(null)
const isRecording = ref(false)
const recordError = ref('')
const recording = ref(null)
const recordedWaveform = ref([])

async function startRecord() {
  recordError.value = ''
  recording.value = null
  const rec = new Recorder({ maxDuration: 15 }, {
    onStop: (result) => {
      recording.value = result
      recordedWaveform.value = waveform.fullSnapshot(80)
      waveform.stopCapture()
      rec.destroy()
      recorder.value = null
      isRecording.value = false
    },
    onError: (err) => { recordError.value = err.message; isRecording.value = false },
  })
  try {
    await rec.init()
    rec.start()
    waveform.startCapture(rec.getMediaStream())
    recorder.value = rec
    isRecording.value = true
  } catch (err) {
    recordError.value = err instanceof Error ? err.message : String(err)
  }
}

onUnmounted(() => recorder.value?.destroy())
</script>

<style>
.audio-demo { display: flex; flex-direction: column; gap: 12px; }
.audio-demo__card {
  width: 100%;
  max-width: 420px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}
.audio-demo__row { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--vp-c-text-2); }
.audio-demo__row input[type='range'] { flex: 1; }
.audio-demo__log { min-height: 20px; font-family: var(--vp-font-family-mono); font-size: 12px; color: var(--vp-c-text-2); }
.audio-demo__error { font-size: 12px; color: var(--aix-colorError); }
</style>

# Audio 语音

Vue 3 语音 SDK：ASR 语音识别、TTS 语音合成、录音管理与波形可视化。所有能力都以 Composable 形式提供（`useSpeech` / `useASR` / `useTTS` / `useWaveform`），另附 `AudioPlayer`、`WaveformCanvas` 两个开箱即用的 UI 组件。ASR / TTS 通过适配器接入浏览器原生、阿里云或自建代理，也可以继承 `BaseASRAdapter` / `BaseTTSAdapter` 接入其他供应商。

## 何时使用

- 对话式 AI 产品里「按住说话 → 实时上屏识别文本 → 朗读回复」的闭环，用 `useSpeech` 一个入口协调录音、识别与合成
- 只需要语音输入或只需要朗读文字的场景，分别用 `useASR` / `useTTS`
- 消息列表里回放一段语音、展示波形与进度，用 `AudioPlayer`；自建播放器只借用波形渲染，用 `WaveformCanvas`

## 安装

```bash
pnpm add @aix/audio
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/audio/style';
import '@aix/theme/style';
```

## 代码演示

### AudioPlayer 基础用法

`src` 接受 URL 或 `Blob`，`waveform` 传 0-1 归一化的数据点即可在进度条上方画出波形。播放按钮带随状态变化的 `aria-label`，进度条是可聚焦的 `role="slider"`：`←` / `→` 前后跳 5 秒，`Home` / `End` 跳到首尾，`空格` / `Enter` 播放或暂停。下面这段 4 秒音频是页面挂载后在浏览器里合成的 WAV，波形数据由同一份采样按 80 段 RMS 计算得出。

<ClientOnly>
<div class="demo-block audio-demo">
  <div class="audio-demo__card">
    <AudioPlayer v-if="toneBlob" :src="toneBlob" :waveform="toneWaveform" @play="log('play')" @pause="log('pause')" @ended="log('ended')" @error="(e) => log('error: ' + e.message)" />
  </div>
  <div class="audio-demo__log">{{ playerLog.join(' · ') || '事件日志：点击播放试试' }}</div>
</div>
</ClientOnly>

```vue
<template>
  <AudioPlayer :src="audioUrl" :waveform="waveform" @ended="onEnded" @error="onError" />
</template>

<script setup lang="ts">
import { AudioPlayer } from '@aix/audio';

const audioUrl = '/audio/reply.mp3';
const waveform: number[] = [0.2, 0.5, 0.8, 0.3, 0.6, 0.9, 0.4];
function onEnded() {}
function onError(error: Error) {}
</script>
```

### 波形 WaveformCanvas

波形渲染原语。`width` 为 0 时用 ResizeObserver 铺满父容器，按设备像素比渲染；`progress` 决定激活色与未激活色的分界；`data` 多于可容纳的柱数时均匀降采样，少于时右对齐；`data` 为空渲染静态占位波形。

<ClientOnly>
<div class="demo-block audio-demo">
  <div class="audio-demo__card">
    <WaveformCanvas :data="speechShape" :progress="waveProgress" :height="48" :bar-width="3" :bar-gap="2" />
  </div>
  <div class="audio-demo__row">
    <span>progress</span>
    <input type="range" min="0" max="1" step="0.01" v-model.number="waveProgress" />
    <code>{{ waveProgress.toFixed(2) }}</code>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <WaveformCanvas :data="points" :progress="progress" :height="48" :bar-width="3" :bar-gap="2" active-color="var(--aix-colorPrimary)" inactive-color="var(--aix-colorFillSecondary)" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { WaveformCanvas } from '@aix/audio';

const points = ref<number[]>([]);
const progress = ref(0);
</script>
```

### 录音

`useSpeech` 内部由 `AudioSourceHub` 统一持有一路 `getUserMedia` 与一个 `AudioContext`，同时供给录音器、波形分析和流式 ASR。`stopRecording()` 返回 `RecordingResult`，其中 `blob` 可直接交给 `AudioPlayer` 回放，`url` 是仅当前会话有效的 ObjectURL。达到 `recorder.maxDuration` 或静音超过 `asr.maxSilenceDuration` 会自动停止，停止后可通过 `reachedMaxDuration` / `reachedSilenceTimeout` 区分原因；暂停时段不计入时长。

下面的演示只用到底层的 `Recorder` 与 `useWaveform`，点击按钮后才申请麦克风，最长录 15 秒，停止后用 `AudioPlayer` 回放并展示完整波形快照。

<ClientOnly>
<div class="demo-block audio-demo">
  <div class="audio-demo__card">
    <WaveformCanvas :data="waveform.points.value" :height="40" />
  </div>
  <div class="audio-demo__row">
    <button type="button" v-if="!isRecording" @click="startRecord">开始录音</button>
    <button type="button" v-else @click="recorder?.stop()">停止录音</button>
    <span v-if="isRecording">录音中…</span>
    <span v-else-if="recording">时长 {{ recording.duration.toFixed(1) }}s · {{ recording.mimeType }}</span>
  </div>
  <div v-if="recordError" class="audio-demo__error">{{ recordError }}</div>
  <div v-if="recording" class="audio-demo__card">
    <AudioPlayer :src="recording.blob" :waveform="recordedWaveform" />
  </div>
</div>
</ClientOnly>

```vue
<template>
  <button type="button" @click="isRecording ? stopRecording() : startRecording()">
    {{ isRecording ? `停止 ${formattedDuration}` : '开始录音' }}
  </button>
  <WaveformCanvas :data="waveformData" :height="40" />
  <AudioPlayer v-if="recordingResult" :src="recordingResult.blob" :waveform="recordingResult.waveform" />
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { AudioPlayer, WaveformCanvas, useSpeech } from '@aix/audio';

const { isRecording, formattedDuration, waveformData, recordingResult, reachedSilenceTimeout, startRecording, stopRecording } =
  useSpeech({
    asr: { provider: 'browser', language: 'zh-CN', maxSilenceDuration: 3 },
    recorder: { maxDuration: 60 },
    vad: { threshold: 10 },
  });

watch(isRecording, (recording) => {
  if (!recording && reachedSilenceTimeout.value) console.log('检测到长时间静音');
});
</script>
```

### 语音识别 ASR

识别结果分两路：`finalText` 是已确认的文本（追加模式），`interimText` 是随时会被覆盖的中间结果，`displayText` 把两者拼起来直接上屏。录音与识别相互独立：ASR 连接失败只写入 `asrError`，录音照常进行。ASR 需要后端参与，这里不做活演示。

供应商与鉴权模式按「密钥放在哪」选择：

| `provider` | `auth.mode`   | 前端需要的配置     | 适用场景                                                                       |
| ---------- | ------------- | ------------------ | ------------------------------------------------------------------------------ |
| `browser`  | 不需要        | 无                 | 浏览器原生 `SpeechRecognition`，无后端；兼容性受浏览器限制，常作为降级兜底    |
| `aliyun`   | `token-proxy` | `tokenEndpoint`    | 推荐。前端不持有密钥，连接前 `POST tokenEndpoint` 换取短期 token 后直连阿里云 |
| `aliyun`   | `direct`      | `token` + `appKey` | 业务层已有拿 token 的通道，由业务层取好后传入                                 |
| `proxy`    | `ws-proxy`    | `wsEndpoint`       | 自建统一网关，浏览器只推 PCM，鉴权、供应商选择全部在网关完成                   |

`token-proxy` 模式下后端接口返回 `{ token, wsUrl?, appKey? }`，给出 `wsUrl` 时直接用它建连。流式适配器（`aliyun` / `proxy`）建连期间的音频会先缓存 3 秒并在连上后补发，避免第一句话丢字。只需要识别、不需要录音管理时用 `useASR`，配合 `AudioSourceHub` 自行注入音源。

```vue
<template>
  <button type="button" @click="isRecording ? stopRecording() : startRecording()">
    {{ isRecording ? '停止' : '按住说话' }}
  </button>
  <p>{{ displayText }}</p>
  <p v-if="asrDidFallback">当前已降级到浏览器原生识别</p>
</template>

<script setup lang="ts">
import { useSpeech } from '@aix/audio';

const { displayText, isRecording, asrError, asrDidFallback, startRecording, stopRecording } =
  useSpeech({
    asr: {
      provider: 'aliyun',
      auth: { mode: 'token-proxy', tokenEndpoint: '/api/asr/token' },
      sampleRate: 16000,
      language: 'zh-CN',
    },
    fallback: { asr: 'browser' },
  });
</script>
```

### 语音合成 TTS

`speak(text, options)` 返回的 Promise 在播放结束时 resolve；`isPlaying` / `state` 反映播放状态。三种供应商：`browser` 走 `SpeechSynthesis` 无需后端；`aliyun` 走后端 WebSocket 代理（`wsEndpoint` 必填），后端下发可独立解码的音频分片并以 `{ type: 'end' }` 收尾；`proxy` 走 HTTP REST（`endpoint`），后端直接返回音频流。在 `useSpeech` 里同时配置 `tts` 与 `fallback.tts: 'browser'`，供应商失败时自动降级到浏览器原生朗读，`ttsDidFallback` 置为 `true`。

```vue
<template>
  <button type="button" :disabled="isPlaying" @click="speak(text, { rate: 1.1, volume: 0.9 })">朗读</button>
  <button type="button" @click="stop">停止</button>
</template>

<script setup lang="ts">
import { useTTS } from '@aix/audio';

const text = '你好，欢迎使用语音 SDK。';

const { isPlaying, error, speak, stop } = useTTS({
  provider: 'aliyun',
  wsEndpoint: 'wss://your-backend/tts',
  defaultVoice: 'aixia',
  userNid: 'user-001',
  assistantNid: 'assistant-001',
});
</script>
```

## 主题变量定制

`AudioPlayer` 的颜色变量是一条回退链：先读组件级变量，未设置时读 `@aix/theme` 的语义 token，token 也缺失时才落到兜底色。不覆盖任何东西时播放器已经跟随主题明暗切换。

| 变量                             | 回退到                      | 用途                               |
| -------------------------------- | --------------------------- | ---------------------------------- |
| `--aix-audio-player-btn-bg`      | `--aix-colorPrimary`        | 播放按钮背景                       |
| `--aix-audio-player-track-bg`    | `--aix-colorFillTertiary`   | 进度条轨道背景                     |
| `--aix-audio-player-progress-bg` | `--aix-colorPrimary`        | 进度条已播放部分                   |
| `--aix-audio-player-time-color`  | `--aix-colorTextTertiary`   | 时间文字                           |
| `--aix-waveform-active`          | `--aix-colorPrimary`        | 波形已播放部分（`WaveformCanvas`） |
| `--aix-waveform-inactive`        | `--aix-colorTextQuaternary` | 波形未播放部分（`WaveformCanvas`） |

需要让播放器脱离主题单独换色时，优先指向另一个语义 token 而不是写死色值：

```css
.my-player {
  --aix-audio-player-btn-bg: var(--aix-colorSuccess);
  --aix-waveform-active: var(--aix-colorSuccess);
}
```

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

**WaveformCanvas** — WaveformCanvas - 波形可视化组件
接收归一化波形数据点（0-1），用 Canvas 绘制条形波形
样式通过 CSS Variables 完全暴露，消费方可覆盖

### WaveformCanvas Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `data` | `number[]` | `[]` | - | 波形数据点（0-1 归一化） |
| `progress` | `number` | `0` | - | 播放进度（0-1） |
| `width` | `number` | `0` | - | 画布宽度，0 表示自适应父容器 |
| `height` | `number` | `32` | - | 画布高度（px） |
| `barGap` | `number` | `4` | - | 柱间间距（px） |
| `barWidth` | `number` | `2` | - | 柱宽（px） |
| `inactiveColor` | `string` | `'var(--aix-waveform-inactive, var(--aix-colorTextQuaternary, #c9cdd4))'` | - | 未激活颜色（支持 CSS 变量语法） |
| `activeColor` | `string` | `'var(--aix-waveform-active, var(--aix-colorPrimary, #1677ff))'` | - | 激活颜色（支持 CSS 变量语法） |

---

**AudioPlayer** — AudioPlayer - 轻量音频播放器组件
支持波形可视化和进度控制，样式通过 CSS Variables 完全暴露

### AudioPlayer Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `src` | `string \| Blob` | - | ✅ | 音频 URL 或 Blob |
| `waveform` | `number[]` | `[]` | - | 波形数据点（0-1 归一化），为空则不画波形 |
| `showWaveform` | `boolean` | `true` | - | 是否显示波形，默认 true |
| `autoplay` | `boolean` | `false` | - | 是否自动播放，默认 false |

### AudioPlayer Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `play` | - | 开始播放 |
| `pause` | - | 暂停 |
| `ended` | - | 播放结束 |
| `timeupdate` | `time: number` | 播放进度更新，参数为当前时间（秒） |
| `error` | `error: Error` | 加载或播放失败（含自动播放被浏览器拦截） |

## 类型定义

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

```typescript
/** ASR 状态机 */
export type ASRState =
  | 'idle' // 空闲
  | 'connecting' // 连接中
  | 'ready' // 已连接，准备录音
  | 'recording' // 录音中
  | 'paused' // 已暂停
  | 'stopped' // 已停止
  | 'error' // 错误
  | 'reconnecting';

/** ASR 识别结果 */
export interface ASRResult {
  /** 识别文本 */
  text: string;
  /** 是否最终结果（false = 中间结果） */
  isFinal: boolean;
  /** 置信度 0-1 */
  confidence?: number;
  /** 时间戳 */
  timestamp?: number;
}

/** ASR 鉴权配置 */
export interface ASRAuthConfig {
  /** 代理模式 */
  mode: 'token-proxy' | 'ws-proxy' | 'direct';
  /** Token 代理端点（mode=token-proxy，后端签名后返回 wsUrl） */
  tokenEndpoint?: string;
  /** WebSocket 代理端点（mode=ws-proxy，全链路透传） */
  wsEndpoint?: string;
  /** 直连密钥（mode=direct） */
  appKey?: string;
  appSecret?: string;
  /**
   * 直接传入的 Token（aliyun 直连模式）
   * 由外部调用业务层 getAliToken 后传入，适配器本身不依赖 API 层
   */
  token?: string;
}

/** ASR 配置选项 */
export interface ASROptions {
  /** 供应商 */
  provider: 'browser' | 'iflytek' | 'aliyun' | 'tencent' | 'proxy';
  /** 鉴权配置 */
  auth?: ASRAuthConfig;
  /** 采样率（Hz），默认 16000 */
  sampleRate?: number;
  /** 语言代码，默认 zh-CN */
  language?: string;
  /** 是否启用中间结果，默认 true */
  enableInterimResults?: boolean;
  /**
   * 最大静音时长（秒）
   * 配置后 `useSpeech` 会启用 VAD 静音检测，持续静音达到该时长自动停止录音。
   * 不配置则不启用检测。
   */
  maxSilenceDuration?: number;
}

/** TTS 状态机 */
export type TTSState =
  | 'idle' // 空闲
  | 'loading' // 加载中
  | 'playing' // 播放中
  | 'paused' // 已暂停
  | 'error';

/** TTS 播放选项 */
export interface TTSOptions {
  /** 音色 */
  voice?: string;
  /** 语速（0.5-2） */
  rate?: number;
  /** 音调（0.5-2） */
  pitch?: number;
  /** 音量（0-1） */
  volume?: number;
}

/** TTS 供应商配置 */
export interface TTSProviderOptions {
  /** 供应商 */
  provider: 'browser' | 'iflytek' | 'aliyun' | 'proxy';
  /** 后端端点（proxy 模式：HTTP REST 接口） */
  endpoint?: string;
  /**
   * 阿里云 WebSocket TTS 专用：后端 WebSocket 代理地址
   * provider='aliyun' 时必填，不在组件库中硬编码
   */
  wsEndpoint?: string;
  /** 默认音色 */
  defaultVoice?: string;
  /** 阿里云 TTS：用户 nid */
  userNid?: string;
  /** 阿里云 TTS：助手 nid */
  assistantNid?: string;
  /** 阿里云 TTS：音色类型 */
  ttsVoiceType?: string;
}

/** 录音配置 */
export interface RecorderConfig {
  /** 采样率（Hz），默认 16000 */
  sampleRate?: number;
  /** 声道数，默认 1 */
  channels?: number;
  /** 最大录音时长（秒），默认 60。达到后自动停止并触发 onMaxDuration */
  maxDuration?: number;
  /** MIME 类型，空字符串时自动检测 */
  mimeType?: string;
}

/** 录音结果 */
export interface RecordingResult {
  /** 音频 Blob */
  blob: Blob;
  /** 音频临时 URL（仅当前会话有效，持久化请替换为 OSS 地址） */
  url: string;
  /** 时长（秒） */
  duration: number;
  /** 波形数据（0-1 归一化，由外部波形分析器填充） */
  waveform: number[];
  /** MIME 类型 */
  mimeType: string;
}

/** 波形数据 */
export interface WaveformData {
  /** 数据点（0-1） */
  points: number[];
  /** 当前进度（0-1） */
  progress: number;
  /** 是否播放中 */
  isPlaying: boolean;
}

/** VAD 配置 */
export interface VADConfig {
  /** 能量阈值（0-100），默认 10 */
  threshold?: number;
  /** 静音判定时长（毫秒），默认 1500 */
  silenceDuration?: number;
  /** 采样间隔（毫秒），默认 100 */
  sampleInterval?: number;
}

/** VAD 事件 */
export interface VADEvent {
  /** 是否静音 */
  isSilent: boolean;
  /** 当前能量值（0-100） */
  energy: number;
  /** 时间戳 */
  timestamp: number;
}

/** Speech SDK 完整配置 */
export interface SpeechConfig {
  /** ASR 配置 */
  asr?: ASROptions;
  /** TTS 配置 */
  tts?: TTSProviderOptions;
  /** 录音配置 */
  recorder?: RecorderConfig;
  /** VAD 静音检测配置（需同时设置 asr.maxSilenceDuration 才会启用） */
  vad?: VADConfig;
  /**
   * 降级策略：供应商连接失败时自动切换到浏览器原生实现
   * 降级后 `didFallback` 会置为 true
   */
  fallback?: {
    /** ASR 失败时降级到浏览器原生 */
    asr?: 'browser';
    /** TTS 失败时降级到浏览器原生 */
    tts?: 'browser';
  };
}
```
