/**
 * useSpeech 录音链路测试
 * 覆盖麦克风生命周期（回归 N1）与共享音源推流（回归 #4 / #11）
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { useSpeech } from '../src/composables/useSpeech';
import type { SpeechConfig } from '../src/types';
import {
  stubRecordingEnvironment,
  type MicRegistry,
  type AudioContextRegistry,
} from './helpers/audioStubs';

// Web Speech API 桩：BrowserASR 自采麦克风，不参与共享音源推流
class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onstart: ((e: unknown) => void) | null = null;
  onend: ((e: unknown) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

let mic: MicRegistry;
let audio: AudioContextRegistry;

beforeEach(() => {
  ({ mic, audio } = stubRecordingEnvironment());
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mountSpeech(config: SpeechConfig = { asr: { provider: 'browser' } }) {
  let composable: ReturnType<typeof useSpeech>;
  const TestComponent = defineComponent({
    setup() {
      composable = useSpeech(config);
      return {};
    },
    template: '<div />',
  });
  const wrapper = mount(TestComponent);
  return { speech: composable!, wrapper };
}

describe('useSpeech 麦克风生命周期（回归 N1）', () => {
  it('stopRecording 后应释放全部麦克风音轨', async () => {
    const { speech } = mountSpeech();

    await speech.startRecording();
    expect(mic.liveTrackCount).toBe(1);

    await speech.stopRecording();

    // 缺了释放会导致浏览器录音红点常亮
    expect(mic.liveTrackCount).toBe(0);
  });

  it('反复录音不应累积泄漏麦克风流', async () => {
    const { speech } = mountSpeech();

    for (let i = 0; i < 3; i++) {
      await speech.startRecording();
      await speech.stopRecording();
    }

    expect(mic.callCount).toBe(3); // 每轮各申请一次
    expect(mic.liveTrackCount).toBe(0); // 每轮都归还
  });

  it('一次录音只申请一路麦克风、只开一个 AudioContext（回归 #11）', async () => {
    const { speech } = mountSpeech();

    await speech.startRecording();

    // 录音器、波形分析、ASR 推流共用同一路流与同一个上下文
    expect(mic.callCount).toBe(1);
    expect(audio.contextCount).toBe(1);

    await speech.stopRecording();
    expect(audio.closedCount).toBe(1);
  });

  it('重新录音应撤销上一轮的 ObjectURL，不泄漏 Blob', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:round-1');

    const { speech } = mountSpeech();
    await speech.startRecording();
    await speech.stopRecording();

    const before = revoke.mock.calls.length;
    await speech.startRecording(); // 第二轮会丢弃第一轮结果

    expect(revoke.mock.calls.length).toBeGreaterThan(before);
    await speech.stopRecording();
    revoke.mockRestore();
  });

  it('组件卸载时应释放麦克风', async () => {
    const { speech, wrapper } = mountSpeech();

    await speech.startRecording();
    wrapper.unmount();

    expect(mic.liveTrackCount).toBe(0);
  });

  it('启动失败时不应残留已申请的麦克风', async () => {
    const { speech } = mountSpeech();
    // 让 MediaRecorder 构造失败，模拟启动中途出错
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported() {
          return true;
        }
        constructor() {
          throw new Error('不支持的录音格式');
        }
      },
    );

    await speech.startRecording();

    expect(speech.isRecording.value).toBe(false);
    expect(mic.liveTrackCount).toBe(0);
  });
});

describe('useSpeech 自动停止（回归 #7 / #15）', () => {
  it('达到最大录音时长应自动停止并标记原因', async () => {
    vi.useFakeTimers();
    const { speech } = mountSpeech({
      asr: { provider: 'browser' },
      recorder: { maxDuration: 2 },
    });

    await speech.startRecording();
    expect(speech.isRecording.value).toBe(true);

    await vi.advanceTimersByTimeAsync(2100);

    expect(speech.isRecording.value).toBe(false);
    expect(speech.reachedMaxDuration.value).toBe(true);
    vi.useRealTimers();
  });

  it('说话后持续静音应自动停止并标记原因', async () => {
    vi.useFakeTimers();
    const { speech } = mountSpeech({
      asr: { provider: 'browser', maxSilenceDuration: 1 },
    });

    await speech.startRecording();

    // 先出声：VAD 需先进入说话态，之后的静音才有意义
    audio.setInputLevel(0.6);
    await vi.advanceTimersByTimeAsync(300);
    expect(speech.isVoiceActive.value).toBe(true);
    expect(speech.isRecording.value).toBe(true);

    // 转静音，但未达阈值时长
    audio.setInputLevel(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(speech.isRecording.value).toBe(true);

    // 静音累计超过 1 秒
    await vi.advanceTimersByTimeAsync(800);

    expect(speech.reachedSilenceTimeout.value).toBe(true);
    expect(speech.isRecording.value).toBe(false);
    vi.useRealTimers();
  });

  it('未配置 maxSilenceDuration 时不启用静音检测', async () => {
    vi.useFakeTimers();
    const { speech } = mountSpeech({ asr: { provider: 'browser' } });

    await speech.startRecording();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(speech.isRecording.value).toBe(true);
    expect(speech.reachedSilenceTimeout.value).toBe(false);

    await speech.stopRecording();
    vi.useRealTimers();
  });
});

describe('useSpeech 暂停恢复（回归 #21）', () => {
  it('重复 resumeRecording 不应叠加计时器', async () => {
    const { speech } = mountSpeech();
    await speech.startRecording();

    speech.pauseRecording();
    expect(speech.isPaused.value).toBe(true);

    speech.resumeRecording();
    speech.resumeRecording(); // 旧实现会再起一个 interval，计时翻倍
    speech.resumeRecording();

    expect(speech.isPaused.value).toBe(false);
    await speech.stopRecording();
  });

  it('未开始录音时暂停/恢复是安全的空操作', () => {
    const { speech } = mountSpeech();
    expect(() => {
      speech.pauseRecording();
      speech.resumeRecording();
    }).not.toThrow();
    expect(speech.isPaused.value).toBe(false);
  });
});

describe('useSpeech → ProxyASR 全链路推流（回归 #4）', () => {
  /** 记录发往后端的二进制帧 */
  let binaryFrames: ArrayBuffer[];

  beforeEach(() => {
    binaryFrames = [];
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onclose: (() => void) | null = null;
      textFrames: string[] = [];

      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
      send(data: string | ArrayBuffer) {
        if (typeof data === 'string') this.textFrames.push(data);
        else binaryFrames.push(data);
      }
      close() {
        this.readyState = 3;
      }
    }
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  it('录音时 PCM 帧应经共享音源送达 ProxyASR 的 WebSocket', async () => {
    const { speech } = mountSpeech({
      asr: {
        provider: 'proxy',
        auth: { mode: 'ws-proxy', wsEndpoint: 'wss://gateway/asr' },
      },
    });

    await speech.startRecording();

    // 驱动一帧麦克风音频
    const processor = audio.processors[0];
    expect(processor, '共享音源应已建立 PCM 抽头').toBeDefined();
    processor!.emitFrame(2048);

    // 修复前这里恒为 0：sendAudio 无人调用，后端一个字节都收不到
    expect(binaryFrames.length).toBeGreaterThan(0);
    expect(binaryFrames[0]!.byteLength).toBe(2048 * 2); // Int16 = 2 字节/采样点

    await speech.stopRecording();
  });

  it('停止录音后不应继续推流', async () => {
    const { speech } = mountSpeech({
      asr: {
        provider: 'proxy',
        auth: { mode: 'ws-proxy', wsEndpoint: 'wss://gateway/asr' },
      },
    });

    await speech.startRecording();
    const processor = audio.processors[0]!;
    processor.emitFrame();
    const beforeStop = binaryFrames.length;

    await speech.stopRecording();
    processor.emitFrame();

    expect(binaryFrames.length).toBe(beforeStop);
  });
});
