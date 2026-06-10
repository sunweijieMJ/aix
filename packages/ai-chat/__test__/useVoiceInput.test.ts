import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useVoiceInput } from '../src/composables/useVoiceInput';
import type { VoiceRecognizer, VoiceRecognizerCtx } from '../src/types';

/** 可手动驱动回调的识别器 mock */
const fakeRecognizer = () => {
  let ctx: VoiceRecognizerCtx | null = null;
  const stop = vi.fn(() => ctx?.onEnd());
  const recognizer: VoiceRecognizer = (c) => {
    ctx = c;
    return { stop };
  };
  return { recognizer, stop, drive: () => ctx! };
};

afterEach(() => vi.unstubAllGlobals());

describe('useVoiceInput', () => {
  it('注入 recognizer：isSupported 恒 true，start 进入 listening', () => {
    const { recognizer } = fakeRecognizer();
    const v = useVoiceInput({ config: { recognizer }, onFinal: vi.fn() });
    expect(v.isSupported.value).toBe(true);
    v.start();
    expect(v.status.value).toBe('listening');
  });

  it('onResult 分发：isFinal=true 走 onFinal，false 走 onInterim', () => {
    const { recognizer, drive } = fakeRecognizer();
    const onFinal = vi.fn();
    const onInterim = vi.fn();
    const v = useVoiceInput({ config: { recognizer }, onFinal, onInterim });
    v.start();
    drive().onResult('正在', false);
    drive().onResult('正在识别', true);
    expect(onInterim).toHaveBeenCalledWith('正在');
    expect(onFinal).toHaveBeenCalledWith('正在识别');
  });

  it('stop 调识别器 stop 并复位 idle；onEnd 自停同样复位', () => {
    const { recognizer, stop, drive } = fakeRecognizer();
    const v = useVoiceInput({ config: { recognizer }, onFinal: vi.fn() });
    v.start();
    v.stop();
    expect(stop).toHaveBeenCalled();
    expect(v.status.value).toBe('idle');
    v.start();
    drive().onEnd(); // 识别器自停
    expect(v.status.value).toBe('idle');
  });

  it('识别 onError 复位 idle', () => {
    const { recognizer, drive } = fakeRecognizer();
    const v = useVoiceInput({ config: { recognizer }, onFinal: vi.fn() });
    v.start();
    drive().onError(new Error('not-allowed'));
    expect(v.status.value).toBe('idle');
  });

  it('识别错误透传给调用方 onError（如权限拒绝，业务可提示用户）', () => {
    const { recognizer, drive } = fakeRecognizer();
    const onError = vi.fn();
    const v = useVoiceInput({ config: { recognizer }, onFinal: vi.fn(), onError });
    v.start();
    const err = new Error('not-allowed');
    drive().onError(err);
    expect(onError).toHaveBeenCalledWith(err);
    expect(v.status.value).toBe('idle');
  });

  it('旧会话迟到的 onError 不触发调用方 onError', () => {
    const ctxs: VoiceRecognizerCtx[] = [];
    const recognizer: VoiceRecognizer = (c) => {
      ctxs.push(c);
      return { stop: vi.fn() };
    };
    const onError = vi.fn();
    const v = useVoiceInput({ config: { recognizer }, onFinal: vi.fn(), onError });
    v.start(); // 会话 1
    v.stop();
    v.start(); // 会话 2
    ctxs[0]!.onError(new Error('late')); // 会话 1 迟到错误
    expect(onError).not.toHaveBeenCalled();
    expect(v.status.value).toBe('listening'); // 新会话不受影响
  });

  it('识别器同步抛错：复位 idle 不卡死，onError 可选透传', () => {
    // 同步启动失败（如引擎高频重启的 InvalidStateError）须复位 idle 且不让状态卡死；
    // onError 为可选回调，两种配置都要覆盖：不带时可选链不崩、仅 console.warn 提示，
    // 带时透传原始 error 且 console.warn 仍触发。
    const recognizer: VoiceRecognizer = () => {
      throw new Error('InvalidStateError');
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 配置一：不带 onError —— options.onError?.() 可选链不崩，复位 idle 可再次 start
      const v1 = useVoiceInput({ config: { recognizer }, onFinal: vi.fn() });
      v1.start();
      expect(v1.status.value).toBe('idle');
      v1.start(); // 可再次尝试，不被卡死的 listening 拦截
      expect(v1.status.value).toBe('idle');
      expect(warnSpy).toHaveBeenCalledTimes(2); // 每次失败都有 console.warn 兜底提示
      // 配置二：带 onError —— 透传原始 error，console.warn 仍触发
      const onError = vi.fn();
      const v2 = useVoiceInput({ config: { recognizer }, onFinal: vi.fn(), onError });
      v2.start();
      expect(onError).toHaveBeenCalledTimes(1);
      expect((onError.mock.calls[0]![0] as Error).message).toBe('InvalidStateError');
      expect(v2.status.value).toBe('idle');
      expect(warnSpy).toHaveBeenCalledTimes(3);
    } finally {
      warnSpy.mockRestore(); // try/finally 还原，断言失败也不污染后续用例
    }
  });

  it('listening 中重复 start 为空操作（不重复创建识别会话）', () => {
    const calls: VoiceRecognizerCtx[] = [];
    const recognizer: VoiceRecognizer = (c) => {
      calls.push(c);
      return { stop: vi.fn() };
    };
    const v = useVoiceInput({ config: { recognizer }, onFinal: vi.fn() });
    v.start();
    v.start();
    expect(calls).toHaveLength(1);
  });

  it('无自定义识别器且浏览器不支持：isSupported=false，start 为空操作', () => {
    // jsdom 默认无 SpeechRecognition
    const v = useVoiceInput({ onFinal: vi.fn() });
    expect(v.isSupported.value).toBe(false);
    v.start();
    expect(v.status.value).toBe('idle');
  });

  it('浏览器 SpeechRecognition 存在时 isSupported=true 并接线 result/end', () => {
    const instances: FakeSR[] = [];
    class FakeSR {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    vi.stubGlobal('SpeechRecognition', FakeSR);
    const onFinal = vi.fn();
    const v = useVoiceInput({ onFinal, config: { lang: 'zh-CN' } });
    expect(v.isSupported.value).toBe(true);
    v.start();
    const sr = instances[0]!;
    expect(sr.start).toHaveBeenCalled();
    expect(sr.lang).toBe('zh-CN');
    expect(sr.continuous).toBe(true);
    expect(sr.interimResults).toBe(true);
    // 模拟一段定稿结果（Web Speech 事件形状）
    const fakeEvent = {
      resultIndex: 0,
      results: [Object.assign([{ transcript: '你好' }], { isFinal: true })],
    };
    (sr.onresult as (e: unknown) => void)?.(fakeEvent);
    expect(onFinal).toHaveBeenCalledWith('你好');
    // stop 后显式断开事件回调，释放旧实例与闭包的相互引用
    v.stop();
    expect(sr.stop).toHaveBeenCalled();
    expect(sr.onresult).toBeNull();
    expect(sr.onerror).toBeNull();
    expect(sr.onend).toBeNull();
  });

  it('stop 后立即 start：旧会话迟到的 onEnd/onResult 不影响新会话', () => {
    // 改造 fakeRecognizer：stop 不同步触发 onEnd，保留各会话 ctx 供手动迟到驱动
    const ctxs: VoiceRecognizerCtx[] = [];
    const recognizer: VoiceRecognizer = (c) => {
      ctxs.push(c);
      return { stop: vi.fn() };
    };
    const onFinal = vi.fn();
    const v = useVoiceInput({ config: { recognizer }, onFinal });
    v.start(); // 会话 1
    v.stop();
    v.start(); // 会话 2
    expect(v.status.value).toBe('listening');
    ctxs[0]!.onEnd(); // 会话 1 的 onend 迟到
    expect(v.status.value).toBe('listening'); // 新会话不被复位
    ctxs[0]!.onResult('旧文本', true); // 会话 1 迟到 final
    expect(onFinal).not.toHaveBeenCalled(); // 不注入
    ctxs[1]!.onResult('新文本', true);
    expect(onFinal).toHaveBeenCalledWith('新文本'); // 新会话正常
  });

  it('作用域销毁自动 stop', () => {
    const { recognizer, stop } = fakeRecognizer();
    const scope = effectScope();
    scope.run(() => {
      const v = useVoiceInput({ config: { recognizer }, onFinal: vi.fn() });
      v.start();
    });
    scope.stop();
    expect(stop).toHaveBeenCalled();
  });
});
