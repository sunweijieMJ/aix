/**
 * useASR - ASR 语音识别 Composable
 * 只负责：ASR 适配器管理 + 识别结果（finalText/interimText）
 * 录音、计时器、波形由 useSpeech 统一管理
 */
import { ref, computed, onUnmounted } from 'vue';
import { ProviderManager } from '../core/manager';
import type { ASRState, ASRResult, ASROptions } from '../types';

export function useASR(options?: ASROptions) {
  const manager = new ProviderManager({ asr: options });

  // ── 状态 ────────────────────────────────────────────────────────────────────
  const state = ref<ASRState>('idle');
  const finalText = ref(''); // 已确认的稳定文本
  const interimText = ref(''); // 中间结果（随时会变）
  const error = ref<Error | null>(null);

  // ── 计算属性 ─────────────────────────────────────────────────────────────────
  const displayText = computed(() => finalText.value + interimText.value);
  const isIdle = computed(() => state.value === 'idle');
  const isRecording = computed(() => state.value === 'recording');

  // ── 双 Buffer 结果处理 ────────────────────────────────────────────────────────
  function handleASRResult(result: ASRResult): void {
    if (result.isFinal) {
      finalText.value += result.text;
      interimText.value = '';
    } else {
      interimText.value = result.text;
    }
  }

  // ── 连接 ─────────────────────────────────────────────────────────────────────
  async function connect(): Promise<void> {
    const adapter = manager.getASR();
    adapter.onResult(handleASRResult);
    adapter.onError((err) => {
      error.value = err;
      state.value = 'error';
    });
    adapter.onStateChange((s) => {
      state.value = s;
    });
    await adapter.connect();
  }

  function startRecognition(): void {
    manager.getASR().start();
    state.value = 'recording';
  }

  function stopRecognition(): void {
    try {
      manager.getASR().stop();
    } catch {
      // 忽略停止时的错误
    }
    state.value = 'stopped';
  }

  function resetText(): void {
    finalText.value = '';
    interimText.value = '';
  }

  async function switchProvider(newOptions: ASROptions): Promise<void> {
    stopRecognition();
    manager.switchASR(newOptions);
    await connect();
  }

  onUnmounted(() => {
    stopRecognition();
    manager.destroy();
  });

  return {
    state,
    finalText,
    interimText,
    displayText,
    error,
    isIdle,
    isRecording,
    connect,
    startRecognition,
    stopRecognition,
    resetText,
    switchProvider,
  };
}
