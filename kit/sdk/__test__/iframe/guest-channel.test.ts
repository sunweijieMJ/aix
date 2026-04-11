import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SDKCore } from '../../src/core/sdk.js';
import { GuestChannel } from '../../src/iframe/guest-channel.js';
import type { HandshakeEnvelope } from '../../src/iframe/types.js';

function createCore(debug = false) {
  return new SDKCore({ appId: 'test-app', debug });
}

/**
 * jsdom 默认 `window.parent === window`，会触发 GuestChannel 的 self-parent 守卫。
 * 每个测试用独立 mock 替换 parent，让握手流程得以继续。
 */
function installMockParent(): { postMessage: ReturnType<typeof vi.fn> } {
  const mockParent = { postMessage: vi.fn() };
  Object.defineProperty(window, 'parent', {
    value: mockParent,
    configurable: true,
    writable: true,
  });
  return mockParent;
}

function restoreParent() {
  Object.defineProperty(window, 'parent', {
    value: window,
    configurable: true,
    writable: true,
  });
}

/**
 * 模拟 host 响应 sdk:ack，传递 port2。
 * 返回与 port2 配对的 port1（测试侧代表 host 发消息）。
 */
function triggerAck(
  origin = 'https://host.example.com',
  appId = 'test-app',
): { port1: MessagePort; port2: MessagePort } {
  const { port1, port2 } = new MessageChannel();
  const envelope: HandshakeEnvelope = { __sdk: '@kit/sdk', appId, __sys: 'sdk:ack' };
  window.dispatchEvent(new MessageEvent('message', { data: envelope, origin, ports: [port2] }));
  return { port1, port2 };
}

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * 排空多个宏/微任务循环：
 * request 往返需要 port1→port2 + 异步 handler + port2→port1，
 * 单个 tick 不足以完成整条链路，使用多次 tick 更稳定。
 */
async function drain(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe('GuestChannel — 握手流程', () => {
  let mockParent: { postMessage: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    mockParent = installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  it('ready() 应通过 window.opener 或 window.parent 发送 sdk:ready', () => {
    const channel = new GuestChannel(createCore());

    channel.ready('https://host.example.com');

    expect(mockParent.postMessage).toHaveBeenCalledWith(
      { __sdk: '@kit/sdk', appId: 'test-app', __sys: 'sdk:ready' },
      'https://host.example.com',
    );

    channel.dispose();
  });

  it('ready() 未传 targetOrigin 时应默认使用 *', () => {
    const channel = new GuestChannel(createCore());

    channel.ready();

    expect(mockParent.postMessage).toHaveBeenCalledWith(expect.any(Object), '*');

    channel.dispose();
  });

  it('ready() 重复调用时应清理旧监听器再重新注册', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const channel = new GuestChannel(createCore());
    channel.ready();
    channel.ready(); // 第二次：应先移除再注册

    expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));

    removeEventListenerSpy.mockRestore();
    channel.dispose();
  });

  it('sdk:ack 未携带 port 时应 warn 并忽略', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const channel = new GuestChannel(createCore());
    channel.ready();

    const envelope: HandshakeEnvelope = { __sdk: '@kit/sdk', appId: 'test-app', __sys: 'sdk:ack' };
    window.dispatchEvent(
      new MessageEvent('message', { data: envelope, origin: 'https://host.example.com' }),
    );

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no MessagePort'));
    warnSpy.mockRestore();
    channel.dispose();
  });
});

describe('GuestChannel — self-parent 守卫', () => {
  it('window.parent === window 时 ready() 应 warn 并静默忽略', () => {
    // 恢复 jsdom 默认状态：parent === window
    restoreParent();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const channel = new GuestChannel(createCore());

    channel.ready();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('既无 opener 也不是 iframe'));
    expect(postSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    postSpy.mockRestore();
    channel.dispose();
  });
});

