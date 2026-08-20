/**
 * 适配器协议层测试
 * 覆盖 TTS Promise 生命周期（回归 #6/#8/N2/N3）与 AliyunASR 鉴权（回归 #3）
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AliyunASR } from '../src/core/adapters/asr/aliyun';
import { AliyunTTS } from '../src/core/adapters/tts/aliyun';
import { ProxyTTS } from '../src/core/adapters/tts/proxy';
import { stubAudioContext } from './helpers/audioStubs';

/** 可手动驱动的 WebSocket 桩 */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = 1;
  binaryType = '';
  url: string;
  sent: Array<string | ArrayBuffer> = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  /** 模拟握手成功 */
  handshake() {
    this.onmessage?.({ data: JSON.stringify({ type: 'connecting_success' }) });
  }
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Promise 是否已结算 */
function track<T>(promise: Promise<T>) {
  const box = { settled: false, status: 'pending' as 'pending' | 'resolved' | 'rejected' };
  promise.then(
    () => {
      box.settled = true;
      box.status = 'resolved';
    },
    () => {
      box.settled = true;
      box.status = 'rejected';
    },
  );
  return box;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  stubAudioContext();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── AliyunTTS ─────────────────────────────────────────────────────────────────

describe('AliyunTTS Promise 生命周期', () => {
  function createTTS() {
    return new AliyunTTS({ provider: 'aliyun', wsEndpoint: 'wss://backend/tts' });
  }

  it('主动 stop() 应 resolve 而非派发假错误（回归 #6）', async () => {
    const tts = createTTS();
    const states: string[] = [];
    const errors: Error[] = [];
    tts.onStateChange((s) => states.push(s));
    tts.onError((e) => errors.push(e));

    const box = track(tts.speak('你好'));
    await tick();
    FakeWebSocket.instances[0]!.handshake();
    await tick();

    tts.stop();
    await tick();

    expect(box.status).toBe('resolved');
    expect(errors).toHaveLength(0); // 修复前会收到一次「播放已停止」假错误
    expect(states).not.toContain('error'); // 修复前状态序列以 error 收尾
    expect(tts.state).toBe('idle');
  });

  it('连续 speak() 不应把新一轮状态打成 error（回归 N2）', async () => {
    const tts = createTTS();
    const errors: Error[] = [];
    tts.onError((e) => errors.push(e));

    const first = track(tts.speak('第一句'));
    await tick();
    FakeWebSocket.instances[0]!.handshake();
    await tick();

    // 第二次 speak 内部会 stop 掉第一次
    const second = track(tts.speak('第二句'));
    await tick();

    expect(first.status).toBe('resolved');
    expect(errors).toHaveLength(0);
    expect(second.status).toBe('pending'); // 第二句仍在播
    expect(tts.state).not.toBe('error');
  });

  it('连接关闭时应结算挂起的 speak()（回归 #8）', async () => {
    const tts = createTTS();
    const box = track(tts.speak('你好'));
    await tick();
    FakeWebSocket.instances[0]!.handshake();
    await tick();

    expect(box.settled).toBe(false);

    FakeWebSocket.instances[0]!.close();
    await tick();

    expect(box.settled).toBe(true); // 修复前永久挂起
  });

  it('服务端不回握手时应超时失败而非永久挂起（回归 N3）', async () => {
    vi.useFakeTimers();
    const tts = createTTS();
    const box = track(tts.speak('你好').catch(() => {}));

    await vi.advanceTimersByTimeAsync(11_000);

    expect(box.settled).toBe(true);
  });
});

// ── ProxyTTS ──────────────────────────────────────────────────────────────────

describe('ProxyTTS Promise 生命周期', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ audioUrl: 'https://cdn/a.mp3' }),
      })),
    );
    // jsdom 未实现播放控制
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('stop() 应结算挂起的 speak()（回归 #8）', async () => {
    const tts = new ProxyTTS({ provider: 'proxy', endpoint: '/api/tts' });
    const box = track(tts.speak('你好'));
    await tick();

    expect(box.settled).toBe(false);

    tts.stop();
    await tick();

    expect(box.status).toBe('resolved'); // 修复前永久 pending
  });

  it('合成请求途中被 stop() 时不应挂起、也不应继续播放', async () => {
    let releaseFetch: (() => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise<void>((resolve) => {
          releaseFetch = resolve;
        });
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ audioUrl: 'https://cdn/a.mp3' }),
        };
      }),
    );
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    // spyOn 复用同一个 spy 实例，调用次数跨用例累积，这里只比较增量
    const playCallsBefore = play.mock.calls.length;

    const tts = new ProxyTTS({ provider: 'proxy', endpoint: '/api/tts' });
    const box = track(tts.speak('你好'));
    await tick();

    tts.stop(); // 请求还没回来就取消
    releaseFetch!();
    await tick(10);

    expect(box.settled).toBe(true);
    expect(play.mock.calls.length).toBe(playCallsBefore);
  });

  it('播放被拦截时应结算而非静默挂起', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('autoplay blocked'));

    const tts = new ProxyTTS({ provider: 'proxy', endpoint: '/api/tts' });
    const box = track(tts.speak('你好').catch(() => {}));
    await tick();

    expect(box.settled).toBe(true);
  });

  it('Blob 响应在 stop() 后应撤销 ObjectURL，不泄漏', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'audio/mpeg' },
        blob: async () => new Blob(['x'], { type: 'audio/mpeg' }),
      })),
    );

    const tts = new ProxyTTS({ provider: 'proxy', endpoint: '/api/tts' });
    void tts.speak('你好').catch(() => {});
    await tick();
    tts.stop();
    await tick();

    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });
});

