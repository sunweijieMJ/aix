import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, effectScope, nextTick } from 'vue';
import { useConfirmDeadline } from '../src/composables/useConfirmDeadline';
import type { ConfirmTimeoutConfig } from '../src/types';

/** 在 effect scope 内运行，便于校验卸载清理 */
function withScope<T>(fn: () => T): { result: T; dispose: () => void } {
  const scope = effectScope();
  const result = scope.run(fn)!;
  return { result, dispose: () => scope.stop() };
}

const TIMELINE: ConfirmTimeoutConfig = {
  hintAt: 75_000,
  autoFillAt: 105_000,
  autoSubmitAt: 120_000,
};

/** 记录节点触发顺序 */
function makeSpies() {
  const order: string[] = [];
  return {
    order,
    onHint: vi.fn(() => void order.push('hint')),
    onAutoFill: vi.fn(() => void order.push('autoFill')),
    onAutoSubmit: vi.fn(() => void order.push('autoSubmit')),
  };
}

describe('useConfirmDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('按 createdAt 的绝对时刻依次触发三个节点', () => {
    const spies = makeSpies();
    const { dispose } = withScope(() =>
      useConfirmDeadline({
        createdAt: Date.now(),
        timeout: TIMELINE,
        active: true,
        ...spies,
      }),
    );

    vi.advanceTimersByTime(74_999);
    expect(spies.onHint).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spies.onHint).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    expect(spies.onAutoFill).toHaveBeenCalledTimes(1);
    expect(spies.onAutoSubmit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    expect(spies.onAutoSubmit).toHaveBeenCalledTimes(1);
    expect(spies.order).toEqual(['hint', 'autoFill', 'autoSubmit']);
    dispose();
  });

  it('hinted / autoFilled 随节点触发置位', () => {
    const spies = makeSpies();
    const { result, dispose } = withScope(() =>
      useConfirmDeadline({ createdAt: Date.now(), timeout: TIMELINE, active: true, ...spies }),
    );

    expect(result.hinted.value).toBe(false);
    expect(result.autoFilled.value).toBe(false);
    vi.advanceTimersByTime(75_000);
    expect(result.hinted.value).toBe(true);
    expect(result.autoFilled.value).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(result.autoFilled.value).toBe(true);
    dispose();
  });

  it('createdAt 前推 = 续期：已触发标记清空，整条时间线从头再走一遍', async () => {
    const spies = makeSpies();
    const createdAt = ref(Date.now());
    const { result, dispose } = withScope(() =>
      useConfirmDeadline({ createdAt, timeout: TIMELINE, active: true, ...spies }),
    );

    vi.advanceTimersByTime(75_000);
    expect(spies.order).toEqual(['hint']);
    expect(result.hinted.value).toBe(true);

    // 宿主把计时起点推到「此刻」：新一轮从头开始，hinted 一并回落
    createdAt.value = Date.now();
    await nextTick();
    expect(result.hinted.value).toBe(false);

    vi.advanceTimersByTime(74_999);
    expect(spies.onHint).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(spies.onHint).toHaveBeenCalledTimes(2);

    // 续期后的 autoFill / autoSubmit 同样不会被上一轮的 fired 吞掉
    vi.advanceTimersByTime(45_000);
    expect(spies.order).toEqual(['hint', 'hint', 'autoFill', 'autoSubmit']);
    expect(result.autoFilled.value).toBe(true);
    dispose();
  });

  it('cancel() 不可逆：续期也不会让已撤销的时间线复活', async () => {
    const spies = makeSpies();
    const createdAt = ref(Date.now());
    const { result, dispose } = withScope(() =>
      useConfirmDeadline({ createdAt, timeout: TIMELINE, active: true, ...spies }),
    );

    result.cancel();
    createdAt.value = Date.now() + 1000;
    await nextTick();

    vi.advanceTimersByTime(600_000);
    expect(spies.order).toEqual([]);
    dispose();
  });

  it('挂载即超时：createdAt 已远早于全部节点 → 立即按序补发', () => {
    const spies = makeSpies();
    const { dispose } = withScope(() =>
      useConfirmDeadline({
        createdAt: Date.now() - 600_000,
        timeout: TIMELINE,
        active: true,
        ...spies,
      }),
    );

    // 不推进任何定时器：入口即补发
    expect(spies.order).toEqual(['hint', 'autoFill', 'autoSubmit']);
    dispose();
  });

  it('后台标签页定时器被挂起：visibilitychange 回前台按已流逝时间补发', () => {
    const spies = makeSpies();
    const { dispose } = withScope(() =>
      useConfirmDeadline({ createdAt: Date.now(), timeout: TIMELINE, active: true, ...spies }),
    );

    // 只推进系统时钟、不跑定时器，模拟后台被节流/挂起
    vi.setSystemTime(Date.now() + 130_000);
    expect(spies.onHint).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('visibilitychange'));
    expect(spies.order).toEqual(['hint', 'autoFill', 'autoSubmit']);
    dispose();
  });

  it('节点只触发一次：补发后再推进定时器不重复触发', () => {
    const spies = makeSpies();
    const { dispose } = withScope(() =>
      useConfirmDeadline({ createdAt: Date.now(), timeout: TIMELINE, active: true, ...spies }),
    );

    vi.setSystemTime(Date.now() + 130_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(spies.onAutoSubmit).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(600_000);
    expect(spies.onHint).toHaveBeenCalledTimes(1);
    expect(spies.onAutoFill).toHaveBeenCalledTimes(1);
    expect(spies.onAutoSubmit).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('手动交互 cancel()：整条时间线撤销，后续节点不再触发', () => {
    const spies = makeSpies();
    const { result, dispose } = withScope(() =>
      useConfirmDeadline({ createdAt: Date.now(), timeout: TIMELINE, active: true, ...spies }),
    );

    vi.advanceTimersByTime(75_000);
    expect(spies.onHint).toHaveBeenCalledTimes(1);

    result.cancel();
    vi.advanceTimersByTime(600_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(spies.onAutoFill).not.toHaveBeenCalled();
    expect(spies.onAutoSubmit).not.toHaveBeenCalled();
    dispose();
  });

  it('active 为 false（非 awaiting 态）→ 不排程；转 true 后才计时', async () => {
    const spies = makeSpies();
    const active = ref(false);
    const { dispose } = withScope(() =>
      useConfirmDeadline({ createdAt: Date.now(), timeout: TIMELINE, active, ...spies }),
    );

    vi.advanceTimersByTime(600_000);
    expect(spies.onHint).not.toHaveBeenCalled();

    active.value = true;
    await nextTick();
    // 转为可交互时已远超全部节点 → 补发
    expect(spies.order).toEqual(['hint', 'autoFill', 'autoSubmit']);
    dispose();
  });

  it('active 中途转 false（如被顶替为 expired）→ 停表，不再触发', async () => {
    const spies = makeSpies();
    const active = ref(true);
    const { dispose } = withScope(() =>
      useConfirmDeadline({ createdAt: Date.now(), timeout: TIMELINE, active, ...spies }),
    );

    vi.advanceTimersByTime(75_000);
    expect(spies.onHint).toHaveBeenCalledTimes(1);

    active.value = false;
    await nextTick();
    vi.advanceTimersByTime(600_000);
    expect(spies.onAutoFill).not.toHaveBeenCalled();
    expect(spies.onAutoSubmit).not.toHaveBeenCalled();
    dispose();
  });

  it('缺 createdAt → 整条时间线不启用', () => {
    const spies = makeSpies();
    const { dispose } = withScope(() =>
      useConfirmDeadline({
        createdAt: undefined,
        timeout: TIMELINE,
        active: true,
        ...spies,
      }),
    );

    vi.advanceTimersByTime(600_000);
    expect(spies.order).toEqual([]);
    dispose();
  });

  it('缺 timeout 配置 → 不触发；只配部分节点时其余节点静默跳过', () => {
    const spies = makeSpies();
    const s2 = makeSpies();
    const { dispose } = withScope(() =>
      useConfirmDeadline({ createdAt: Date.now(), timeout: undefined, active: true, ...spies }),
    );
    const { dispose: dispose2 } = withScope(() =>
      useConfirmDeadline({
        createdAt: Date.now(),
        timeout: { autoSubmitAt: 10_000 },
        active: true,
        ...s2,
      }),
    );

    vi.advanceTimersByTime(600_000);
    expect(spies.order).toEqual([]);
    expect(s2.order).toEqual(['autoSubmit']);
    dispose();
    dispose2();
  });

  it('scope 销毁后定时器不再触发', () => {
    const spies = makeSpies();
    const { dispose } = withScope(() =>
      useConfirmDeadline({ createdAt: Date.now(), timeout: TIMELINE, active: true, ...spies }),
    );

    dispose();
    vi.advanceTimersByTime(600_000);
    expect(spies.order).toEqual([]);
  });
});
