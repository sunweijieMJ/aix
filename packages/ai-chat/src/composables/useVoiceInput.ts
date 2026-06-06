import { ref, computed, onScopeDispose, getCurrentScope, type Ref, type ComputedRef } from 'vue';
import type { VoiceConfig, VoiceRecognizer, VoiceRecognizerCtx } from '../types';

export interface UseVoiceInputOptions {
  config?: VoiceConfig;
  /** 一段定稿文本（isFinal=true）产出时回调 */
  onFinal: (text: string) => void;
  /** 中间结果（实时预览）回调，可选 */
  onInterim?: (text: string) => void;
  /** 识别失败（权限拒绝/网络/启动失败等）回调，可选；status 仍会复位 idle，提示由业务做 */
  onError?: (error: unknown) => void;
}

export interface UseVoiceInputReturn {
  status: Ref<'idle' | 'listening'>;
  /** 注入了 recognizer 恒 true；否则取决于浏览器 SpeechRecognition 支持 */
  isSupported: ComputedRef<boolean>;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/** Web Speech API 事件的最小结构类型（DOM lib 未内置 SpeechRecognition 类型） */
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const getSpeechRecognitionCtor = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
};

/** 内置默认识别器：包装浏览器 Web Speech API（interim + continuous） */
const createWebSpeechRecognizer = (): VoiceRecognizer | null => {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  return (ctx: VoiceRecognizerCtx) => {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    if (ctx.lang) rec.lang = ctx.lang;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const transcript = r[0]?.transcript ?? '';
        if (r.isFinal) ctx.onResult(transcript, true);
        else interim += transcript;
      }
      if (interim) ctx.onResult(interim, false);
    };
    rec.onerror = (e) => ctx.onError(e);
    rec.onend = () => ctx.onEnd();
    rec.start();
    return { stop: () => rec.stop() };
  };
};

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputReturn {
  const status = ref<'idle' | 'listening'>('idle');
  let handle: { stop: () => void } | null = null;
  let currentSession = 0;

  const isSupported = computed(
    () => !!options.config?.recognizer || getSpeechRecognitionCtor() !== null,
  );

  const start = () => {
    if (status.value === 'listening' || !isSupported.value) return;
    const recognizer = options.config?.recognizer ?? createWebSpeechRecognizer();
    if (!recognizer) return;
    // 会话令牌：旧会话的迟到回调（rec.stop() 后 onend 异步触发）凭令牌失配被丢弃，
    // 不会复位新会话状态或注入旧文本（与 useChat 的 controller===ctrl 守卫同模式）
    const session = ++currentSession;
    status.value = 'listening';
    try {
      handle = recognizer({
        onResult: (text, isFinal) => {
          if (session !== currentSession) return;
          if (isFinal) options.onFinal(text);
          else options.onInterim?.(text);
        },
        onError: (error) => {
          if (session !== currentSession) return;
          // 无权限/网络等：复位 idle 并透传给调用方（与「正常停止」可区分）
          status.value = 'idle';
          handle = null;
          options.onError?.(error);
        },
        onEnd: () => {
          if (session !== currentSession) return;
          status.value = 'idle';
          handle = null;
        },
        lang:
          options.config?.lang ??
          (typeof navigator !== 'undefined' ? navigator.language : undefined),
      });
    } catch (err) {
      // 识别器同步启动失败（如引擎上一会话未完全 onend 时高频重启的 InvalidStateError）：
      // 复位 idle，不让状态卡死在 listening 且无句柄可停
      status.value = 'idle';
      handle = null;
      if (typeof console !== 'undefined') console.warn('[ai-chat] 语音识别启动失败：', err);
      options.onError?.(err);
    }
  };

  const stop = () => {
    currentSession++; // 使在途回调全部失效
    handle?.stop();
    handle = null;
    status.value = 'idle';
  };

  const toggle = () => (status.value === 'listening' ? stop() : start());

  if (getCurrentScope()) onScopeDispose(stop);

  return { status, isSupported, start, stop, toggle };
}
