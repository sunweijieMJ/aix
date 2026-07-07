import { ref, computed, onScopeDispose, getCurrentScope, type Ref, type ComputedRef } from 'vue';
import type {
  ChatMessage,
  SpeechConfig,
  SpeechSession,
  SpeechSynthesizer,
  SpeechSynthesizerCtx,
} from '../types';
import { messageText } from '../utils/helpers';
import { stripMarkdownForSpeech } from '../utils/stripMarkdownForSpeech';

export interface UseSpeechOptions {
  config?: SpeechConfig;
}

export interface UseSpeechReturn {
  /** 当前正在朗读的消息 id，null = 未朗读 */
  speakingId: Ref<string | null>;
  /** 注入了 synthesizer 恒 true；否则取决于浏览器 speechSynthesis 支持 */
  isSupported: ComputedRef<boolean>;
  /** 手动：点同一条→停；点另一条→停旧起新（整段一次性 enqueue + finish） */
  toggle: (message: ChatMessage) => void;
  /** autoPlay：喂入流式增量，内部分句游标只 enqueue 完整句；status=success 时 flush + finish */
  feed: (message: ChatMessage) => void;
  /** 立即停止 */
  stop: () => void;
  /** 解析某消息要朗读的文本（含默认剥离 markdown），供可见性判断与朗读共用 */
  resolveText: (message: ChatMessage) => string;
}

const getSpeechSynthesis = (): SpeechSynthesis | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { speechSynthesis?: SpeechSynthesis };
  return w.speechSynthesis ?? null;
};

const hasUtteranceCtor = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance !==
    'undefined';

/** 内置默认合成器：包装浏览器 speechSynthesis（每句一个 utterance 入原生队列） */
export const createSpeechSynthesisSynthesizer = (): SpeechSynthesizer | null => {
  const synth = getSpeechSynthesis();
  if (!synth || !hasUtteranceCtor()) return null;
  return (ctx: SpeechSynthesizerCtx): SpeechSession => {
    let pending = 0; // 已 speak 尚未结束的 utterance 数
    let finished = false; // finish() 已调用
    let started = false; // onStart 已触发
    let stopped = false;

    const maybeEnd = () => {
      if (finished && pending === 0 && !stopped) ctx.onEnd();
    };

    return {
      enqueue: (text) => {
        if (stopped || !text) return;
        const u = new SpeechSynthesisUtterance(text);
        if (ctx.lang) u.lang = ctx.lang;
        if (ctx.rate != null) u.rate = ctx.rate;
        if (ctx.pitch != null) u.pitch = ctx.pitch;
        if (ctx.volume != null) u.volume = ctx.volume;
        if (ctx.voice) {
          const v = synth
            .getVoices()
            .find((vv) => vv.voiceURI === ctx.voice || vv.name === ctx.voice);
          if (v) u.voice = v;
        }
        u.onstart = () => {
          if (stopped) return;
          if (!started) {
            started = true;
            ctx.onStart();
          }
        };
        u.onend = () => {
          pending--;
          maybeEnd();
        };
        u.onerror = (e) => {
          pending--;
          if (!stopped) ctx.onError(e);
          maybeEnd();
        };
        pending++;
        synth.speak(u);
      },
      finish: () => {
        finished = true;
        maybeEnd();
      },
      stop: () => {
        stopped = true;
        synth.cancel();
      },
    };
  };
};

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';

/** 找文本中最后一个句末边界位置（中英句末标点 + 换行 + 分号），无则 -1 */
const lastBoundary = (text: string): number => {
  let idx = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (
      ch === '。' ||
      ch === '！' ||
      ch === '？' ||
      ch === '!' ||
      ch === '?' ||
      ch === '\n' ||
      ch === '；' ||
      ch === ';'
    ) {
      idx = i;
    } else if (ch === '.') {
      // 英文句点：仅在「后紧跟非数字」时才作句末，避免切断小数/版本号（如 4.5）；
      // 句点位于当前文本末尾（next 未定）时也不切，待下个 chunk 或 success flush 时再处理。
      if (!isDigit(text[i + 1]) && text[i + 1] !== undefined) idx = i;
    }
  }
  return idx;
};

