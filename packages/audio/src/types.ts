/**
 * @aix/audio 类型定义
 * 覆盖 ASR、TTS、音频处理、组件 Props/Emits
 */

// ============================================================================
// ASR（语音识别）类型
// ============================================================================

/** ASR 状态机 */
export type ASRState =
  | 'idle' // 空闲
  | 'connecting' // 连接中
  | 'ready' // 已连接，准备录音
  | 'recording' // 录音中
  | 'paused' // 已暂停
  | 'stopped' // 已停止
  | 'error' // 错误
  | 'reconnecting'; // 重连中

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

// ============================================================================
// TTS（语音合成）类型
// ============================================================================

/** TTS 状态机 */
export type TTSState =
  | 'idle' // 空闲
  | 'loading' // 加载中
  | 'playing' // 播放中
  | 'paused' // 已暂停
  | 'error'; // 错误

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

// ============================================================================
// 音频处理类型
// ============================================================================

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

// ============================================================================
// Speech SDK 顶层配置
// ============================================================================

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

// ============================================================================
// 组件 Props & Emits
// ============================================================================

/** WaveformCanvas Props */
export interface WaveformCanvasProps {
  /** 波形数据点（0-1 归一化） */
  data?: number[];
  /** 播放进度（0-1） */
  progress?: number;
  /** 画布宽度，0 表示自适应父容器 */
  width?: number;
  /** 画布高度（px） */
  height?: number;
  /** 柱间间距（px） */
  barGap?: number;
  /** 柱宽（px） */
  barWidth?: number;
  /** 未激活颜色（支持 CSS 变量语法） */
  inactiveColor?: string;
  /** 激活颜色（支持 CSS 变量语法） */
  activeColor?: string;
}

/** AudioPlayer Props */
export interface AudioPlayerProps {
  /** 音频 URL 或 Blob */
  src: string | Blob;
  /** 波形数据 */
  waveform?: number[];
  /** 是否显示波形，默认 true */
  showWaveform?: boolean;
  /** 是否自动播放，默认 false */
  autoplay?: boolean;
}

/** AudioPlayer Emits */
export interface AudioPlayerEmits {
  (e: 'play'): void;
  (e: 'pause'): void;
  (e: 'ended'): void;
  (e: 'timeupdate', time: number): void;
  /** 加载或播放失败（含自动播放被浏览器拦截） */
  (e: 'error', error: Error): void;
}
