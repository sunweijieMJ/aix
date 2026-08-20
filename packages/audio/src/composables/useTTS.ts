/**
 * useTTS - 语音合成 Composable
 * 封装 TTSAdapter，向 Vue 组件提供响应式状态
 */
import { ref, computed, onUnmounted } from 'vue';
import type { Unsubscribe } from '../core/adapters/asr/base';
import { ProviderManager } from '../core/manager';
import type { TTSState, TTSOptions, TTSProviderOptions } from '../types';

export function useTTS(options?: TTSProviderOptions, fallbackProvider?: 'browser') {
  const manager = new ProviderManager({ tts: options });

  /**
   * 当前适配器上的订阅，重新绑定前必须全部释放
   * 允许 void：旧版自定义适配器的 on* 可能不返回取消订阅函数
   */
  let disposers: Array<Unsubscribe | void> = [];
  /** 是否已经降级过，避免降级失败后无限重试 */
  let fallbackUsed = false;

  // ── 状态 ────────────────────────────────────────────────────────────────────
  const state = ref<TTSState>('idle');
  const error = ref<Error | null>(null);
  const currentText = ref('');
  /** 是否已降级到兜底供应商 */
  const didFallback = ref(false);

  // ── 计算属性 ─────────────────────────────────────────────────────────────────
  const isIdle = computed(() => state.value === 'idle');
  const isPlaying = computed(() => state.value === 'playing');
  const isLoading = computed(() => state.value === 'loading');

  // ── 初始化适配器回调 ──────────────────────────────────────────────────────────
  /** 释放当前所有适配器订阅 */
  function releaseSubscriptions(): void {
    // 兼容旧接口：第三方适配器的 on* 可能返回 void 而非取消订阅函数
    disposers.forEach((dispose) => {
      if (typeof dispose === 'function') dispose();
    });
    disposers = [];
  }

  /** 幂等绑定：先释放旧订阅再注册，切换供应商后不会残留旧回调 */
  function initAdapter(): void {
    const adapter = manager.getTTS();
    releaseSubscriptions();
    disposers = [
      adapter.onStateChange((s) => {
        state.value = s;
      }),
      adapter.onError((err) => {
        error.value = err;
      }),
    ];
    state.value = adapter.state;
  }

  initAdapter();

  // ── 播放控制 ─────────────────────────────────────────────────────────────────
  async function speak(text: string, ttsOptions?: TTSOptions): Promise<void> {
    try {
      error.value = null;
      currentText.value = text;
      await manager.getTTS().speak(text, ttsOptions);
    } catch (err) {
      const failure = err instanceof Error ? err : new Error('TTS 播放失败');

      // 配置了降级策略时，首次失败自动切到浏览器原生并重播一次
      if (canFallback()) {
        fallbackUsed = true;
        manager.switchTTS({ ...options, provider: fallbackProvider! });
        initAdapter();
        didFallback.value = true;
        try {
          await manager.getTTS().speak(text, ttsOptions);
          // 降级成功即本次调用成功：清掉原供应商在 onError 里写入的错误，
          // 否则调用方会看到一个已被兜底解决的错误
          error.value = null;
          return;
        } catch (fallbackErr) {
          error.value = fallbackErr instanceof Error ? fallbackErr : failure;
          return;
        }
      }

      error.value = failure;
    }
  }

  /** 是否满足降级条件：配置了兜底、尚未降级过、且当前不就是兜底供应商 */
  function canFallback(): boolean {
    return !!fallbackProvider && !fallbackUsed && options?.provider !== fallbackProvider;
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
    // 手动切换视为一次全新尝试，重置降级标记
    fallbackUsed = false;
    didFallback.value = false;
  }

  onUnmounted(() => {
    stop();
    releaseSubscriptions();
    manager.destroy();
  });

  return {
    state,
    error,
    currentText,
    didFallback,
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