export function useSpeech(options: UseSpeechOptions = {}): UseSpeechReturn {
  const config = options.config ?? {};
  const defaultSynthesizer = createSpeechSynthesisSynthesizer();

  const speakingId = ref<string | null>(null);
  let session: SpeechSession | null = null;
  let spokenLen = 0; // 当前朗读消息已 enqueue 的字符数（分句游标）
  let currentSession = 0; // 会话令牌

  const isSupported = computed(() => !!config.synthesizer || defaultSynthesizer !== null);

  const resolveText = (message: ChatMessage): string =>
    config.getText ? config.getText(message) : stripMarkdownForSpeech(messageText(message));

  const stop = () => {
    currentSession++; // 作废在途回调
    session?.stop();
    session = null;
    speakingId.value = null;
    spokenLen = 0;
  };

  /** 启动新会话（不 enqueue 内容）；返回新建的会话对象，无可用合成器时返回 null */
  const startSession = (id: string): SpeechSession | null => {
    const synthesizer = config.synthesizer ?? defaultSynthesizer;
    if (!synthesizer) return null;
    const token = ++currentSession;
    session = synthesizer({
      lang: config.lang ?? (typeof navigator !== 'undefined' ? navigator.language : undefined),
      rate: config.rate,
      pitch: config.pitch,
      volume: config.volume,
      voice: config.voice,
      onStart: () => {
        // speakingId 已在起播时乐观置位；此处仅为接口完整，令牌失配则忽略
        if (token !== currentSession) return;
      },
      onEnd: () => {
        if (token !== currentSession) return;
        speakingId.value = null;
        session = null;
        spokenLen = 0;
      },
      onError: (error) => {
        if (token !== currentSession) return;
        speakingId.value = null;
        session = null;
        spokenLen = 0;
        config.onError?.(error);
      },
    });
    speakingId.value = id; // 乐观置位，按钮即时反馈
    spokenLen = 0;
    return session;
  };

  const toggle = (message: ChatMessage) => {
    if (!isSupported.value) return;
    if (speakingId.value === message.id) {
      stop();
      return;
    }
    stop(); // 停旧
    const text = resolveText(message);
    if (!text) return;
    const s = startSession(message.id);
    if (!s) return;
    s.enqueue(text);
    // enqueue 内同步触发 onError 会将 session 置空并复位游标；此时不再推进游标与 finish，
    // 避免解引用 null 抛错、以及 spokenLen 覆盖 onError 刚重置的游标
    if (session !== s) return;
    spokenLen = text.length;
    s.finish();
  };

  const feed = (message: ChatMessage) => {
    if (!isSupported.value) return;
    let s = session;
    if (speakingId.value !== message.id) {
      stop(); // 停旧（若有）
      s = startSession(message.id);
    }
    if (!s) return;
    // 注：spokenLen 是 getText 输出文本的字符游标。默认 getText 对增长中的原文重新 stripMarkdown，
    // 若某 markdown 标记跨已朗读句末边界且后续 chunk 才闭合，前缀理论上可变，个别字符可能重读/漏读。
    // 流式 markdown 场景概率低、spec 已接受此权衡，故不在此重排游标。
    const full = resolveText(message);
    const tail = full.slice(spokenLen);
    const boundary = lastBoundary(tail);
    if (boundary !== -1) {
      const complete = tail.slice(0, boundary + 1);
      s.enqueue(complete);
      // enqueue 内同步触发 onError 会将 session 置空并复位游标；此时中止后续 enqueue→finish→游标推进链
      if (session !== s) return;
      spokenLen += complete.length;
    }
    if (message.status === 'success') {
      const rest = full.slice(spokenLen);
      if (rest.trim()) {
        s.enqueue(rest);
        if (session !== s) return;
        spokenLen += rest.length;
      }
      s.finish();
    }
  };

  if (getCurrentScope()) onScopeDispose(stop);

  return { speakingId, isSupported, toggle, feed, stop, resolveText };
}
