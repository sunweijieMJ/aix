import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useClipboard, copyText } from '../src/use-clipboard';

/** 用可控的 clipboard.writeText mock 覆盖 navigator.clipboard */
function mockClipboard(impl: (text: string) => Promise<void>) {
  const writeText = vi.fn(impl);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe('useClipboard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    // 还原 clipboard / execCommand
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('copyText should write via Clipboard API and return true on success', async () => {
    const writeText = mockClipboard(() => Promise.resolve());
    const ok = await copyText('hello');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('copy should set copied true then auto-reset after copiedDuration', async () => {
    mockClipboard(() => Promise.resolve());
    const scope = effectScope();
    let api: ReturnType<typeof useClipboard> | undefined;
    scope.run(() => {
      api = useClipboard();
    });

    const ok = await api!.copy('hi');
    expect(ok).toBe(true);
    expect(api!.copied.value).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(api!.copied.value).toBe(false);
    scope.stop();
  });

  it('copy should not flip copied when copy fails', async () => {
    // Clipboard API 抛错，且 execCommand 兜底返回 false -> 整体返回 false
    mockClipboard(() => Promise.reject(new Error('denied')));
    // jsdom 未实现 execCommand，直接注入 stub（返回 false 表示兜底失败）
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => false,
    });
    const scope = effectScope();
    let api: ReturnType<typeof useClipboard> | undefined;
    scope.run(() => {
      api = useClipboard();
    });

    const ok = await api!.copy('hi');
    expect(ok).toBe(false);
    expect(api!.copied.value).toBe(false);
    scope.stop();
  });

  it('copiedDuration=0 should keep copied true (no auto-reset)', async () => {
    mockClipboard(() => Promise.resolve());
    const scope = effectScope();
    let api: ReturnType<typeof useClipboard> | undefined;
    scope.run(() => {
      api = useClipboard({ copiedDuration: 0 });
    });

    await api!.copy('hi');
    expect(api!.copied.value).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(api!.copied.value).toBe(true);
    scope.stop();
  });
});
