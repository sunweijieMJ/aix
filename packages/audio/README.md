# @aix/audio

Vue 3 语音 SDK：ASR 语音识别、TTS 语音合成、录音、波形可视化。提供 Headless Composable 和开箱即用 UI 组件，支持浏览器原生、阿里云、代理等多种供应商。

## 特性

- 🎙️ **ASR 语音识别**：支持浏览器原生 / 阿里云 / WebSocket 代理，双 Buffer 结果（中间结果 + 最终结果）
- 🔊 **TTS 语音合成**：支持浏览器原生 / 阿里云 WebSocket / HTTP 代理
- 🎚️ **录音管理**：VAD 静音自动停止、最大时长控制、单一麦克风音源共享
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
  // 最大录音时长（秒），达到后自动停止，reachedMaxDuration 置为 true
  recorder: { maxDuration: 120 },
  // 供应商失败时降级到浏览器原生，降级后 asrDidFallback / ttsDidFallback 置为 true
  fallback: { asr: 'browser', tts: 'browser' },
});
```

### 自动停止：最大时长与静音检测

```typescript
const speech = useSpeech({
  asr: {
    provider: 'browser',
    // 持续静音 3 秒自动停止录音（不配置则不启用检测）
    // 计时自开始录音起算：用户全程没出声同样会在 3 秒后停止
    maxSilenceDuration: 3,
  },
  // 录音配置整体透传给 Recorder（maxDuration / mimeType / channels 等）
  // 最长录制 60 秒（useSpeech 不配置时默认 300 秒；直接用 Recorder 时默认 60 秒，0 表示不限时）
  recorder: { maxDuration: 60 },
  // 可选：调整静音判定灵敏度
  vad: { threshold: 10 },
});

