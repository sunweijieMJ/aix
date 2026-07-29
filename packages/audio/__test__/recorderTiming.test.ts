/**
 * Recorder 计时与最大时长测试（回归 #7 / #20）
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Recorder } from '../src/core/audio/recorder';
import { stubGetUserMedia, stubMediaRecorder } from './helpers/audioStubs';

beforeEach(() => {
  stubGetUserMedia();
  stubMediaRecorder();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Recorder maxDuration（回归 #7）', () => {
  it('达到最大时长应自动停止并触发 onMaxDuration', async () => {
    const onMaxDuration = vi.fn();
    const onStop = vi.fn();
    const rec = new Recorder({ maxDuration: 5 }, { onMaxDuration, onStop });

    await rec.init();
    rec.start();
    expect(rec.getState()).toBe('recording');

    vi.advanceTimersByTime(5000);

    // 修复前：start() 不调度任何定时器，录音永不停止
    expect(onMaxDuration).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(rec.getState()).toBe('inactive');
  });

  it('未到时限不应停止', async () => {
    const onMaxDuration = vi.fn();
    const rec = new Recorder({ maxDuration: 10 }, { onMaxDuration });

    await rec.init();
    rec.start();
    vi.advanceTimersByTime(9000);

    expect(onMaxDuration).not.toHaveBeenCalled();
    expect(rec.getState()).toBe('recording');
  });

  it('暂停期间不消耗最大时长配额', async () => {
    const onMaxDuration = vi.fn();
    const rec = new Recorder({ maxDuration: 10 }, { onMaxDuration });

    await rec.init();
    rec.start();
    vi.advanceTimersByTime(6000); // 已录 6s

    rec.pause();
    vi.advanceTimersByTime(60_000); // 暂停一分钟，不应触发
    expect(onMaxDuration).not.toHaveBeenCalled();

    rec.resume();
    vi.advanceTimersByTime(3000); // 累计 9s
    expect(onMaxDuration).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000); // 累计 10s
    expect(onMaxDuration).toHaveBeenCalledOnce();
  });

  it('手动停止后不应再触发自动停止', async () => {
    const onMaxDuration = vi.fn();
    const rec = new Recorder({ maxDuration: 5 }, { onMaxDuration });

    await rec.init();
    rec.start();
    rec.stop();
    vi.advanceTimersByTime(10_000);

    expect(onMaxDuration).not.toHaveBeenCalled();
  });
});

describe('Recorder 录音时长口径（回归 #20）', () => {
  it('结果时长应排除暂停时段', async () => {
    let result: { duration: number } | null = null;
    const rec = new Recorder({ maxDuration: 0 }, { onStop: (r) => (result = r) });

    await rec.init();
    rec.start();
    vi.advanceTimersByTime(3000); // 录 3s

    rec.pause();
    vi.advanceTimersByTime(10_000); // 暂停 10s，不该计入

    rec.resume();
    vi.advanceTimersByTime(2000); // 再录 2s
    rec.stop();

    // 修复前用墙钟计时会得到 15s
    expect(result!.duration).toBeCloseTo(5, 1);
  });

  it('getDuration() 与结果时长一致', async () => {
    let result: { duration: number } | null = null;
    const rec = new Recorder({ maxDuration: 0 }, { onStop: (r) => (result = r) });

    await rec.init();
    rec.start();
    vi.advanceTimersByTime(4000);

    const live = rec.getDuration();
    rec.stop();

    expect(live).toBeCloseTo(4, 1);
    expect(result!.duration).toBeCloseTo(live, 1);
  });

  it('maxDuration 为 0 表示不限时', async () => {
    const onMaxDuration = vi.fn();
    const rec = new Recorder({ maxDuration: 0 }, { onMaxDuration });

    await rec.init();
    rec.start();
    vi.advanceTimersByTime(3_600_000);

    expect(onMaxDuration).not.toHaveBeenCalled();
    expect(rec.getState()).toBe('recording');
  });
});

describe('Recorder 配置归一化', () => {
  it('显式传 maxDuration: undefined 应等价于不传（沿用默认 60s）', async () => {
    const onMaxDuration = vi.fn();
    const rec = new Recorder({ maxDuration: undefined }, { onMaxDuration });

    await rec.init();
    rec.start();
    vi.advanceTimersByTime(61_000);

    // 直接展开会把默认值覆盖成 undefined，导致"显式 undefined"变成不限时
    expect(onMaxDuration).toHaveBeenCalledOnce();
  });

  it('无配置时沿用文档声明的 60 秒默认值', async () => {
    const onMaxDuration = vi.fn();
    const rec = new Recorder(undefined, { onMaxDuration });

    await rec.init();
    rec.start();
    vi.advanceTimersByTime(61_000);

    expect(onMaxDuration).toHaveBeenCalledOnce();
  });
});
