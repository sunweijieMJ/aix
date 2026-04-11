import { describe, expect, it, vi } from 'vitest';
import { SDKCore } from '../../src/core/sdk.js';
import { HostChannel } from '../../src/iframe/host-channel.js';
import type { HandshakeEnvelope } from '../../src/iframe/types.js';

function createCore(debug = false) {
  return new SDKCore({ appId: 'test-app', debug });
}

function createMockIframe(src = 'https://guest.example.com/page') {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'src', { value: src, writable: false });
  const mockWindow = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(iframe, 'contentWindow', { value: mockWindow, writable: false });
  return iframe;
}

function createMockWindow() {
  return { postMessage: vi.fn() } as unknown as Window;
}

/** 模拟 guest 发出 sdk:ready */
function triggerReady(source: Window, origin = 'https://guest.example.com', appId = 'test-app') {
  const envelope: HandshakeEnvelope = { __sdk: '@kit/sdk', appId, __sys: 'sdk:ready' };
  window.dispatchEvent(new MessageEvent('message', { data: envelope, origin, source }));
}

/** 从 postMessage mock 取出最新一次握手转交的 port2 */
function getTransferredPort(mockWin: { postMessage: ReturnType<typeof vi.fn> }): MessagePort {
  const calls = mockWin.postMessage.mock.calls;
  const lastCall = calls[calls.length - 1];
  if (!lastCall) throw new Error('postMessage 未被调用');
  const transfer = lastCall[2] as MessagePort[] | undefined;
  const port = transfer?.[0];
  if (!port) throw new Error('postMessage 最后一次调用未携带 MessagePort');
  return port;
}

/** 多轮 tick，确保 MessagePort 异步投递完成 */
async function drain(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe('HostChannel — iframe 握手', () => {
  it('收到 sdk:ready 后应向 iframe 发送 sdk:ack + port2', () => {
    const iframe = createMockIframe();
    new HostChannel(createCore(), iframe);

    triggerReady(iframe.contentWindow!);

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      { __sdk: '@kit/sdk', appId: 'test-app', __sys: 'sdk:ack' },
      'https://guest.example.com',
      expect.arrayContaining([expect.any(MessagePort)]),
    );
  });

  it('source 不匹配时应静默忽略', () => {
    const iframe = createMockIframe();
    new HostChannel(createCore(), iframe);

    // 来自其他窗口
    triggerReady(window);

    expect(iframe.contentWindow!.postMessage).not.toHaveBeenCalled();
  });

  it('origin 不在 allowedOrigins 时应拒绝握手', () => {
    const iframe = createMockIframe();
    new HostChannel(createCore(), iframe, { allowedOrigins: ['https://trusted.com'] });

    triggerReady(iframe.contentWindow!, 'https://evil.com');

    expect(iframe.contentWindow!.postMessage).not.toHaveBeenCalled();
  });
});

describe('HostChannel — Window 目标（window.open 场景）', () => {
  it('以 Window 对象为目标时应正常握手', () => {
    const mockWin = createMockWindow();
    new HostChannel(createCore(), mockWin);

    triggerReady(mockWin);

    expect(mockWin.postMessage).toHaveBeenCalledWith(
      { __sdk: '@kit/sdk', appId: 'test-app', __sys: 'sdk:ack' },
      'https://guest.example.com',
      expect.arrayContaining([expect.any(MessagePort)]),
    );
  });

  it('source 不匹配 Window 目标时应静默忽略', () => {
    const mockWin = createMockWindow();
    const otherWin = createMockWindow();
    new HostChannel(createCore(), mockWin);

    triggerReady(otherWin);

    expect(mockWin.postMessage).not.toHaveBeenCalled();
  });
});

describe('HostChannel — 消息发送', () => {
  it('握手前 send() 应入队，握手后通过 MessageChannel 投递', async () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);

    channel.send({ type: 'queued' });

    triggerReady(iframe.contentWindow!);

    const port2 = getTransferredPort(
      iframe.contentWindow! as unknown as { postMessage: ReturnType<typeof vi.fn> },
    );
    const received: unknown[] = [];
    port2.onmessage = (e) => received.push(e.data);
    port2.start();

    await drain();

    expect(received).toContainEqual({ payload: { type: 'queued' } });
    channel.dispose();
  });

  it('握手後 send() 應直接通过 port 到达 port2', async () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);

    triggerReady(iframe.contentWindow!);

    const port2 = getTransferredPort(
      iframe.contentWindow! as unknown as { postMessage: ReturnType<typeof vi.fn> },
    );
    const received: unknown[] = [];
    port2.onmessage = (e) => received.push(e.data);
    port2.start();

    channel.send({ data: 'hello' });

    await drain();

    expect(received).toContainEqual({ payload: { data: 'hello' } });
    channel.dispose();
  });
});

