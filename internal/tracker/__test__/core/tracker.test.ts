import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Tracker } from '../../src/core/tracker.js';
import type { ITrackerAdapter } from '../../src/types.js';

/** 创建 mock 适配器 */
function createMockAdapter(name: string, ready = true): ITrackerAdapter {
  return {
    name,
    init: vi.fn().mockResolvedValue(undefined),
    track: vi.fn(),
    identify: vi.fn(),
    setCommonData: vi.fn(),
    isReady: vi.fn().mockReturnValue(ready),
    destroy: vi.fn(),
  };
}

describe('Tracker', () => {
  let adapter: ITrackerAdapter;

  beforeEach(() => {
    adapter = createMockAdapter('test-adapter');
  });

  it('init 应初始化所有适配器', async () => {
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [adapter],
    });

    await tracker.init();
    expect(adapter.init).toHaveBeenCalledOnce();
  });

  it('track 应向已就绪适配器分发事件', async () => {
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [adapter],
    });
    await tracker.init();

    tracker.track('app_test_event_ck', { content_title: '测试' });

    expect(adapter.track).toHaveBeenCalledWith(
      'app_test_event_ck',
      expect.objectContaining({ content_title: '测试' }),
    );
  });

  it('track 应将未就绪适配器的事件缓冲，init 后 flush', async () => {
    const pendingAdapter = createMockAdapter('pending', false);
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [pendingAdapter],
    });

    // init 之前上报
    tracker.track('app_buffered_event_ck', { key: 'value' });
    expect(pendingAdapter.track).not.toHaveBeenCalled();

    // 模拟适配器就绪
    (pendingAdapter.isReady as any).mockReturnValue(true);
    await tracker.init();

    // flush 后应分发缓冲的事件
    expect(pendingAdapter.track).toHaveBeenCalledWith(
      'app_buffered_event_ck',
      expect.objectContaining({ key: 'value' }),
    );
  });

  it('已就绪适配器应立即上报，不进队列', () => {
    const readyAdapter = createMockAdapter('ready', true);
    const pendingAdapter = createMockAdapter('pending', false);

    const tracker = new Tracker({
      appkey: 'test',
      adapters: [readyAdapter, pendingAdapter],
    });

    tracker.track('app_test_event_ck', {});

    // ready 立即收到
    expect(readyAdapter.track).toHaveBeenCalledOnce();
    // pending 不应收到
    expect(pendingAdapter.track).not.toHaveBeenCalled();
  });

  it('identify 应向已就绪适配器调用并缓存', async () => {
    const pendingAdapter = createMockAdapter('pending', false);
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [pendingAdapter],
    });

    tracker.identify({ uin: '12345' });
    expect(pendingAdapter.identify).not.toHaveBeenCalled();

    // init 后回放
    (pendingAdapter.isReady as any).mockReturnValue(true);
    await tracker.init();

    expect(pendingAdapter.identify).toHaveBeenCalledWith({ uin: '12345' });
  });

  it('setCommonData 应更新公共属性并同步到适配器', async () => {
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [adapter],
    });
    await tracker.init();

    tracker.setCommonData({ global_product_type: 'Web' } as any);
    expect(adapter.setCommonData).toHaveBeenCalled();

    // track 时公共属性应合并
    tracker.track('app_test_event_ck', {});
    const callArgs = (adapter.track as any).mock.calls[0][1];
    expect(callArgs.global_product_type).toBe('Web');
  });

  it('destroy 应 flush 队列并销毁适配器', async () => {
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [adapter],
    });
    await tracker.init();

    tracker.destroy();
    expect(adapter.destroy).toHaveBeenCalledOnce();
  });

  it('适配器初始化失败不应影响其他适配器', async () => {
    const failAdapter = createMockAdapter('fail');
    (failAdapter.init as any).mockRejectedValue(new Error('init failed'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const tracker = new Tracker({
      appkey: 'test',
      adapters: [failAdapter, adapter],
    });

    await tracker.init();

    // 失败适配器记录错误
    expect(errorSpy).toHaveBeenCalled();
    // 成功适配器正常初始化
    expect(adapter.init).toHaveBeenCalledOnce();

    errorSpy.mockRestore();
  });

  it('validation block 模式应阻止非法事件上报', async () => {
    const tracker = new Tracker({
      appkey: 'test',
      adapters: [adapter],
      validation: { onViolation: 'block' },
    });
    await tracker.init();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    tracker.track('INVALID_EVENT', {});
    expect(adapter.track).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
