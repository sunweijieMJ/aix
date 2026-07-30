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

describe('useSpeech 会话竞态', () => {
  /** 真实浏览器的 MediaRecorder.onstop 是异步的，同步桩会让竞态窗口消失 */
  function stubAsyncMediaRecorder(stopDelay = 30) {
    class AsyncMediaRecorder {
      state: 'inactive' | 'recording' | 'paused' = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onstart: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onresume: (() => void) | null = null;

      static isTypeSupported(): boolean {
        return true;
      }
      start(): void {
        this.state = 'recording';
        this.onstart?.();
        this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
      }
      stop(): void {
        this.state = 'inactive';
        setTimeout(() => this.onstop?.(), stopDelay);
      }
      pause(): void {
        this.state = 'paused';
        this.onpause?.();
      }
      resume(): void {
        this.state = 'recording';
        this.onresume?.();
      }
    }
    vi.stubGlobal('MediaRecorder', AsyncMediaRecorder);
  }

  it('stopRecording 未结束就重新开始，不应拆掉新一轮录音', async () => {
    stubAsyncMediaRecorder();
    const { speech } = mountSpeech();

    await speech.startRecording();

    // 用户点了停止又立刻重新开始：旧的收尾流程还在等 onstop 回填
    const stopping = speech.stopRecording();
    await speech.startRecording();

    const contextsAfterRestart = audio.contextCount;
    await stopping;

    // 修复前：迟到的收尾按"当前"字段释放，把新一轮的麦克风和 AudioContext 一并拆掉，
    // 结果是 isRecording=true 但已断麦的假死状态
    expect(speech.isRecording.value).toBe(true);
    expect(mic.liveTrackCount).toBe(1);
    expect(audio.closedCount).toBeLessThan(contextsAfterRestart);

    await speech.stopRecording();
    expect(mic.liveTrackCount).toBe(0);
  });

  it('等麦克风权限期间重新开始，被取代那一轮的音轨也要归还', async () => {
    const { speech } = mountSpeech();

    // isRecording 要到 recorder.start() 才置位，等授权弹窗期间第二次点击拦不住
    const first = speech.startRecording();
    const second = speech.startRecording();
    await Promise.all([first, second]);

    expect(mic.callCount).toBe(2);
    await speech.stopRecording();

    // 被取代那一轮的 hub 在流到手之前就被 destroy 过（那时无轨可停），
    // 不补一次归还，这条音轨会一直活着 —— 录音红点常亮到刷新页面
    expect(mic.liveTrackCount).toBe(0);
  });

  it('建连期间用户停止录音，不应在资源释放后才启动识别', async () => {
    // ASR 建连要几百毫秒，用户完全可能在这期间就点了停止
    let openSocket: (() => void) | null = null;
    class SlowWS {
      static OPEN = 1;
      readyState = 0;
      binaryType = '';
      sent: Array<string | ArrayBuffer> = [];
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(public url: string) {
        openSocket = () => {
          this.readyState = 1;
          this.onopen?.();
        };
      }
      send(d: string | ArrayBuffer) {
        this.sent.push(d);
      }
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
      textFrames() {
        return this.sent.filter((d): d is string => typeof d === 'string');
      }
    }
    const sockets: SlowWS[] = [];
    vi.stubGlobal(
      'WebSocket',
      class extends SlowWS {
        constructor(url: string) {
          super(url);
          sockets.push(this);
        }
      },
    );

    const { speech } = mountSpeech({
      asr: { provider: 'proxy', auth: { mode: 'ws-proxy', wsEndpoint: 'wss://gw' } },
    });

    const starting = speech.startRecording();
    await new Promise((r) => setTimeout(r, 0));
    expect(speech.isRecording.value).toBe(true); // 已在录，正等建连

    await speech.stopRecording();
    openSocket!(); // 建连在停止之后才完成
    await starting;

    // 代次守卫只挡"被新一轮取代"，挡不住"本轮已停止"：
    // 修复前会继续 attach + start，识别在无音源的情况下跑起来，
    // state 卡在 recording、后端凭空多一个已开启的识别任务
    expect(speech.state.value).not.toBe('recording');
    expect(sockets[0]!.textFrames().some((f) => f.includes('"start"'))).toBe(false);
    expect(mic.liveTrackCount).toBe(0);
  });

  it('被取代的那一轮结果不应覆盖新一轮，且要撤销其 ObjectURL', async () => {
    stubAsyncMediaRecorder();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stale');

    const { speech } = mountSpeech();
    await speech.startRecording();

    const stopping = speech.stopRecording();
    await speech.startRecording();
    const before = revoke.mock.calls.length;
    await stopping;

    // 旧一轮的录音结果被丢弃，但它的 ObjectURL 必须释放，否则 Blob 一直被引用
    expect(revoke.mock.calls.length).toBeGreaterThan(before);
    expect(speech.recordingResult.value).toBeNull();

    await speech.stopRecording();
    revoke.mockRestore();
  });
});

describe('useSpeech 配置透传与容错', () => {
  it('recorder 配置应完整透传给 Recorder，而不只有 maxDuration', async () => {
    const constructed: Array<{ mimeType?: string }> = [];
    class RecordingMediaRecorder {
      state: 'inactive' | 'recording' | 'paused' = 'inactive';
      mimeType: string;
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onstart: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onresume: (() => void) | null = null;

      static isTypeSupported(): boolean {
        return true;
      }
      constructor(_stream: unknown, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? 'audio/webm';
        constructed.push({ mimeType: options?.mimeType });
      }
      start(): void {
        this.state = 'recording';
        this.onstart?.();
      }
      stop(): void {
        this.state = 'inactive';
        this.onstop?.();
      }
      pause(): void {}
      resume(): void {}
    }
    vi.stubGlobal('MediaRecorder', RecordingMediaRecorder);

    const { speech } = mountSpeech({
      asr: { provider: 'browser' },
      recorder: { mimeType: 'audio/mp4', maxDuration: 30 },
    });
    await speech.startRecording();

    // 修复前只取 maxDuration，mimeType 被静默丢弃
    expect(constructed[0]?.mimeType).toBe('audio/mp4');
    await speech.stopRecording();
  });

  it('ASR 连接失败不应连累录音本身', async () => {
    // BrowserASR 在无 SpeechRecognition 的环境里 connect() 会抛错
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);

    const { speech } = mountSpeech();
    await speech.startRecording();

    // 麦克风已就绪，音频照录；错误只经 asrError 暴露
    expect(speech.isRecording.value).toBe(true);
    expect(speech.asrError.value).toBeInstanceOf(Error);
    expect(mic.liveTrackCount).toBe(1);

    const result = await speech.stopRecording();
    expect(result).not.toBeNull();
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

  it('用户全程未出声也应触发静音超时自动停止', async () => {
    vi.useFakeTimers();
    const { speech } = mountSpeech({
      asr: { provider: 'browser', maxSilenceDuration: 1 },
    });

    await speech.startRecording();
    audio.setInputLevel(0); // 开麦后一言不发

    // 修复前靠"说话→静音"边沿判定，这种场景永远不会自动停止
    await vi.advanceTimersByTimeAsync(1500);

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
