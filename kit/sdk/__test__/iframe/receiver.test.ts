import { describe, expect, it, vi } from 'vitest';
import { SDKCore } from '../../src/core/sdk.js';
import { IframeReceiver } from '../../src/iframe/receiver.js';
import type { IframeEnvelope } from '../../src/iframe/types.js';

function createCore() {
  return new SDKCore({ appId: 'sub-platform' });
}

function dispatchMessage<T>(
  payload: T,
  origin = 'https://main.example.com',
  appId = 'main-platform',
) {
  const envelope: IframeEnvelope<T> = { __sdk: '@kit/sdk', appId, payload };
  window.dispatchEvent(new MessageEvent('message', { data: envelope, origin }));
}

function dispatchNonSdkMessage() {
  window.dispatchEvent(
    new MessageEvent('message', { data: { foo: 'bar' }, origin: 'https://main.example.com' }),
  );
}

describe('IframeReceiver.onMessage', () => {
  it('应接收 SDK 消息并透传 payload 和 source', () => {
    const receiver = new IframeReceiver(createCore());
    const handler = vi.fn();

    receiver.onMessage(handler);
    dispatchMessage({ schoolId: '001' });

    expect(handler).toHaveBeenCalledWith(
      { schoolId: '001' },
      { origin: 'https://main.example.com', appId: 'main-platform' },
    );

    receiver.destroy();
  });

  it('非 SDK 消息应静默忽略', () => {
    const receiver = new IframeReceiver(createCore());
    const handler = vi.fn();

    receiver.onMessage(handler);
    dispatchNonSdkMessage();

    expect(handler).not.toHaveBeenCalled();
    receiver.destroy();
  });

  it('origin 不在白名单时应 warn 并丢弃', () => {
    const receiver = new IframeReceiver(createCore(), {
      allowedOrigins: ['https://main.example.com'],
    });
    const handler = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    receiver.onMessage(handler);
    dispatchMessage({ data: 'test' }, 'https://evil.com');

    expect(handler).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SDK:iframe:receiver]'),
      expect.stringContaining('https://evil.com'),
    );

    warnSpy.mockRestore();
    receiver.destroy();
  });

  it('origin 在白名单时应正常接收', () => {
    const receiver = new IframeReceiver(createCore(), {
      allowedOrigins: ['https://main.example.com'],
    });
    const handler = vi.fn();

    receiver.onMessage(handler);
    dispatchMessage({ schoolId: '001' });

    expect(handler).toHaveBeenCalledOnce();
    receiver.destroy();
  });

  it('返回的 stop 函数应取消单个监听', () => {
    const receiver = new IframeReceiver(createCore());
    const handler = vi.fn();

    const stop = receiver.onMessage(handler);
    stop();
    dispatchMessage({ data: 'test' });

    expect(handler).not.toHaveBeenCalled();
    receiver.destroy();
  });

  it('可注册多个 handler，stop 只取消对应 handler', () => {
    const receiver = new IframeReceiver(createCore());
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const stop1 = receiver.onMessage(handler1);
    receiver.onMessage(handler2);
    stop1();

    dispatchMessage({ data: 'test' });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();

    receiver.destroy();
  });
});

describe('IframeReceiver.destroy', () => {
  it('destroy 后所有 handler 不再触发', () => {
    const receiver = new IframeReceiver(createCore());
    const handler = vi.fn();

    receiver.onMessage(handler);
    receiver.destroy();

    dispatchMessage({ data: 'test' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('destroy 后调用 onMessage 应 warn 并返回空 stop 函数', () => {
    const receiver = new IframeReceiver(createCore());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    receiver.destroy();
    const stop = receiver.onMessage(vi.fn());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[SDK:iframe:receiver]'));
    expect(stop).toBeTypeOf('function');

    warnSpy.mockRestore();
  });
});