describe('HostChannel — 消息接收', () => {
  it('guest 通过 port2 发来的消息应触发 handler', async () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    const handler = vi.fn();
    channel.onMessage(handler);

    triggerReady(iframe.contentWindow!);

    const port2 = getTransferredPort(
      iframe.contentWindow! as unknown as { postMessage: ReturnType<typeof vi.fn> },
    );
    port2.postMessage({ payload: { result: 42 } });

    await drain();

    expect(handler).toHaveBeenCalledWith(
      { result: 42 },
      {
        origin: 'https://guest.example.com',
        appId: 'test-app',
      },
    );
    channel.dispose();
  });

  it('stop 函数应取消对应 handler', async () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    const handler = vi.fn();

    const stop = channel.onMessage(handler);
    stop();

    triggerReady(iframe.contentWindow!);
    const port2 = getTransferredPort(
      iframe.contentWindow! as unknown as { postMessage: ReturnType<typeof vi.fn> },
    );
    port2.postMessage({ payload: 'test' });

    await drain();

    expect(handler).not.toHaveBeenCalled();
    channel.dispose();
  });
});

describe('HostChannel — 重连', () => {
  it('guest 重载后再次发出 sdk:ready 应重新建立通道并触发 onReconnect', () => {
    const iframe = createMockIframe();
    const onReconnect = vi.fn();
    const channel = new HostChannel(createCore(), iframe, { onReconnect });

    triggerReady(iframe.contentWindow!);
    triggerReady(iframe.contentWindow!);

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledTimes(2);
    expect(onReconnect).toHaveBeenCalledOnce();
    channel.dispose();
  });

  it('重连后旧通道消息不应到达 handlers', async () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    const handler = vi.fn();
    channel.onMessage(handler);

    triggerReady(iframe.contentWindow!);
    const oldPort2 = getTransferredPort(
      iframe.contentWindow! as unknown as { postMessage: ReturnType<typeof vi.fn> },
    );

    triggerReady(iframe.contentWindow!);

    oldPort2.postMessage({ payload: 'stale' });
    await drain();

    expect(handler).not.toHaveBeenCalled();
    channel.dispose();
  });

  it('重连后 handlers 应保留', async () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    const handler = vi.fn();
    channel.onMessage(handler);

    triggerReady(iframe.contentWindow!);
    triggerReady(iframe.contentWindow!);

    const newPort2 = getTransferredPort(
      iframe.contentWindow! as unknown as { postMessage: ReturnType<typeof vi.fn> },
    );
    newPort2.postMessage({ payload: 'after-reconnect' });

    await drain();

    expect(handler).toHaveBeenCalledWith('after-reconnect', expect.any(Object));
    channel.dispose();
  });
});

describe('HostChannel — dispose', () => {
  it('dispose 后 window 监听器应移除', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);

    channel.dispose();

    expect(spy).toHaveBeenCalledWith('message', expect.any(Function));
    spy.mockRestore();
  });

  it('dispose 后 send() 应 warn 并静默丢弃', () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    channel.dispose();
    channel.send({ data: 'test' });

    expect(iframe.contentWindow!.postMessage).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('send() 调用无效'));
    warnSpy.mockRestore();
  });
});

describe('HostChannel — warn 策略', () => {
  it('warn 始终输出（不受 debug 开关影响），便于生产排查', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const iframe = createMockIframe();
    new HostChannel(createCore(false), iframe, { allowedOrigins: ['https://trusted.com'] });

    triggerReady(iframe.contentWindow!, 'https://evil.com');

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('log（调试日志）仍受 debug 开关控制：debug=false 时静默', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const iframe = createMockIframe();
    new HostChannel(createCore(false), iframe);

    triggerReady(iframe.contentWindow!);

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe('HostChannel — 连接状态与 onConnect', () => {
  it('未握手时 connected=false', () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    expect(channel.connected).toBe(false);
    channel.dispose();
  });

  it('握手成功后 connected=true', () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);

    triggerReady(iframe.contentWindow!);

    expect(channel.connected).toBe(true);
    channel.dispose();
    expect(channel.connected).toBe(false);
  });

  it('onConnect 在首次握手成功后触发', () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    const onConnect = vi.fn();
    channel.onConnect(onConnect);

    expect(onConnect).not.toHaveBeenCalled();
    triggerReady(iframe.contentWindow!);
    expect(onConnect).toHaveBeenCalledOnce();

    channel.dispose();
  });

  it('onConnect 在重连时再次触发；onReconnect 与 onConnect 可同时注册', () => {
    const iframe = createMockIframe();
    const onReconnect = vi.fn();
    const channel = new HostChannel(createCore(), iframe, { onReconnect });
    const onConnect = vi.fn();
    channel.onConnect(onConnect);

    triggerReady(iframe.contentWindow!);
    triggerReady(iframe.contentWindow!);

    expect(onConnect).toHaveBeenCalledTimes(2);
    expect(onReconnect).toHaveBeenCalledOnce();
    channel.dispose();
  });

  it('onConnect 返回的 stop 函数应取消订阅', () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    const onConnect = vi.fn();
    const stop = channel.onConnect(onConnect);
    stop();

    triggerReady(iframe.contentWindow!);

    expect(onConnect).not.toHaveBeenCalled();
    channel.dispose();
  });
});

describe('HostChannel — dispose 幂等', () => {
  it('重复 dispose 不应抛错或重复移除监听器', () => {
    const iframe = createMockIframe();
    const channel = new HostChannel(createCore(), iframe);
    const spy = vi.spyOn(window, 'removeEventListener');

    channel.dispose();
    const firstCallCount = spy.mock.calls.length;
    channel.dispose();

    expect(spy.mock.calls.length).toBe(firstCallCount);
    spy.mockRestore();
  });
});