// ── AliyunASR 鉴权 ────────────────────────────────────────────────────────────

describe('AliyunASR 鉴权配置（回归 #3）', () => {
  it('应接受 README 主推的 token-proxy 配置', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        statusText: 'OK',
        json: async () => ({ token: 'server-signed-token' }),
      })),
    );

    // 修复前这里直接抛「需要 auth.token」
    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'token-proxy', tokenEndpoint: '/api/asr/token' },
      language: 'zh-CN',
    });

    const connecting = asr.connect();
    await tick();
    FakeWebSocket.instances[0]!.onopen?.();
    await connecting;

    expect(FakeWebSocket.instances[0]!.url).toContain('token=server-signed-token');
  });

  it('token 代理可指定自定义 wsUrl', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        statusText: 'OK',
        json: async () => ({ token: 't', wsUrl: 'wss://custom/nls' }),
      })),
    );

    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'token-proxy', tokenEndpoint: '/api/asr/token' },
    });

    const connecting = asr.connect();
    await tick();
    FakeWebSocket.instances[0]!.onopen?.();
    await connecting;

    expect(FakeWebSocket.instances[0]!.url).toBe('wss://custom/nls');
  });

  it('仍支持 token 直传', async () => {
    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'direct', token: 'direct-token', appKey: 'ak' },
    });

    const connecting = asr.connect();
    await tick();
    FakeWebSocket.instances[0]!.onopen?.();
    await connecting;

    expect(FakeWebSocket.instances[0]!.url).toContain('token=direct-token');
  });

  it('token 与 tokenEndpoint 都缺失时应尽早失败', () => {
    expect(() => new AliyunASR({ provider: 'aliyun', auth: { mode: 'token-proxy' } })).toThrowError(
      /auth\.token/,
    );
  });

  it('token 代理请求失败应派发错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, statusText: 'Unauthorized' })),
    );

    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'token-proxy', tokenEndpoint: '/api/asr/token' },
    });
    const errors: Error[] = [];
    asr.onError((e) => errors.push(e));

    await expect(asr.connect()).rejects.toThrow(/Token/);
    expect(asr.state).toBe('error');
    expect(errors).toHaveLength(1);
  });
});

// ── 回调订阅 ──────────────────────────────────────────────────────────────────

describe('适配器回调注销（回归 #1 根因）', () => {
  it('on* 应返回可用的取消订阅函数', async () => {
    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'direct', token: 't' },
    });

    const seen: string[] = [];
    const off = asr.onStateChange((s) => seen.push(s));

    const connecting = asr.connect();
    await tick();
    FakeWebSocket.instances[0]!.onopen?.();
    await connecting;
    expect(seen.length).toBeGreaterThan(0);

    const countBefore = seen.length;
    off();
    asr.disconnect();

    expect(seen.length).toBe(countBefore); // 注销后不再收到
  });

  it('clearCallbacks() 应清空全部订阅', async () => {
    const asr = new AliyunASR({
      provider: 'aliyun',
      auth: { mode: 'direct', token: 't' },
    });
    const seen: string[] = [];
    asr.onStateChange((s) => seen.push(s));

    asr.clearCallbacks();
    asr.disconnect();

    expect(seen).toHaveLength(0);
  });
});
