/**
 * 降级、重连、流结束判定测试
 * 覆盖 #14 fallback / #12 重连恢复 / #9 提前判完 / #10 pause-resume
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { useASR } from '../src/composables/useASR';
import { useTTS } from '../src/composables/useTTS';
import { AliyunASR } from '../src/core/adapters/asr/aliyun';
import { ProxyASR } from '../src/core/adapters/asr/proxy';
import { AliyunTTS } from '../src/core/adapters/tts/aliyun';
import {
  stubAudioContext,
  stubGetUserMedia,
  stubSpeechSynthesis,
  type AudioContextRegistry,
} from './helpers/audioStubs';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** 可控 WebSocket：默认连接成功，failNext 时立即报错 */
class FakeWS {
  static OPEN = 1;
  static instances: FakeWS[] = [];
  static failNext = false;

  readyState = 1;
  binaryType = '';
  sent: Array<string | ArrayBuffer> = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWS.instances.push(this);
    const shouldFail = FakeWS.failNext;
    setTimeout(() => {
      if (shouldFail) {
        // 浏览器在连接失败时先派发 error 再派发 close，两者都要模拟，
        // 否则适配器的重连链路（由 onclose 驱动）根本不会被触发
        this.readyState = 3;
        this.onerror?.();
        this.onclose?.();
      } else {
        this.onopen?.();
      }
    }, 0);
  }

  send(d: string | ArrayBuffer) {
    this.sent.push(d);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  /** 模拟异常掉线 */
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }

  textFrames(): string[] {
    return this.sent.filter((d): d is string => typeof d === 'string');
  }
}

class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;
  onresult: unknown = null;
  onerror: unknown = null;
  onstart: unknown = null;
  onend: unknown = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

let audio: AudioContextRegistry;

beforeEach(() => {
  FakeWS.instances = [];
  FakeWS.failNext = false;
  vi.stubGlobal('WebSocket', FakeWS);
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  audio = stubAudioContext();
  stubGetUserMedia(); // AliyunASR 自采模式需要，否则会落到 error 状态
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mountComposable<T>(factory: () => T): T {
  let result: T;
  mount(
    defineComponent({
      setup() {
        result = factory();
        return {};
      },
      template: '<div />',
    }),
  );
  return result!;
}

// ── C3 降级 ───────────────────────────────────────────────────────────────────

describe('供应商降级（回归 #14）', () => {
  it('ASR 连接失败时应降级到浏览器原生', async () => {
    FakeWS.failNext = true;

    const asr = mountComposable(() =>
      useASR({ provider: 'proxy', auth: { mode: 'ws-proxy', wsEndpoint: 'wss://gw' } }, 'browser'),
    );

    await asr.connect();

    // 修复前 fallback 只是类型声明，连接失败会直接抛错
    expect(asr.didFallback.value).toBe(true);
    expect(asr.getAdapter().audioSource).toBe('internal'); // 已是 BrowserASR
  });

  it('未配置 fallback 时应照常抛错', async () => {
    FakeWS.failNext = true;

    const asr = mountComposable(() =>
      useASR({ provider: 'proxy', auth: { mode: 'ws-proxy', wsEndpoint: 'wss://gw' } }),
    );

    await expect(asr.connect()).rejects.toBeTruthy();
    expect(asr.didFallback.value).toBe(false);
  });

  it('TTS 播放失败时应降级并重播一次', async () => {
    const tts = mountComposable(() =>
      useTTS({ provider: 'proxy', endpoint: '/api/tts' }, 'browser'),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, statusText: 'Service Unavailable' })),
    );
    // BrowserTTS 兜底（jsdom 无 SpeechSynthesisUtterance，需整套桩）
    const speakSpy = stubSpeechSynthesis();

    await tts.speak('你好');
    await tick(5);

    expect(tts.didFallback.value).toBe(true);
    expect(speakSpy).toHaveBeenCalled();
    expect(tts.error.value).toBeNull();
  });
});

// ── C5 重连恢复 ───────────────────────────────────────────────────────────────