describe('GuestChannel — 消息发送', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  it('握手前 send() 应入队，握手后通过 port 投递', async () => {
    const channel = new GuestChannel(createCore());
    channel.ready();

    channel.send({ type: 'queued' });

    const { port1 } = triggerAck();
    const received: unknown[] = [];
    port1.onmessage = (e) => received.push(e.data);
    port1.start();

    await drain();

    expect(received).toContainEqual({ payload: { type: 'queued' } });
    channel.dispose();
  });

  it('握手后 send() 应直接通过 port 到达 port1', async () => {
    const channel = new GuestChannel(createCore());
    channel.ready();

    const { port1 } = triggerAck();
    const received: unknown[] = [];
    port1.onmessage = (e) => received.push(e.data);
    port1.start();

    channel.send({ data: 'hello' });

    await drain();

    expect(received).toContainEqual({ payload: { data: 'hello' } });
    channel.dispose();
  });
});

describe('GuestChannel — 消息接收', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  it('host 通过 port1 发来的消息应触发 handler', async () => {
    const channel = new GuestChannel(createCore());
    const handler = vi.fn();
    channel.onMessage(handler);
    channel.ready();

    const { port1 } = triggerAck();
    port1.postMessage({ payload: { command: 'init' } });

    await drain();

    expect(handler).toHaveBeenCalledWith(
      { command: 'init' },
      { origin: 'https://host.example.com', appId: 'test-app' },
    );
    channel.dispose();
  });

  it('stop 函数应取消对应 handler', async () => {
    const channel = new GuestChannel(createCore());
    const handler = vi.fn();

    const stop = channel.onMessage(handler);
    stop();
    channel.ready();

    const { port1 } = triggerAck();
    port1.postMessage({ payload: 'test' });

    await drain();

    expect(handler).not.toHaveBeenCalled();
    channel.dispose();
  });
});

describe('GuestChannel — 重复 ready()（Bug: 旧 port 泄漏）', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  it('成功握手后再次 ready() 应关闭旧 MessageChannel，新通道独立工作', async () => {
    const channel = new GuestChannel(createCore());
    const handler = vi.fn();
    channel.onMessage(handler);

    // 第一次握手
    channel.ready();
    const { port1: oldHostPort } = triggerAck();
    await tick();

    // 第一次通道能正常收消息
    oldHostPort.postMessage({ payload: 'first-round' });
    await tick();
    expect(handler).toHaveBeenCalledWith('first-round', expect.any(Object));

    // 再次调用 ready() — 应触发旧 port 的关闭和重新握手
    handler.mockClear();
    channel.ready();
    const { port1: newHostPort } = triggerAck();
    await tick();

    // 新通道能正常收消息
    newHostPort.postMessage({ payload: 'second-round' });
    await tick();
    expect(handler).toHaveBeenCalledWith('second-round', expect.any(Object));

    // 旧通道已被 guest 侧 close，经它发来的消息不应触达 handler
    handler.mockClear();
    oldHostPort.postMessage({ payload: 'stale' });
    await tick();
    expect(handler).not.toHaveBeenCalled();

    channel.dispose();
  });

  it('第一次握手尚未完成就再次 ready() 应只清理旧监听器，新握手正常建立', async () => {
    const channel = new GuestChannel(createCore());
    const handler = vi.fn();
    channel.onMessage(handler);

    channel.ready();
    // 不触发 ack，直接再次调用 ready()
    channel.ready();
    const { port1 } = triggerAck();
    await tick();

    port1.postMessage({ payload: 'ok' });
    await tick();
    expect(handler).toHaveBeenCalledWith('ok', expect.any(Object));

    channel.dispose();
  });
});

