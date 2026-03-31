import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QDTrackerAdapter } from '../../src/adapters/qdtracker.adapter.js';

describe('QDTrackerAdapter', () => {
  let originalCreateElement: typeof document.createElement;
  let mockSdkInstance: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    // Mock script 加载
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'script') {
        // 模拟 script 加载成功
        setTimeout(() => {
          (el as HTMLScriptElement).onload?.(new Event('load'));
        }, 0);
      }
      return el;
    });
    vi.spyOn(document.head, 'appendChild').mockImplementation(
      () => null as any,
    );

    // Mock window.QDTracker
    mockSdkInstance = {
      track: vi.fn(),
      setAccountInfo: vi.fn(),
      setCommonData: vi.fn(),
      setAes: vi.fn(),
    };
    (window as any).QDTracker = {
      init: vi.fn().mockReturnValue(mockSdkInstance),
      use: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).QDTracker;
    delete (window as any).__qq_qidian_da_market_AES_method;
  });

  it('name 应为 qdtracker', () => {
    const adapter = new QDTrackerAdapter();
    expect(adapter.name).toBe('qdtracker');
  });

  it('init 前 isReady 应为 false', () => {
    const adapter = new QDTrackerAdapter();
    expect(adapter.isReady()).toBe(false);
  });

  it('init 应加载 SDK 并初始化', async () => {
    const adapter = new QDTrackerAdapter();
    await adapter.init({
      appkey: 'test_key',
      sdkUrl: 'https://cdn.example.com/QDTracker.js',
      url: 'https://report.example.com/event',
    });

    expect(adapter.isReady()).toBe(true);
    expect(window.QDTracker.init).toHaveBeenCalledWith(
      expect.objectContaining({
        appkey: 'test_key',
      }),
    );
  });

  it('track 应透传到 SDK', async () => {
    const adapter = new QDTrackerAdapter();
    await adapter.init({
      appkey: 'test',
      sdkUrl: 'https://cdn.example.com/QDTracker.js',
    });

    adapter.track('test_event', { key: 'value' });
    expect(mockSdkInstance.track).toHaveBeenCalledWith('test_event', {
      key: 'value',
    });
  });

  it('identify 应调用 sdk.setAccountInfo', async () => {
    const adapter = new QDTrackerAdapter();
    await adapter.init({
      appkey: 'test',
      sdkUrl: 'https://cdn.example.com/QDTracker.js',
    });

    const account = { uin: 'user_123', mobile: '13800000000' };
    adapter.identify(account);
    expect(mockSdkInstance.setAccountInfo).toHaveBeenCalledWith(account);
  });

  it('setCommonData 应调用 sdk.setCommonData', async () => {
    const adapter = new QDTrackerAdapter();
    await adapter.init({
      appkey: 'test',
      sdkUrl: 'https://cdn.example.com/QDTracker.js',
    });

    const data = { global_product_type: 'Web' };
    adapter.setCommonData(data);
    expect(mockSdkInstance.setCommonData).toHaveBeenCalledWith(data);
  });

  it('AES 加密模式应加载 AES 脚本并调用 setAes', async () => {
    const mockAesMethod = { encrypt: vi.fn() };
    (window as any).__qq_qidian_da_market_AES_method = mockAesMethod;

    const adapter = new QDTrackerAdapter();
    await adapter.init({
      appkey: 'test',
      sdkUrl: 'https://cdn.example.com/QDTracker.js',
      qdOptions: {
        encrypt_mode: 'aes',
        aesUrl: 'https://cdn.example.com/AES_SEC.js',
      },
    });

    expect(adapter.isReady()).toBe(true);
    expect(mockSdkInstance.setAes).toHaveBeenCalledWith(mockAesMethod);
  });

  it('SDK 加载后 window.QDTracker 不存在时应抛错', async () => {
    delete (window as any).QDTracker;

    const adapter = new QDTrackerAdapter();
    await expect(
      adapter.init({
        appkey: 'test',
        sdkUrl: 'https://cdn.example.com/QDTracker.js',
      }),
    ).rejects.toThrow('QDTracker SDK 加载后未找到 window.QDTracker');
  });

  it('destroy 后 isReady 应为 false', async () => {
    const adapter = new QDTrackerAdapter();
    await adapter.init({
      appkey: 'test',
      sdkUrl: 'https://cdn.example.com/QDTracker.js',
    });
    adapter.destroy();
    expect(adapter.isReady()).toBe(false);
  });
});
