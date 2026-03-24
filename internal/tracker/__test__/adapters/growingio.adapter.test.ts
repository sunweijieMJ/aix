import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GrowingIOAdapter } from '../../src/adapters/growingio.adapter.js';

describe('GrowingIOAdapter', () => {
  const mockGdp = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete (window as any).gdp;
  });

  it('name 应为 growingio', () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
    });
    expect(adapter.name).toBe('growingio');
  });

  it('init 前 isReady 应为 false', () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
    });
    expect(adapter.isReady()).toBe(false);
  });

  it('npm 模式：传入 sdk 实例应直接使用', async () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc_123',
      dataSourceId: 'ds_456',
      host: 'https://api.growingio.com',
      sdk: mockGdp,
    });

    await adapter.init({ appkey: 'test' });

    expect(adapter.isReady()).toBe(true);
    expect(mockGdp).toHaveBeenCalledWith(
      'init',
      'acc_123',
      'ds_456',
      expect.objectContaining({ host: 'https://api.growingio.com' }),
    );
  });

  it('CDN 模式：传入 sdkUrl 应加载脚本', async () => {
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'script') {
        setTimeout(() => {
          (window as any).gdp = mockGdp;
          (el as HTMLScriptElement).onload?.(new Event('load'));
        }, 0);
      }
      return el;
    });
    vi.spyOn(document.head, 'appendChild').mockImplementation(
      () => null as any,
    );

    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://api.growingio.com',
      sdkUrl: 'https://assets.giocdn.com/sdk/webjs/cdp/gdp-full.js',
    });

    await adapter.init({ appkey: 'test' });

    expect(adapter.isReady()).toBe(true);
    expect(mockGdp).toHaveBeenCalledWith(
      'init',
      'acc',
      'ds',
      expect.any(Object),
    );
  });

  it('sdk 和 sdkUrl 都不传应抛错', async () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
    });

    await expect(adapter.init({ appkey: 'test' })).rejects.toThrow(
      '需要提供 sdk（npm 实例）或 sdkUrl（CDN 地址）',
    );
  });

  it('track 应调用 gdp("track", ...)', async () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
      sdk: mockGdp,
    });
    await adapter.init({ appkey: 'test' });
    mockGdp.mockClear();

    adapter.track('purchase', { amount: 99 });
    expect(mockGdp).toHaveBeenCalledWith('track', 'purchase', { amount: 99 });
  });

  it('identify 应调用 gdp("setUserId", ...)', async () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
      sdk: mockGdp,
    });
    await adapter.init({ appkey: 'test' });
    mockGdp.mockClear();

    adapter.identify({ uin: 'user_123' });
    expect(mockGdp).toHaveBeenCalledWith('setUserId', 'user_123');
  });

  it('identify 无 uin 时不应调用', async () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
      sdk: mockGdp,
    });
    await adapter.init({ appkey: 'test' });
    mockGdp.mockClear();

    adapter.identify({});
    expect(mockGdp).not.toHaveBeenCalled();
  });

  it('setCommonData 应调用 gdp("setGeneralProps", ...)', async () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
      sdk: mockGdp,
    });
    await adapter.init({ appkey: 'test' });
    mockGdp.mockClear();

    adapter.setCommonData({ platform: 'Web' });
    expect(mockGdp).toHaveBeenCalledWith('setGeneralProps', {
      platform: 'Web',
    });
  });

  it('init 带 version 应传入配置', async () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
      sdk: mockGdp,
      version: '1.0.0',
    });
    await adapter.init({ appkey: 'test' });

    expect(mockGdp).toHaveBeenCalledWith(
      'init',
      'acc',
      'ds',
      expect.objectContaining({
        host: 'https://test.growingio.com',
        version: '1.0.0',
      }),
    );
  });

  it('destroy 后 isReady 应为 false', async () => {
    const adapter = new GrowingIOAdapter({
      accountId: 'acc',
      dataSourceId: 'ds',
      host: 'https://test.growingio.com',
      sdk: mockGdp,
    });
    await adapter.init({ appkey: 'test' });
    adapter.destroy();
    expect(adapter.isReady()).toBe(false);
  });
});
