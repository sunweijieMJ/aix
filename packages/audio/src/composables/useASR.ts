/**
 * useASR - ASR 语音识别 Composable
 * 只负责：ASR 适配器管理 + 识别结果（finalText/interimText）
 * 录音、计时器、波形由 useSpeech 统一管理
 */
import { ref, computed, onUnmounted } from 'vue';
import type { ASRAdapter, PCMAudioSource, Unsubscribe } from '../core/adapters/asr/base';
import { ProviderManager } from '../core/manager';
import type { ASRState, ASRResult, ASROptions } from '../types';

export function useASR(options?: ASROptions, fallbackProvider?: 'browser') {
  const manager = new ProviderManager({ asr: options });

  /**
   * 当前适配器上的订阅，重新绑定前必须全部释放，否则回调会随连接次数线性累积
   * 允许 void：旧版自定义适配器的 on* 可能不返回取消订阅函数
   */
  let disposers: Array<Unsubscribe | void> = [];
  /** 是否已经降级过，避免降级失败后无限重试 */
  let fallbackUsed = false;

  // ── 状态 ────────────────────────────────────────────────────────────────────
  const state = ref<ASRState>('idle');
  const finalText = ref(''); // 已确认的稳定文本
  const interimText = ref(''); // 中间结果（随时会变）
  const error = ref<Error | null>(null);
  /** 是否已降级到兜底供应商 */
  const didFallback = ref(false);

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

  // ── 订阅管理 ─────────────────────────────────────────────────────────────────
  /** 释放当前所有适配器订阅 */
  function releaseSubscriptions(): void {
    // 兼容旧接口：第三方适配器的 on* 可能返回 void 而非取消订阅函数
    disposers.forEach((dispose) => {
      if (typeof dispose === 'function') dispose();
    });
    disposers = [];
  }

  /**
   * 幂等绑定适配器回调：先释放旧订阅再注册，
   * 保证重复 connect()（每次录音都会调用）不会重复注册回调
   */
  function bindAdapter(adapter: ASRAdapter): void {
    releaseSubscriptions();
    disposers = [
      adapter.onResult(handleASRResult),
      adapter.onError((err) => {
        error.value = err;
      }),
      adapter.onStateChange((s) => {
        state.value = s;
      }),
    ];
    // 适配器可能已有状态（如复用实例），同步一次避免 UI 落后
    state.value = adapter.state;
  }

  // ── 连接 ─────────────────────────────────────────────────────────────────────
  async function connect(): Promise<void> {
    try {
      const adapter = manager.getASR();
      bindAdapter(adapter);
      await adapter.connect();
    } catch (err) {
      // 配置了降级策略时，首次连接失败自动切到浏览器原生
      if (!fallbackProvider || fallbackUsed || options?.provider === fallbackProvider) throw err;

      fallbackUsed = true;
      const fallbackAdapter = manager.switchASR({ ...options, provider: fallbackProvider });
      bindAdapter(fallbackAdapter);
      await fallbackAdapter.connect();
      didFallback.value = true;
      // 降级成功即连接成功，清掉原供应商写入的错误
      error.value = null;
    }
  }

  /** 状态由适配器 onStateChange 单向写入，此处不再手动赋值，避免与适配器打架 */
  function startRecognition(): void {
    manager.getASR().start();
  }

  function stopRecognition(): void {
    try {
      manager.getASR().stop();
    } catch {
      // 忽略停止时的错误
    }
  }

  function resetText(): void {
    finalText.value = '';
    interimText.value = '';
  }

  async function switchProvider(newOptions: ASROptions): Promise<void> {
    stopRecognition();
    releaseSubscriptions();
    manager.switchASR(newOptions);
    // 手动切换视为一次全新尝试，重置降级标记
    fallbackUsed = false;
    didFallback.value = false;
    await connect();
  }

  /** 获取底层适配器（自定义推流等高级场景的逃生舱） */
  function getAdapter(): ASRAdapter {
    return manager.getASR();
  }

  /**
   * 向适配器注入共享 PCM 音源，仅 external/managed 适配器有效
   * 解绑（传 null）时不触发适配器惰性创建，避免清理路径反而建出新实例
   */
  function attachAudioSource(source: PCMAudioSource | null): void {
    const adapter = source ? manager.getASR() : manager.peekASR();
    adapter?.attachAudioSource?.(source);
  }

  onUnmounted(() => {
    stopRecognition();
    releaseSubscriptions();
    manager.destroy();
  });

  return {
    state,
    finalText,
    interimText,
    displayText,
    error,
    didFallback,
    isIdle,
    isRecording,
    connect,
    startRecognition,
    stopRecognition,
    resetText,
    switchProvider,
    getAdapter,
    attachAudioSource,
  };
}
