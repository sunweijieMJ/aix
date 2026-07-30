/**
 * AudioSourceHub 单元测试
 * 它是"一次录音只占一路麦克风"的实现基础（回归 #11 / 架构资源分散问题）
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AudioSourceHub } from '../src/core/audio/audioSourceHub';
import {
  stubGetUserMedia,
  stubAudioContext,
  type MicRegistry,
  type AudioContextRegistry,
} from './helpers/audioStubs';

let mic: MicRegistry;
let audio: AudioContextRegistry;

beforeEach(() => {
  mic = stubGetUserMedia();
  audio = stubAudioContext();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AudioSourceHub', () => {
  it('重复 init() 只申请一次麦克风', async () => {
    const hub = new AudioSourceHub();

    const first = await hub.init();
    const second = await hub.init();

    expect(mic.callCount).toBe(1);
    expect(second).toBe(first);
  });

  it('destroy() 释放音轨并关闭 AudioContext', async () => {
    const hub = new AudioSourceHub();
    await hub.init();
    hub.getContext();

    expect(mic.liveTrackCount).toBe(1);

    hub.destroy();

    expect(mic.liveTrackCount).toBe(0);
    expect(audio.closedCount).toBe(1);
  });

  it('订阅者收到 Int16 PCM 帧', async () => {
    const hub = new AudioSourceHub({ sampleRate: 16000 });
    await hub.init();

    const frames: ArrayBuffer[] = [];
    hub.onPCM((frame) => frames.push(frame));

    audio.processors[0]!.emitFrame(1024);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.byteLength).toBe(1024 * 2);
  });

  it('多个订阅者各自拿到独立副本', async () => {
    const hub = new AudioSourceHub();
    await hub.init();

    const a: ArrayBuffer[] = [];
    const b: ArrayBuffer[] = [];
    hub.onPCM((f) => a.push(f));
    hub.onPCM((f) => b.push(f));

    audio.processors[0]!.emitFrame(256);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    // 独立副本：一方转移所有权不影响另一方
    expect(a[0]).not.toBe(b[0]);
  });

  it('只建立一个 PCM 抽头，无论订阅几次', async () => {
    const hub = new AudioSourceHub();
    await hub.init();

    hub.onPCM(() => {});
    hub.onPCM(() => {});
    hub.onPCM(() => {});

    expect(audio.processors).toHaveLength(1);
  });

  it('init() 之前登记的订阅者，init() 后也能收到帧', async () => {
    const hub = new AudioSourceHub();
    const frames: ArrayBuffer[] = [];

    hub.onPCM((f) => frames.push(f)); // 早于 init
    await hub.init();

    expect(audio.processors).toHaveLength(1);
    audio.processors[0]!.emitFrame(128);
    expect(frames).toHaveLength(1);
  });

  it('取消订阅后不再收到帧', async () => {
    const hub = new AudioSourceHub();
    await hub.init();

    const frames: ArrayBuffer[] = [];
    const off = hub.onPCM((f) => frames.push(f));

    audio.processors[0]!.emitFrame();
    expect(frames).toHaveLength(1);

    off();
    audio.processors[0]!.emitFrame();

    expect(frames).toHaveLength(1);
  });

  it('上下文采样率与目标不一致时应重采样，且申报目标采样率', async () => {
    // Safari 等不接受 sampleRate 约束，AudioContext 实际跑在 48kHz。
    // 如实申报 48000 会被阿里云 NLS（只收 8k/16k）直接拒掉，必须重采样到目标值
    const hub = new AudioSourceHub({ sampleRate: 16000 });
    await hub.init();
    const context = hub.getContext() as unknown as { sampleRate: number };
    context.sampleRate = 48000;

    const frames: ArrayBuffer[] = [];
    hub.onPCM((f) => frames.push(f));
    audio.processors[0]!.emitFrame(2400); // 48kHz 下 50ms

    expect(hub.sampleRate).toBe(16000);
    // 16kHz 下同样 50ms = 800 采样点 × 2 字节
    expect(frames[0]!.byteLength).toBe(800 * 2);
  });

  it('未开启预滚动时不缓存，订阅者只收到订阅之后的音频', async () => {
    const hub = new AudioSourceHub();
    await hub.init();
    hub.onPCM(() => {}); // 触发抽头建立
    audio.processors[0]!.emitFrame(256);

    const late: ArrayBuffer[] = [];
    hub.onPCM((f) => late.push(f));

    expect(late).toHaveLength(0);
  });

  it('开启预滚动后，首个订阅者应收到接入前缓存的音频', async () => {
    // 流式 ASR 建连要几百毫秒，这期间说的话不缓存就整段丢失（首句丢字）
    const hub = new AudioSourceHub({ sampleRate: 16000, prerollMs: 3000 });
    await hub.init();

    // 尚无订阅者，但抽头已在缓存
    expect(audio.processors).toHaveLength(1);
    audio.processors[0]!.emitFrame(1024);
    audio.processors[0]!.emitFrame(1024);

    const frames: ArrayBuffer[] = [];
    hub.onPCM((f) => frames.push(f));

    expect(frames).toHaveLength(2); // 补发了建连期间的两帧
    expect(frames[0]!.byteLength).toBe(1024 * 2);

    // 补发后转为实时推送，不会重复
    audio.processors[0]!.emitFrame(1024);
    expect(frames).toHaveLength(3);
  });

  it('预滚动缓存不超过配置时长', async () => {
    // 200ms @16kHz = 3200 采样点，每帧 2048 点 → 最多留 2 帧
    const hub = new AudioSourceHub({ sampleRate: 16000, prerollMs: 200 });
    await hub.init();

    for (let i = 0; i < 10; i++) audio.processors[0]!.emitFrame(2048);

    const frames: ArrayBuffer[] = [];
    hub.onPCM((f) => frames.push(f));

    expect(frames.length).toBeLessThanOrEqual(2);
    expect(frames.length).toBeGreaterThan(0);
  });

  it('第二个订阅者不应重放已补发的预滚动缓存', async () => {
    const hub = new AudioSourceHub({ prerollMs: 3000 });
    await hub.init();
    audio.processors[0]!.emitFrame(256);

    const first: ArrayBuffer[] = [];
    const second: ArrayBuffer[] = [];
    hub.onPCM((f) => first.push(f));
    hub.onPCM((f) => second.push(f));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('等权限期间被 destroy 时，迟到的音轨也要归还', async () => {
    const hub = new AudioSourceHub();
    const initializing = hub.init();
    hub.destroy(); // 用户重开一轮 / 组件卸载，都会在授权返回前销毁

    // 这一刻还没有音轨可停，不在流到手后补一次归还，音轨会永远活着
    await expect(initializing).rejects.toThrow(/销毁/);
    expect(mic.liveTrackCount).toBe(0);
    expect(hub.getStream()).toBeNull();
  });

  it('最后一个订阅者取消时拆除抽头，不做无谓音频处理', async () => {
    const hub = new AudioSourceHub();
    await hub.init();

    const off = hub.onPCM(() => {});
    const processor = audio.processors[0]!;
    expect(processor.onaudioprocess).not.toBeNull();

    off();

    expect(processor.onaudioprocess).toBeNull();
    expect(processor.disconnect).toHaveBeenCalled();
  });
});
