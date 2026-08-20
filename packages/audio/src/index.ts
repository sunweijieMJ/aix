import type { App } from 'vue';
import AudioPlayer from './components/AudioPlayer/index.vue';
import WaveformCanvas from './components/WaveformCanvas/index.vue';

// ── Composable（Headless，最灵活）────────────────────────────────────────────
export { useSpeech } from './composables/useSpeech';
export { useASR } from './composables/useASR';
export { useTTS } from './composables/useTTS';
export { useWaveform } from './composables/useWaveform';

// ── UI 基础原语 ──────────────────────────────────────────────────────────────
export { WaveformCanvas, AudioPlayer };

// ── 适配器（允许自定义扩展） ──────────────────────────────────────────────────
export { BaseASRAdapter } from './core/adapters/asr/base';
export { BrowserASR } from './core/adapters/asr/browser';
export { AliyunASR } from './core/adapters/asr/aliyun';
export { ProxyASR } from './core/adapters/asr/proxy';
export { BaseTTSAdapter } from './core/adapters/tts/base';
export { BrowserTTS } from './core/adapters/tts/browser';
export { AliyunTTS } from './core/adapters/tts/aliyun';
export { ProxyTTS } from './core/adapters/tts/proxy';
export type {
  ASRAdapter,
  ASRAudioSourceMode,
  PCMAudioSource,
  Unsubscribe,
} from './core/adapters/asr/base';
export type { TTSAdapter } from './core/adapters/tts/base';

// ── 音频核心 ─────────────────────────────────────────────────────────────────
export { Recorder } from './core/audio/recorder';
export type { RecorderState, RecorderEvents } from './core/audio/recorder';
export { AudioSourceHub } from './core/audio/audioSourceHub';
export type { AudioSourceHubConfig } from './core/audio/audioSourceHub';
export { WaveformAnalyser } from './core/audio/waveformAnalyser';
export { Resampler } from './core/audio/resampler';
export { VAD } from './core/audio/vad';

// ── Provider 管理 ─────────────────────────────────────────────────────────────
export { ProviderManager } from './core/manager';

// ── 类型 ─────────────────────────────────────────────────────────────────────
export type {
  ASRState,
  ASRResult,
  ASROptions,
  ASRAuthConfig,
  TTSState,
  TTSOptions,
  TTSProviderOptions,
  SpeechConfig,
  RecorderConfig,
  RecordingResult,
  WaveformData,
  VADConfig,
  VADEvent,
  WaveformCanvasProps,
  AudioPlayerProps,
  AudioPlayerEmits,
} from './types';

// ── Vue 插件（全局注册两个 UI 组件） ──────────────────────────────────────────
export default {
  install(app: App) {
    app.component('AixWaveformCanvas', WaveformCanvas);
    app.component('AixAudioPlayer', AudioPlayer);
  },
};
