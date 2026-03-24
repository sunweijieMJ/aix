import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QDTrackerAdapter } from '../../src/adapters/qdtracker.adapter.js';

describe('QDTrackerAdapter', () => {
  let originalCreateElement: typeof document.createElement;

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
    const mockInstance = {
      track: vi.fn(),
      setAccountInfo: vi.fn(),
      setCommonData: vi.fn(),
      setAes: vi.fn(),
    };
    (window as any).QDTracker = {
      init: vi.fn().mockReturnValue(mockInstance),
      use: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).QDTracker;
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

    const sdkInstance = (window.QDTracker.init as any).mock.results[0].value;
    expect(sdkInstance.track).toHaveBeenCalledWith('test_event', {
      key: 'value',
    });
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
