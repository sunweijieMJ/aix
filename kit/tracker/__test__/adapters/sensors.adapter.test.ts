import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SensorsAdapter } from '../../src/adapters/sensors.adapter.js';

describe('SensorsAdapter', () => {
  const mockSdk = {
    init: vi.fn(),
    track: vi.fn(),
    login: vi.fn(),
    registerSuperProperties: vi.fn(),
    clearSuperProperties: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete (window as any).sensors;
  });

  it('name 应为 sensors', () => {
    const adapter = new SensorsAdapter({ serverUrl: 'https://test.com/sa' });
    expect(adapter.name).toBe('sensors');
  });

  it('init 前 isReady 应为 false', () => {
    const adapter = new SensorsAdapter({ serverUrl: 'https://test.com/sa' });
    expect(adapter.isReady()).toBe(false);
  });

  it('npm 模式：传入 sdk 实例应直接使用', async () => {
    const adapter = new SensorsAdapter({
      serverUrl: 'https://test.com/sa',
      sdk: mockSdk,
    });

    await adapter.init({ appkey: 'test' });

    expect(adapter.isReady()).toBe(true);
    expect(mockSdk.init).toHaveBeenCalledWith(
      expect.objectContaining({ server_url: 'https://test.com/sa' }),
    );
  });

  it('CDN 模式：传入 sdkUrl 应加载脚本', async () => {
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'script') {
        setTimeout(() => {
          (window as any).sensors = mockSdk;
          (el as HTMLScriptElement).onload?.(new Event('load'));
        }, 0);
      }
      return el;
    });
    vi.spyOn(document.head, 'appendChild').mockImplementation(
      () => null as any,
    );

    const adapter = new SensorsAdapter({
      serverUrl: 'https://test.com/sa',
      sdkUrl: 'https://cdn.example.com/sensors.min.js',
    });

    await adapter.init({ appkey: 'test' });

    expect(adapter.isReady()).toBe(true);
    expect(mockSdk.init).toHaveBeenCalled();
  });

  it('sdk 和 sdkUrl 都不传应抛错', async () => {
    const adapter = new SensorsAdapter({ serverUrl: 'https://test.com/sa' });

    await expect(adapter.init({ appkey: 'test' })).rejects.toThrow(
      '需要提供 sdk（npm 实例）或 sdkUrl（CDN 地址）',
    );
  });

  it('track 应透传到 SDK', async () => {
    const adapter = new SensorsAdapter({
      serverUrl: 'https://test.com/sa',
      sdk: mockSdk,
    });
    await adapter.init({ appkey: 'test' });

    adapter.track('test_event', { key: 'value' });
    expect(mockSdk.track).toHaveBeenCalledWith('test_event', { key: 'value' });
  });

  it('identify 应调用 login', async () => {
    const adapter = new SensorsAdapter({
      serverUrl: 'https://test.com/sa',
      sdk: mockSdk,
    });
    await adapter.init({ appkey: 'test' });

    adapter.identify({ uin: 'user_123' });
    expect(mockSdk.login).toHaveBeenCalledWith('user_123');
  });

  it('identify 无 uin 时不应调用 login', async () => {
    const adapter = new SensorsAdapter({
      serverUrl: 'https://test.com/sa',
      sdk: mockSdk,
    });
    await adapter.init({ appkey: 'test' });

    adapter.identify({});
    expect(mockSdk.login).not.toHaveBeenCalled();
  });

  it('setCommonData 应调用 registerSuperProperties', async () => {
    const adapter = new SensorsAdapter({
      serverUrl: 'https://test.com/sa',
      sdk: mockSdk,
    });
    await adapter.init({ appkey: 'test' });

    adapter.setCommonData({ platform: 'Web' });
    expect(mockSdk.registerSuperProperties).toHaveBeenCalledWith({
      platform: 'Web',
    });
  });

  it('init 配置项应正确传递', async () => {
    const adapter = new SensorsAdapter({
      serverUrl: 'https://test.com/sa',
      sdk: mockSdk,
      showLog: true,
      sendType: 'ajax',
      isSinglePage: true,
    });
    await adapter.init({ appkey: 'test' });

    expect(mockSdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        server_url: 'https://test.com/sa',
        show_log: true,
        send_type: 'ajax',
        is_single_page: true,
      }),
    );
  });

  it('destroy 后 isReady 应为 false', async () => {
    const adapter = new SensorsAdapter({
      serverUrl: 'https://test.com/sa',
      sdk: mockSdk,
    });
    await adapter.init({ appkey: 'test' });
    adapter.destroy();
    expect(adapter.isReady()).toBe(false);
  });
});
