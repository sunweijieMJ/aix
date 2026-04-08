import { describe, expect, it, vi } from 'vitest';
import { SDKCore } from '../../src/core/sdk.js';
import { IframeSender } from '../../src/iframe/sender.js';

function createCore(debug = false) {
  return new SDKCore({ appId: 'test-app', debug });
}

function createMockIframe(src = 'https://sub.example.com/page') {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'src', { value: src, writable: false });
  // jsdom 环境下 contentWindow 为 null，需要 mock
  const mockWindow = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(iframe, 'contentWindow', { value: mockWindow, writable: false });
  return iframe;
}

describe('IframeSender.send', () => {
  it('应向 iframe 发送包含正确信封的消息', () => {
    const core = createCore();
    const sender = new IframeSender(core);
    const iframe = createMockIframe();

    sender.send(iframe, { schoolId: '001', userId: 'u123' });

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      {
        __sdk: '@kit/sdk',
        appId: 'test-app',
        payload: { schoolId: '001', userId: 'u123' },
      },
      'https://sub.example.com',
    );
  });

  it('iframe.contentWindow 为 null 时应 warn 并静默丢弃', () => {
    const core = createCore();
    const sender = new IframeSender(core);
    const iframe = document.createElement('iframe');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    sender.send(iframe, { data: 'test' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SDK:iframe:sender]'),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });

  it('iframe.src 为空时应使用 * 作为 targetOrigin 并 warn', () => {
    const core = createCore();
    const sender = new IframeSender(core);
    const iframe = document.createElement('iframe');
    // jsdom 环境下 contentWindow 为 null，需要 mock
    const mockWindow = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: mockWindow, writable: false });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    sender.send(iframe, { data: 'test' });

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ __sdk: '@kit/sdk' }),
      '*',
    );
    warnSpy.mockRestore();
  });
});

describe('IframeSender.sendToParent', () => {
  it('应向父页面发送消息，使用指定 targetOrigin', () => {
    const core = createCore();
    const sender = new IframeSender(core);
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    sender.sendToParent({ status: 'ready' }, 'https://main.example.com');

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        __sdk: '@kit/sdk',
        appId: 'test-app',
        payload: { status: 'ready' },
      },
      'https://main.example.com',
    );
    postMessageSpy.mockRestore();
  });

  it('未指定 targetOrigin 时应默认使用 *', () => {
    const core = createCore();
    const sender = new IframeSender(core);
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    sender.sendToParent({ status: 'ready' });

    expect(postMessageSpy).toHaveBeenCalledWith(expect.any(Object), '*');
    postMessageSpy.mockRestore();
  });
});