describe('GuestChannel — 连接状态与 onConnect', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  it('握手前 connected=false，握手后 connected=true', () => {
    const channel = new GuestChannel(createCore());
    expect(channel.connected).toBe(false);

    channel.ready();
    expect(channel.connected).toBe(false);

    triggerAck();
    expect(channel.connected).toBe(true);

    channel.dispose();
    expect(channel.connected).toBe(false);
  });

  it('onConnect 在握手成功后触发', () => {
    const channel = new GuestChannel(createCore());
    const onConnect = vi.fn();
    channel.onConnect(onConnect);

    channel.ready();
    expect(onConnect).not.toHaveBeenCalled();

    triggerAck();
    expect(onConnect).toHaveBeenCalledOnce();

    channel.dispose();
  });

  it('onConnect 重新 ready() 后再次触发', () => {
    const channel = new GuestChannel(createCore());
    const onConnect = vi.fn();
    channel.onConnect(onConnect);

    channel.ready();
    triggerAck();
    channel.ready();
    triggerAck();

    expect(onConnect).toHaveBeenCalledTimes(2);
    channel.dispose();
  });

  it('onConnect 返回的 stop 函数应取消订阅', () => {
    const channel = new GuestChannel(createCore());
    const onConnect = vi.fn();
    const stop = channel.onConnect(onConnect);
    stop();

    channel.ready();
    triggerAck();

    expect(onConnect).not.toHaveBeenCalled();
    channel.dispose();
  });
});

describe('GuestChannel — dispose', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  it('dispose 后 window 监听器应移除', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const channel = new GuestChannel(createCore());
    channel.ready();

    channel.dispose();

    expect(spy).toHaveBeenCalledWith('message', expect.any(Function));
    spy.mockRestore();
  });

  it('dispose 后 ready() 应 warn 并静默忽略', () => {
    const channel = new GuestChannel(createCore());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    channel.dispose();
    channel.ready();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ready() 调用无效'));
    warnSpy.mockRestore();
  });

  it('dispose 后 send() 应 warn 并静默丢弃', () => {
    const channel = new GuestChannel(createCore());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    channel.dispose();
    channel.send({ data: 'test' });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('send() 调用无效'));
    warnSpy.mockRestore();
  });

  it('dispose 幂等：重复调用不再次触发副作用', () => {
    const channel = new GuestChannel(createCore());
    const spy = vi.spyOn(window, 'removeEventListener');
    channel.ready();

    channel.dispose();
    const firstCallCount = spy.mock.calls.length;
    channel.dispose();

    expect(spy.mock.calls.length).toBe(firstCallCount);
    spy.mockRestore();
  });
});

