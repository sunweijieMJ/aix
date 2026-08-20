import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, effectScope, nextTick } from 'vue';
import { useIdleWhileStreaming } from '../src/composables/useIdleWhileStreaming';

/** 在 effect scope 内运行，便于校验卸载清理 */
function withScope<T>(fn: () => T): { result: T; dispose: () => void } {
  const scope = effectScope();
  const result = scope.run(fn)!;
  return { result, dispose: () => scope.stop() };
}

describe('useIdleWhileStreaming', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('流式中内容静默超阈值 → 置位', () => {
    const streaming = ref(true);
    const fingerprint = ref('1:10:0');
    const { result: isIdle, dispose } = withScope(() =>
      useIdleWhileStreaming({ streaming, fingerprint, idleMs: 3000 }),
    );

    expect(isIdle.value).toBe(false);
    vi.advanceTimersByTime(2999);
    expect(isIdle.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(isIdle.value).toBe(true);
    dispose();
  });

  it('内容继续增长 → 立即撤销并重新计时', async () => {
    const streaming = ref(true);
    const fingerprint = ref('1:10:0');
    const { result: isIdle, dispose } = withScope(() =>
      useIdleWhileStreaming({ streaming, fingerprint, idleMs: 3000 }),
    );

    vi.advanceTimersByTime(3000);
    expect(isIdle.value).toBe(true);

    fingerprint.value = '1:20:0';
    await nextTick();
    expect(isIdle.value).toBe(false);

    // 重新计时：未到阈值不置位
    vi.advanceTimersByTime(2999);
    expect(isIdle.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(isIdle.value).toBe(true);
    dispose();
  });

  it('退出流式 → 立即撤销且不再置位', async () => {
    const streaming = ref(true);
    const fingerprint = ref('1:10:0');
    const { result: isIdle, dispose } = withScope(() =>
      useIdleWhileStreaming({ streaming, fingerprint, idleMs: 3000 }),
    );

    vi.advanceTimersByTime(3000);
    expect(isIdle.value).toBe(true);

    streaming.value = false;
    await nextTick();
    expect(isIdle.value).toBe(false);

    // 已停止计时，再推进也不会置位
    vi.advanceTimersByTime(10000);
    expect(isIdle.value).toBe(false);
    dispose();
  });

  it('非流式态起始 → 不计时', () => {
    const streaming = ref(false);
    const fingerprint = ref('1:10:0');
    const { result: isIdle, dispose } = withScope(() =>
      useIdleWhileStreaming({ streaming, fingerprint, idleMs: 3000 }),
    );

    vi.advanceTimersByTime(10000);
    expect(isIdle.value).toBe(false);
    dispose();
  });

  it('定时器已排队但同 tick 内退出流式 → 不置位（兜底判定）', async () => {
    const streaming = ref(true);
    const fingerprint = ref('1:10:0');
    const { result: isIdle, dispose } = withScope(() =>
      useIdleWhileStreaming({ streaming, fingerprint, idleMs: 3000 }),
    );

    // 不经 watch 直接改值后立刻到点：回调内的 toValue(streaming) 兜底应拦住
    streaming.value = false;
    vi.advanceTimersByTime(3000);
    expect(isIdle.value).toBe(false);
    dispose();
  });

  it('idleMs 支持响应式', async () => {
    const streaming = ref(true);
    const fingerprint = ref('1:10:0');
    const idleMs = ref(1000);
    const { result: isIdle, dispose } = withScope(() =>
      useIdleWhileStreaming({ streaming, fingerprint, idleMs }),
    );

    vi.advanceTimersByTime(1000);
    expect(isIdle.value).toBe(true);

    idleMs.value = 5000;
    fingerprint.value = '1:20:0';
    await nextTick();
    vi.advanceTimersByTime(1000);
    expect(isIdle.value).toBe(false);
    vi.advanceTimersByTime(4000);
    expect(isIdle.value).toBe(true);
    dispose();
  });

  it('scope 销毁后定时器不再触发', () => {
    const streaming = ref(true);
    const fingerprint = ref('1:10:0');
    const { result: isIdle, dispose } = withScope(() =>
      useIdleWhileStreaming({ streaming, fingerprint, idleMs: 3000 }),
    );

    dispose();
    vi.advanceTimersByTime(10000);
    expect(isIdle.value).toBe(false);
  });
});