// 停止后可区分是用户主动停止还是自动停止
watch(speech.isRecording, (recording) => {
  if (recording) return;
  if (speech.reachedMaxDuration.value) console.log('已达最大录音时长');
  if (speech.reachedSilenceTimeout.value) console.log('检测到长时间静音');
});
```

暂停期间不计入 `maxDuration` 配额，`duration` 与 `recordingResult.duration` 均为**净录音时长**（不含暂停时段）。

**行为约定**

- 录音与识别相互独立：ASR 连接失败只会写入 `asrError`，录音照常进行，`stopRecording()` 仍返回完整音频。
- 流式 ASR（`proxy` / `aliyun`）建连期间的音频会被缓存并在连上后补发，避免第一句话丢字。
- `stopRecording()` 未 resolve 前重新 `startRecording()` 是安全的：旧一轮的收尾不会释放新一轮的麦克风，
  被取代那轮的录音结果直接丢弃（其 ObjectURL 会自动撤销），其麦克风音轨照样归还。
- 等麦克风授权期间重复 `startRecording()` 也是安全的（授权弹窗期间按钮往往还没禁用）。
- ASR 建连未完成就 `stopRecording()` 时不会再启动识别，`state` 不会停留在 `recording`。

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
| `asrDidFallback` | `Ref<boolean>` | ASR 是否已降级到兜底供应商 |
| `ttsDidFallback` | `Ref<boolean>` | TTS 是否已降级到兜底供应商 |
| `isRecording` | `Ref<boolean>` | 是否录音中 |
| `isPaused` | `Ref<boolean>` | 是否已暂停 |
| `duration` | `Ref<number>` | 净录音时长（秒，不含暂停时段） |
| `reachedMaxDuration` | `Ref<boolean>` | 本轮是否因达到最大时长被自动停止 |
| `reachedSilenceTimeout` | `Ref<boolean>` | 本轮是否因静音超时被自动停止 |
| `isVoiceActive` | `Ref<boolean>` | VAD 判定的用户说话状态（需配置 `maxSilenceDuration`） |
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
| `setProvider(type, opts)` | `(type: 'asr' \| 'tts', opts) => Promise<void>` | 运行时切换供应商。ASR 需重新建连故返回 Promise；切换失败不抛出，错误经 `asrError` 暴露 |
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
| `didFallback` | `Ref<boolean>` | 是否已降级到兜底供应商 |
| `attachAudioSource(src)` | `(src: PCMAudioSource \| null) => void` | 注入共享音源，供需要外部推流的适配器使用（`internal` 适配器自动跳过） |
| `needsAudioSource()` | `() => boolean` | 当前适配器是否需要编排层推流（`audioSource !== 'internal'`） |
| `getAdapter()` | `() => ASRAdapter` | 获取底层适配器（高级场景逃生舱） |

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
| `getEnergy()` | `() => number` | 当前实时能量（0-1），供 VAD 使用 |
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
| `error` | `Error` | 加载或播放失败（含自动播放被浏览器拦截） |

**无障碍**

播放按钮带随状态变化的 `aria-label`；进度条是可聚焦的 `role="slider"`，支持键盘操作：

| 按键 | 行为 |
|------|------|
| `←` / `→` | 后退 / 前进 5 秒 |
| `Home` / `End` | 跳到开头 / 结尾 |
| `空格` / `Enter` | 播放 / 暂停 |

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
| `barWidth` | `number` | `2` | 柱宽（px） |
| `barGap` | `number` | `4` | 柱间间距（px） |
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

支持两种鉴权方式。

**方式一：Token 代理（推荐）** —— 前端不持有密钥，连接前向后端换取 token：

```typescript
useSpeech({
  asr: {
    provider: 'aliyun',
    auth: {
      mode: 'token-proxy',
      tokenEndpoint: '/api/asr/token',
    },
    sampleRate: 16000,
    language: 'zh-CN',
  },
});
```

后端 `POST /api/asr/token` 需返回：

```jsonc
{
  "token": "阿里云 NLS token",   // 必填（除非直接给 wsUrl）
  "wsUrl": "wss://...",          // 可选，指定后直接用它连接
  "appKey": "阿里云项目 appKey"  // 可选，用于 StartTranscription
}
```

**方式二：Token 直传** —— 业务层自行获取 token 后传入：

```typescript
useSpeech({
  asr: {
    provider: 'aliyun',
    auth: { mode: 'direct', token: '<业务层获取的 token>', appKey: 'xxx' },
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

**WebSocket 协议**

| 方向 | 内容 | 说明 |
|------|------|------|
| 上行 | `{ type: 'start', userNid, assistantNid, ttsVoiceType, messageId, segmentId, message }` | 开始合成 |
| 上行 | `{ type: 'stop' }` | 停止合成 |
| 下行 | `{ type: 'connecting_success' }` | 握手完成（10 秒内未收到视为超时） |
| 下行 | `ArrayBuffer` | 音频分片（握手后 20 秒内未收到任何音频，`speak()` 以超时报错结束） |
| 下行 | `{ type: 'end' }` | **音频已发完**（即使一个音频分片都没发，`speak()` 也会在 1.5 秒宽限期后正常结算，不会挂起） |

> ⚠️ 后端**应当**在音频发送完毕后下发结束信号（`end` / `finish` / `finished` /
> `synthesis_complete` / `complete` 均可识别）。没有该信号时，播放器只能靠"队列排空后静默
> 1.5 秒"来兜底判完——网络严重抖动时可能提前判定播放结束。
>
> ⚠️ 结束信号不带 `segmentId`，因此「本段还没收到任何音频就收到结束信号」这一种情况无法区分是
> **空合成**还是**上一段迟到的信号**：适配器会等 1.5 秒宽限期，期间有音频进来就按后者处理，
> 不会把新一段提前判完。连续多段合成时后端最好为每段新建连接，或在结束信号里回带 `segmentId`。
>
> ⚠️ 音频分片经 `decodeAudioData` 解码，**要求每个分片可独立解码**（如完整的 mp3 帧）。
> 若后端下发的是裸 PCM 或需要拼接才能解码的容器分片，需要另行适配。

### 自定义适配器

继承基类实现自定义 ASR 供应商。`BaseASRAdapter` 有 5 个抽象方法必须全部实现：

```typescript
import { BaseASRAdapter } from '@aix/audio';
import type { ASRAdapter, ASRAudioSourceMode, PCMAudioSource } from '@aix/audio';

class MyASRAdapter extends BaseASRAdapter implements ASRAdapter {
  // 声明音频来源，编排层据此决定是否推流（详见下节）
  readonly audioSource: ASRAudioSourceMode = 'external';

  private source: PCMAudioSource | null = null;
  private off: (() => void) | null = null;

  async connect(): Promise<void> {
    // 建立连接，完成后 this.setState('ready')
  }
  disconnect(): void {
    // 断开连接
  }
  start(): void {
    // 开始识别，并订阅编排层注入的音源
    this.off = this.source?.onPCM((frame) => this.upload(frame)) ?? null;
    this.setState('recording');
  }
  stop(): void {
    this.off?.();
    this.off = null;
    this.setState('stopped');
  }
  destroy(): void {
    this.disconnect();
    this.clearCallbacks();
  }

  attachAudioSource(source: PCMAudioSource | null): void {
    this.source = source;
  }
}
```

> **状态机约定**：`state` 由适配器通过 `this.setState()` 单向派发，Composable 只订阅不写入。
> 自定义适配器务必在 start/stop/error 时正确 `setState`，否则 UI 状态不会更新。

### 音频来源契约

`ASRAdapter.audioSource` 告诉编排层音频从哪来，`useSpeech` 据此决定是否推流：

| 取值 | 含义 | 内置适配器 |
|------|------|-----------|
| `internal` | 适配器内部自采麦克风，编排层不推流 | `BrowserASR` |
| `external` | 必须由编排层推送 PCM，否则收不到任何音频 | `ProxyASR` |
| `managed` | 可自采，也接受注入的共享音源（优先用注入的） | `AliyunASR` |

`useSpeech` 内部由 `AudioSourceHub` 统一持有**一路** `getUserMedia` 与**一个** `AudioContext`，
同时供给录音器、波形分析和流式 ASR，避免同一次录音重复占用麦克风。

**AudioSourceHub 配置**

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `sampleRate` | `number` | `16000` | 目标采样率。浏览器不接受该约束时（Safari 常见）内部自动重采样，`hub.sampleRate` 恒为此值，适配器据此向服务端申报 |
| `channels` | `number` | `1` | 声道数 |
| `prerollMs` | `number` | `0` | 预滚动缓冲时长。大于 0 时从 `init()` 起缓存音频，首个订阅者接入时补发，用于消除建连期间的丢字。`useSpeech` 对流式适配器默认启用 3000ms |

> `init()` 在等授权期间被 `destroy()` 时会 reject，并把迟到的音轨就地归还 —— 那一刻还没有音轨可停，
> 不补这一次归还，麦克风会一直活着（浏览器录音红点常亮）。

单独使用 `useASR` 时可自行注入：

```typescript
import { useASR, AudioSourceHub } from '@aix/audio';

const asr = useASR({ provider: 'proxy', auth: { mode: 'ws-proxy', wsEndpoint: 'wss://gw/asr' } });
// 建连期间的音频先缓存，接上后补发，避免第一句话丢字
const hub = new AudioSourceHub({ sampleRate: 16000, prerollMs: 3000 });

await hub.init();          // 唯一一次 getUserMedia
await asr.connect();
asr.attachAudioSource(hub); // external/managed 适配器自此开始收到音频
asr.startRecognition();

// 结束后
asr.stopRecognition();
hub.destroy();             // 释放麦克风
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