describe('GuestChannel — request / onRequest', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  /** 建立已握手的 channel，并返回 host 侧的 port1 用于模拟对端 */
  async function setupConnected() {
    const channel = new GuestChannel(createCore());
    channel.ready();
    const { port1 } = triggerAck();
    const received: unknown[] = [];
    port1.onmessage = (e) => received.push(e.data);
    port1.start();
    await tick();
    return { channel, port1, received };
  }

  it('request() 应发出 RequestEnvelope，收到 ok response 后 resolve', async () => {
    const { channel, port1, received } = await setupConnected();

    const promise = channel.request<{ cmd: string }, string>({ cmd: 'ping' });
    await tick();

    expect(received).toHaveLength(1);
    const req = received[0] as { __req: true; reqId: string; payload: { cmd: string } };
    expect(req.__req).toBe(true);
    expect(req.payload).toEqual({ cmd: 'ping' });
    expect(typeof req.reqId).toBe('string');

    port1.postMessage({ __res: true, reqId: req.reqId, ok: true, payload: 'pong' });
    await expect(promise).resolves.toBe('pong');

    channel.dispose();
  });

  it('request() 收到 error response 应 reject 并携带消息', async () => {
    const { channel, port1, received } = await setupConnected();

    const promise = channel.request({ cmd: 'x' });
    await tick();
    const reqId = (received[0] as { reqId: string }).reqId;

    port1.postMessage({ __res: true, reqId, ok: false, error: 'boom' });

    await expect(promise).rejects.toThrow(/remote error: boom/);
    channel.dispose();
  });

  it('request() 超时应 reject', async () => {
    const { channel } = await setupConnected();

    const promise = channel.request({ cmd: 'slow' }, { timeout: 30 });
    await expect(promise).rejects.toThrow(/超时/);

    channel.dispose();
  });

  it('request() 握手前调用应入队，握手后自动发出', async () => {
    const channel = new GuestChannel(createCore());
    const promise = channel.request<{ n: number }, number>({ n: 1 });
    channel.ready();
    const { port1 } = triggerAck();
    const received: unknown[] = [];
    port1.onmessage = (e) => received.push(e.data);
    port1.start();
    await tick();

    expect(received).toHaveLength(1);
    const req = received[0] as { reqId: string };
    port1.postMessage({ __res: true, reqId: req.reqId, ok: true, payload: 2 });
    await expect(promise).resolves.toBe(2);

    channel.dispose();
  });

  it('dispose 后调用 request() 应立即 reject', async () => {
    const channel = new GuestChannel(createCore());
    channel.dispose();
    await expect(channel.request({ x: 1 })).rejects.toThrow(/channel 已销毁/);
  });

  it('dispose 应 reject 所有 pending 请求', async () => {
    const { channel } = await setupConnected();
    const p1 = channel.request({ cmd: 'a' });
    const p2 = channel.request({ cmd: 'b' });
    await tick();

    channel.dispose();

    await expect(p1).rejects.toThrow(/aborted: channel disposed/);
    await expect(p2).rejects.toThrow(/aborted: channel disposed/);
  });

  it('onRequest handler 同步返回时应回发 ok response', async () => {
    const { channel, port1, received } = await setupConnected();

    channel.onRequest<{ n: number }, number>((req) => req.n * 2);

    port1.postMessage({ __req: true, reqId: 'r-1', payload: { n: 21 } });
    await drain();

    const reply = received.find(
      (e): e is { __res: true; reqId: string; ok: true; payload: unknown } =>
        typeof e === 'object' && e !== null && (e as { __res?: boolean }).__res === true,
    );
    expect(reply).toEqual({ __res: true, reqId: 'r-1', ok: true, payload: 42 });

    channel.dispose();
  });

  it('onRequest handler 返回 Promise 时也应正确 ok 回发', async () => {
    const { channel, port1, received } = await setupConnected();

    channel.onRequest(async (req: { echo: string }) => {
      await Promise.resolve();
      return req.echo.toUpperCase();
    });

    port1.postMessage({ __req: true, reqId: 'r-2', payload: { echo: 'hi' } });
    await drain();

    const reply = received.find(
      (e): e is { ok: true; payload: unknown } =>
        typeof e === 'object' && e !== null && (e as { __res?: boolean }).__res === true,
    );
    expect(reply).toMatchObject({ reqId: 'r-2', ok: true, payload: 'HI' });

    channel.dispose();
  });

  it('onRequest handler 抛错应回发 error response', async () => {
    const { channel, port1, received } = await setupConnected();

    channel.onRequest(() => {
      throw new Error('handler crashed');
    });

    port1.postMessage({ __req: true, reqId: 'r-3', payload: null });
    await drain();

    const reply = received.find(
      (e): e is { ok: false; error: string } =>
        typeof e === 'object' && e !== null && (e as { __res?: boolean }).__res === true,
    );
    expect(reply).toMatchObject({ reqId: 'r-3', ok: false, error: 'handler crashed' });

    channel.dispose();
  });

  it('未注册 onRequest 时收到 request 应回发 error response', async () => {
    const { channel, port1, received } = await setupConnected();

    port1.postMessage({ __req: true, reqId: 'r-4', payload: null });
    await drain();

    const reply = received.find(
      (e): e is { ok: false; error: string } =>
        typeof e === 'object' && e !== null && (e as { __res?: boolean }).__res === true,
    );
    expect(reply).toMatchObject({
      reqId: 'r-4',
      ok: false,
      error: expect.stringContaining('No request handler'),
    });

    channel.dispose();
  });

  it('onRequest 重复注册应 warn 并覆盖旧 handler', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { channel, port1, received } = await setupConnected();

    channel.onRequest(() => 'first');
    channel.onRequest(() => 'second');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('覆盖了已存在的 handler'));

    port1.postMessage({ __req: true, reqId: 'r-5', payload: null });
    await drain();

    const reply = received.find(
      (e): e is { payload: unknown } =>
        typeof e === 'object' && e !== null && (e as { __res?: boolean }).__res === true,
    );
    expect(reply).toMatchObject({ ok: true, payload: 'second' });

    warnSpy.mockRestore();
    channel.dispose();
  });

  it('onRequest stop 函数应取消 handler', async () => {
    const { channel, port1, received } = await setupConnected();

    const handler = vi.fn(() => 'ok');
    const stop = channel.onRequest(handler);
    stop();

    port1.postMessage({ __req: true, reqId: 'r-6', payload: null });
    await drain();

    expect(handler).not.toHaveBeenCalled();
    const reply = received.find(
      (e): e is { ok: false } =>
        typeof e === 'object' && e !== null && (e as { __res?: boolean }).__res === true,
    );
    expect(reply).toMatchObject({ ok: false });

    channel.dispose();
  });

  it('普通 send()/onMessage 与 request()/onRequest 互不干扰', async () => {
    const { channel, port1, received } = await setupConnected();
    const msgHandler = vi.fn();
    channel.onMessage(msgHandler);
    channel.onRequest(() => 'req-result');

    // 对端发普通消息 → 命中 onMessage，不命中 onRequest
    port1.postMessage({ payload: 'hello' });
    await drain();
    expect(msgHandler).toHaveBeenCalledWith('hello', expect.any(Object));

    // 对端发 request → 命中 onRequest，不触发 onMessage
    msgHandler.mockClear();
    port1.postMessage({ __req: true, reqId: 'r-7', payload: null });
    await drain();
    expect(msgHandler).not.toHaveBeenCalled();
    const reply = received.find(
      (e): e is { ok: true; payload: unknown } =>
        typeof e === 'object' && e !== null && (e as { __res?: boolean }).__res === true,
    );
    expect(reply).toMatchObject({ payload: 'req-result' });

    channel.dispose();
  });
});

