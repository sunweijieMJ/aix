/**
 * useTTS - 语音合成 Composable
 * 封装 TTSAdapter，向 Vue 组件提供响应式状态
 */
import { ref, computed, onUnmounted } from 'vue';
import { ProviderManager } from '../core/manager';
import type { TTSState, TTSOptions, TTSProviderOptions } from '../types';

export function useTTS(options?: TTSProviderOptions) {
  const manager = new ProviderManager({ tts: options });

  // ── 状态 ────────────────────────────────────────────────────────────────────
  const state = ref<TTSState>('idle');
  const error = ref<Error | null>(null);
  const currentText = ref('');

  // ── 计算属性 ─────────────────────────────────────────────────────────────────
  const isIdle = computed(() => state.value === 'idle');
  const isPlaying = computed(() => state.value === 'playing');
  const isLoading = computed(() => state.value === 'loading');

  // ── 初始化适配器回调 ──────────────────────────────────────────────────────────
  function initAdapter(): void {
    const adapter = manager.getTTS();
    adapter.onStateChange((s) => {
      state.value = s;
    });
    adapter.onError((err) => {
      error.value = err;
      state.value = 'error';
    });
  }

  initAdapter();

  // ── 播放控制 ─────────────────────────────────────────────────────────────────
  async function speak(text: string, ttsOptions?: TTSOptions): Promise<void> {
    try {
      error.value = null;
      currentText.value = text;
      await manager.getTTS().speak(text, ttsOptions);
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('TTS 播放失败');
    }
  }

  function pause(): void {
    manager.getTTS().pause();
  }
  function resume(): void {
    manager.getTTS().resume();
  }

  function stop(): void {
    manager.getTTS().stop();
    currentText.value = '';
  }

  function switchProvider(newOptions: TTSProviderOptions): void {
    stop();
    manager.switchTTS(newOptions);
    initAdapter();
  }

  onUnmounted(() => {
    stop();
    manager.destroy();
  });

  return {
    state,
    error,
    currentText,
    isIdle,
    isPlaying,
    isLoading,
    speak,
    pause,
    resume,
    stop,
    switchProvider,
  };
}
