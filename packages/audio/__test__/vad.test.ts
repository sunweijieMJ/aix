/**
 * VAD 静音检测测试
 * VAD 现在驱动 useSpeech 的静音自动停止，属关键路径
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VAD } from '../src/core/audio/vad';
import type { VADEvent } from '../src/types';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VAD', () => {
  it('能量超过阈值应判定为说话', () => {
    const events: VADEvent[] = [];
    const vad = new VAD({ threshold: 10, sampleInterval: 100 });

    // getEnergy 返回 0-1，内部换算为 0-100 再与 threshold 比较
    vad.start(
      () => 0.5,
      (e) => events.push(e),
    );
    vi.advanceTimersByTime(100);

    expect(events).toHaveLength(1);
    expect(events[0]!.isSilent).toBe(false);
    expect(events[0]!.energy).toBe(50);
    vad.stop();
  });

  it('持续静音达到阈值时长才判定为静音', () => {
    const events: VADEvent[] = [];
    let energy = 0.5;
    const vad = new VAD({ threshold: 10, silenceDuration: 1000, sampleInterval: 100 });

    vad.start(
      () => energy,
      (e) => events.push(e),
    );
    vi.advanceTimersByTime(100); // 说话
    expect(events).toHaveLength(1);

    energy = 0; // 转静音
    vi.advanceTimersByTime(500); // 未达 1000ms
    expect(events).toHaveLength(1);

    vi.advanceTimersByTime(600); // 累计超过 1000ms
    expect(events).toHaveLength(2);
    expect(events[1]!.isSilent).toBe(true);
    vad.stop();
  });

  it('说话↔静音切换才触发回调，不会每次采样都触发', () => {
    const events: VADEvent[] = [];
    const vad = new VAD({ threshold: 10, sampleInterval: 100 });

    vad.start(
      () => 0.5,
      (e) => events.push(e),
    );
    vi.advanceTimersByTime(1000); // 持续说话 10 次采样

    expect(events).toHaveLength(1);
    vad.stop();
  });

  it('低于阈值的微弱噪声不应被当作说话', () => {
    const events: VADEvent[] = [];
    const vad = new VAD({ threshold: 20, sampleInterval: 100 });

    vad.start(
      () => 0.05,
      (e) => events.push(e),
    ); // 换算后 5 < 20
    vi.advanceTimersByTime(500);

    expect(events).toHaveLength(0);
    vad.stop();
  });

  it('stop() 后不再采样', () => {
    const getEnergy = vi.fn(() => 0.5);
    const vad = new VAD({ sampleInterval: 100 });

    vad.start(getEnergy, () => {});
    vi.advanceTimersByTime(300);
    const callsBefore = getEnergy.mock.calls.length;

    vad.stop();
    vi.advanceTimersByTime(1000);

    expect(getEnergy.mock.calls.length).toBe(callsBefore);
  });

  it('getState() 反映当前静音状态与持续时长', () => {
    const vad = new VAD({ threshold: 10, silenceDuration: 500, sampleInterval: 100 });

    vad.start(
      () => 0.5,
      () => {},
    );
    vi.advanceTimersByTime(100);

    const state = vad.getState();
    expect(state.isSilent).toBe(false);
    expect(state.silenceDuration).toBeLessThan(200);
    vad.stop();
  });
});
