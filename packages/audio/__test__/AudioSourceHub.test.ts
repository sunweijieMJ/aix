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
