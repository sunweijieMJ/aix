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

  it('全程未出声也应在静音时长达标后通知一次', () => {
    const events: VADEvent[] = [];
    const vad = new VAD({ threshold: 10, silenceDuration: 1000, sampleInterval: 100 });

    // 用户开麦后一言不发：靠"说话→静音"边沿判定会永远等不到通知，
    // maxSilenceDuration 自动停录对这种场景整个失效
    vad.start(
      () => 0,
      (e) => events.push(e),
    );

    vi.advanceTimersByTime(900);
    expect(events).toHaveLength(0); // 未达阈值时长不误报

    vi.advanceTimersByTime(200);
    expect(events).toHaveLength(1);
    expect(events[0]!.isSilent).toBe(true);

    // 同一段静音只通知一次
    vi.advanceTimersByTime(5000);
    expect(events).toHaveLength(1);
    vad.stop();
  });

  it('说话后再次静音应重新通知', () => {
    const events: VADEvent[] = [];
    let energy = 0;
    const vad = new VAD({ threshold: 10, silenceDuration: 1000, sampleInterval: 100 });

    vad.start(
      () => energy,
      (e) => events.push(e),
    );
    vi.advanceTimersByTime(1100); // 初始静音通知
    expect(events.map((e) => e.isSilent)).toEqual([true]);

    energy = 0.5; // 开始说话
    vi.advanceTimersByTime(200);
    expect(events.map((e) => e.isSilent)).toEqual([true, false]);

    energy = 0; // 再次静音
    vi.advanceTimersByTime(1100);
    expect(events.map((e) => e.isSilent)).toEqual([true, false, true]);
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