describe('GuestChannel — 心跳 / onDisconnect', () => {
  // 使用真实（短）定时器：fake timers 与 MessagePort 的异步投递机制不兼容，
  // 因为 MessagePort 投递走 Node 的 message queue 而非 setTimeout 通道。
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  /** 等待指定 ms（真实时间） */
  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 建立已握手的 channel（配置心跳），返回用于模拟对端的 port1 */
  function setupWithHeartbeat(interval = 30, timeout = 200) {
    const channel = new GuestChannel(createCore(), { heartbeat: { interval, timeout } });
    channel.ready();
    const { port1 } = triggerAck();
    const received: unknown[] = [];
    port1.onmessage = (e) => received.push(e.data);
    port1.start();
    return { channel, port1, received };
  }

  function countPings(received: unknown[]): number {
    return received.filter(
      (e) => typeof e === 'object' && e !== null && (e as { __hb?: string }).__hb === 'ping',
    ).length;
  }

  it('心跳启用时按 interval 周期向对端发 ping', async () => {
    const { channel, received } = setupWithHeartbeat(30, 500);

    await wait(100); // 足够收到至少 2 次 ping

    expect(countPings(received)).toBeGreaterThanOrEqual(2);

    channel.dispose();
  });

  it('收到对端 ping 应立即回发 pong', async () => {
    const { channel, port1, received } = setupWithHeartbeat();

    port1.postMessage({ __hb: 'ping' });
    await wait(20);

    const pong = received.find(
      (e) => typeof e === 'object' && e !== null && (e as { __hb?: string }).__hb === 'pong',
    );
    expect(pong).toBeDefined();

    channel.dispose();
  });

  it('对端持续不回消息超过 timeout 应触发 onDisconnect 并断开', async () => {
    const channel = new GuestChannel(createCore(), {
      heartbeat: { interval: 20, timeout: 80 },
    });
    channel.ready();
    triggerAck();

    const onDisconnect = vi.fn();
    channel.onDisconnect(onDisconnect);
    expect(channel.connected).toBe(true);

    // 等待足够时间跨过 timeout 阈值，并触发至少一次 _tickHeartbeat
    await wait(150);

    expect(onDisconnect).toHaveBeenCalledWith('heartbeat-timeout');
    expect(channel.connected).toBe(false);

    channel.dispose();
  });

  it('对端持续回 pong 时 onDisconnect 不应触发', async () => {
    const { channel, port1 } = setupWithHeartbeat(20, 150);
    const onDisconnect = vi.fn();
    channel.onDisconnect(onDisconnect);

    // 200ms 内持续回 pong 保持活跃，超过 timeout 但心跳每刷新一次就重置 lastRecvAt
    const pongInterval = setInterval(() => {
      port1.postMessage({ __hb: 'pong' });
    }, 20);
    await wait(200);
    clearInterval(pongInterval);

    expect(onDisconnect).not.toHaveBeenCalled();
    expect(channel.connected).toBe(true);

    channel.dispose();
  });

  it('不配置 heartbeat 时不应启动定时器（旧行为保持）', async () => {
    const channel = new GuestChannel(createCore());
    channel.ready();
    const { port1 } = triggerAck();
    const received: unknown[] = [];
    port1.onmessage = (e) => received.push(e.data);
    port1.start();

    await wait(100);

    expect(countPings(received)).toBe(0);
    channel.dispose();
  });

  it('dispose 应停止心跳定时器', async () => {
    const { channel, received } = setupWithHeartbeat(30, 500);

    await wait(40);
    channel.dispose();
    // 等待尚在投递中的 ping 先到达，再快照，然后确认 ping 计数不再增长
    await wait(20);
    const snapshot = countPings(received);
    await wait(100);

    expect(countPings(received)).toBe(snapshot);
  });

  it('timeout <= interval 应 warn 并禁用心跳', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const channel = new GuestChannel(createCore(), {
      heartbeat: { interval: 50, timeout: 50 },
    });
    channel.ready();
    const { port1 } = triggerAck();
    const received: unknown[] = [];
    port1.onmessage = (e) => received.push(e.data);
    port1.start();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('必须大于 interval'));

    await wait(120);
    expect(countPings(received)).toBe(0);

    warnSpy.mockRestore();
    channel.dispose();
  });

  it('onDisconnect stop 函数应取消订阅', async () => {
    const channel = new GuestChannel(createCore(), {
      heartbeat: { interval: 20, timeout: 80 },
    });
    channel.ready();
    triggerAck();

    const onDisconnect = vi.fn();
    const stop = channel.onDisconnect(onDisconnect);
    stop();

    await wait(150);

    expect(onDisconnect).not.toHaveBeenCalled();
    channel.dispose();
  });

  it('重连时旧心跳定时器应停止，新连接独立工作', async () => {
    const channel = new GuestChannel(createCore(), {
      heartbeat: { interval: 30, timeout: 500 },
    });
    channel.ready();
    const ack1 = triggerAck();
    const received1: unknown[] = [];
    ack1.port1.onmessage = (e) => received1.push(e.data);
    ack1.port1.start();

    await wait(40); // 旧通道收到至少 1 次 ping

    // 重新 ready — 触发重连
    channel.ready();
    const ack2 = triggerAck();
    const received2: unknown[] = [];
    ack2.port1.onmessage = (e) => received2.push(e.data);
    ack2.port1.start();

    // 让所有尚在投递中的旧 ping 先到达
    await wait(40);
    const oldPingsSnapshot = countPings(received1);

    // 再等待一段时间，期间只有新通道应发 ping
    await wait(80);

    // 新通道应收到新 ping，旧通道的 ping 数不应继续增长
    expect(countPings(received2)).toBeGreaterThanOrEqual(1);
    expect(countPings(received1)).toBe(oldPingsSnapshot);

    channel.dispose();
  });
});