describe('AliyunASR 重连恢复识别（回归 #12）', () => {
  it('掉线重连后应重发 StartTranscription', async () => {
    vi.useFakeTimers();

    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'direct', token: 't', appKey: 'ak' },
    });

    const connecting = asr.connect();
    await vi.advanceTimersByTimeAsync(1);
    await connecting;

    asr.start();
    const firstSocket = FakeWS.instances[0]!;
    expect(firstSocket.textFrames().some((f) => f.includes('StartTranscription'))).toBe(true);

    // 服务端确认，进入 recording
    firstSocket.onmessage?.({
      data: JSON.stringify({ header: { name: 'TranscriptionStarted' } }),
    });
    expect(asr.state).toBe('recording');

    // 异常掉线
    firstSocket.drop();
    expect(asr.state).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(1200); // 等重连退避 + 连接建立

    const secondSocket = FakeWS.instances[1];
    expect(secondSocket, '应发起新连接').toBeDefined();
    // 修复前只重连不重发识别请求，连接是通的但服务端没有任务 → 静默假死
    expect(secondSocket!.textFrames().some((f) => f.includes('StartTranscription'))).toBe(true);
  });

  it('第一次重连失败后，后续重连仍应恢复识别', async () => {
    vi.useFakeTimers();

    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'direct', token: 't' },
    });
    const connecting = asr.connect();
    await vi.advanceTimersByTimeAsync(1);
    await connecting;

    asr.start();
    FakeWS.instances[0]!.onmessage?.({
      data: JSON.stringify({ header: { name: 'TranscriptionStarted' } }),
    });

    // 掉线，且第一次重连也失败
    FakeWS.failNext = true;
    FakeWS.instances[0]!.drop();
    await vi.advanceTimersByTimeAsync(1500);

    // 第二次重连成功
    FakeWS.failNext = false;
    await vi.advanceTimersByTimeAsync(3000);

    const last = FakeWS.instances[FakeWS.instances.length - 1]!;
    // 靠 _state 推断恢复意图会在第一次重连失败后丢失，必须显式记录
    expect(last.textFrames().some((f) => f.includes('StartTranscription'))).toBe(true);
  });

  it('主动 stop 后掉线不应触发重连', async () => {
    vi.useFakeTimers();

    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'direct', token: 't' },
    });
    const connecting = asr.connect();
    await vi.advanceTimersByTimeAsync(1);
    await connecting;

    asr.start();
    asr.stop();
    const count = FakeWS.instances.length;

    FakeWS.instances[0]!.drop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(FakeWS.instances.length).toBe(count);
  });
});

describe('ProxyASR 重连恢复识别', () => {
  it('掉线重连后应重发 start 帧', async () => {
    vi.useFakeTimers();

    const asr = new ProxyASR({
      provider: 'proxy',
      auth: { mode: 'ws-proxy', wsEndpoint: 'wss://gw' },
    });
    const connecting = asr.connect();
    await vi.advanceTimersByTimeAsync(1);
    await connecting;

    asr.start();
    FakeWS.instances[0]!.drop();
    await vi.advanceTimersByTimeAsync(1500);

    const last = FakeWS.instances[FakeWS.instances.length - 1]!;
    // 只重连不重发 start，后端不会建立识别任务
    expect(last.textFrames().some((f) => f.includes('"start"'))).toBe(true);
    expect(asr.state).toBe('recording');
  });

  it('主动 stop 后掉线不应重连', async () => {
    vi.useFakeTimers();

    const asr = new ProxyASR({
      provider: 'proxy',
      auth: { mode: 'ws-proxy', wsEndpoint: 'wss://gw' },
    });
    const connecting = asr.connect();
    await vi.advanceTimersByTimeAsync(1);
    await connecting;

    asr.start();
    asr.stop();
    const count = FakeWS.instances.length;

    FakeWS.instances[0]!.drop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(FakeWS.instances.length).toBe(count);
  });
});

// ── C6 流结束判定 + C4 暂停恢复 ────────────────────────────────────────────────

describe('AliyunTTS 流式播放（回归 #9 / #10）', () => {
  function createTTS() {
    return new AliyunTTS({ provider: 'aliyun', wsEndpoint: 'wss://backend/tts' });
  }

  async function speakUntilPlaying(tts: AliyunTTS) {
    const box = { settled: false };
    void tts.speak('你好').then(
      () => (box.settled = true),
      () => (box.settled = true),
    );
    await tick();
    FakeWS.instances[0]!.onmessage?.({ data: JSON.stringify({ type: 'connecting_success' }) });
    await tick();
    return box;
  }

  it('队列瞬时排空不应立即判定播放结束（回归 #9）', async () => {
    const tts = createTTS();
    const box = await speakUntilPlaying(tts);

    // 首包到达并播完，但后续包还在路上
    FakeWS.instances[0]!.onmessage?.({ data: new ArrayBuffer(64) });
    await tick(20);

    // 修复前：队列空即触发 onFinished，speak() 在此提前 resolve
    expect(box.settled).toBe(false);
    expect(tts.state).toBe('playing');
  });

  it('收到结束信号且队列播完才判定结束', async () => {
    const tts = createTTS();
    const box = await speakUntilPlaying(tts);

    FakeWS.instances[0]!.onmessage?.({ data: new ArrayBuffer(64) });
    await tick(20);
    expect(box.settled).toBe(false);

    FakeWS.instances[0]!.onmessage?.({ data: JSON.stringify({ type: 'end' }) });
    await tick(20);

    expect(box.settled).toBe(true);
    expect(tts.state).toBe('idle');
  });

  it('pause()/resume() 应真正挂起 AudioContext（回归 #10）', async () => {
    const tts = createTTS();
    await speakUntilPlaying(tts);
    FakeWS.instances[0]!.onmessage?.({ data: new ArrayBuffer(64) });
    await tick(10);

    tts.pause();
    await tick();
    expect(tts.state).toBe('paused');
    // 修复前只改状态字段，音频照常播放
    expect(audio.suspendedCount).toBeGreaterThan(0);

    tts.resume();
    await tick();
    expect(tts.state).toBe('playing');
    expect(audio.resumedCount).toBeGreaterThan(0);
  });
});
