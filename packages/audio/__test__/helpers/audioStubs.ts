/**
 * jsdom 缺失的 Web Audio / 媒体 API 桩
 * 录音链路测试依赖 getUserMedia / AudioContext / MediaRecorder，jsdom 均未实现
 */
import { vi } from 'vitest';

export interface FakeTrack {
  kind: string;
  stop: ReturnType<typeof vi.fn>;
}

export interface FakeStream {
  getTracks: () => FakeTrack[];
  tracks: FakeTrack[];
}

/** 记录所有被申请过的麦克风流，用于断言"申请了几路"与"是否释放" */
export interface MicRegistry {
  streams: FakeStream[];
  /** getUserMedia 调用次数 */
  get callCount(): number;
  /** 尚未被 stop 的音轨数量 */
  get liveTrackCount(): number;
}

export function stubGetUserMedia(): MicRegistry {
  const streams: FakeStream[] = [];

  const mediaDevices = {
    getUserMedia: vi.fn(async () => {
      const track: FakeTrack = { kind: 'audio', stop: vi.fn() };
      const stream: FakeStream = { getTracks: () => [track], tracks: [track] };
      streams.push(stream);
      return stream as unknown as MediaStream;
    }),
  };

  Object.defineProperty(navigator, 'mediaDevices', {
    value: mediaDevices,
    configurable: true,
    writable: true,
  });

  return {
    streams,
    get callCount() {
      return streams.length;
    },
    get liveTrackCount() {
      return streams.flatMap((s) => s.tracks).filter((t) => t.stop.mock.calls.length === 0).length;
    },
  };
}

/** 可手动驱动的 ScriptProcessor 桩，用于模拟麦克风送出 PCM 帧 */
export interface FakeProcessor {
  onaudioprocess: ((event: unknown) => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  /** 模拟一帧音频到达 */
  emitFrame: (samples?: number) => void;
}

export interface AudioContextRegistry {
  /** 创建过的 AudioContext 数量 */
  get contextCount(): number;
  /** 已关闭的 AudioContext 数量 */
  get closedCount(): number;
  /** suspend() 调用次数 */
  get suspendedCount(): number;
  /** resume() 调用次数 */
  get resumedCount(): number;
  processors: FakeProcessor[];
  /**
   * 设置模拟的输入音量（0-1），驱动 WaveformAnalyser.getEnergy() / VAD
   * 0 表示静默，0.5 左右相当于正常说话
   */
  setInputLevel(level: number): void;
}

interface ContextRecord {
  closed: boolean;
  suspends: number;
  resumes: number;
}

export function stubAudioContext(): AudioContextRegistry {
  const contexts: ContextRecord[] = [];
  const processors: FakeProcessor[] = [];
  /** 时域数据相对 128 基线的偏移量，由 setInputLevel 控制 */
  let currentAmplitude = 0;

  class FakeAudioContext {
    state = 'running';
    sampleRate: number;
    destination = {};
    private record: ContextRecord = { closed: false, suspends: 0, resumes: 0 };

    constructor(options?: { sampleRate?: number }) {
      this.sampleRate = options?.sampleRate ?? 48000;
      contexts.push(this.record);
    }

    async suspend() {
      this.record.suspends++;
      this.state = 'suspended';
    }

    async resume() {
      this.record.resumes++;
      this.state = 'running';
    }

    async decodeAudioData(buffer: ArrayBuffer) {
      return { duration: 0.1, length: buffer.byteLength, sampleRate: this.sampleRate };
    }

    createBufferSource() {
      let ended = false;
      /** 真实浏览器里 source 播完（或被 stop）会派发 onended，桩必须同样派发 */
      const fireEnded = () => {
        if (ended) return;
        ended = true;
        source.onended?.();
      };
      const source = {
        buffer: null as unknown,
        onended: null as (() => void) | null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(() => setTimeout(fireEnded, 0)),
        stop: vi.fn(fireEnded),
      };
      return source;
    }

    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }

    createAnalyser() {
      return {
        fftSize: 256,
        frequencyBinCount: 128,
        smoothingTimeConstant: 0.8,
        minDecibels: -90,
        maxDecibels: -10,
        connect: vi.fn(),
        disconnect: vi.fn(),
        // 时域数据以 128 为静默基线，偏移量决定能量大小
        getByteTimeDomainData: vi.fn((array: Uint8Array) => {
          array.fill(128 + currentAmplitude);
        }),
        getByteFrequencyData: vi.fn(),
      };
    }

    createGain() {
      return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    }

    createScriptProcessor(bufferSize = 2048) {
      const processor: FakeProcessor = {
        onaudioprocess: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        emitFrame(samples = bufferSize) {
          processor.onaudioprocess?.({
            inputBuffer: { getChannelData: () => new Float32Array(samples).fill(0.5) },
          });
        },
      };
      processors.push(processor);
      return processor;
    }

    close() {
      this.record.closed = true;
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext);

  return {
    get contextCount() {
      return contexts.length;
    },
    get closedCount() {
      return contexts.filter((c) => c.closed).length;
    },
    get suspendedCount() {
      return contexts.reduce((sum, c) => sum + c.suspends, 0);
    },
    get resumedCount() {
      return contexts.reduce((sum, c) => sum + c.resumes, 0);
    },
    processors,
    setInputLevel(level: number) {
      // WaveformAnalyser: rms = sqrt(mean(((v-128)/128)^2)) * 100，energy = rms / 50
      // 反推：偏移量 = level * 0.5 * 128
      currentAmplitude = Math.round(Math.max(0, Math.min(1, level)) * 0.5 * 128);
    },
  };
}

export function stubMediaRecorder(): void {
  class FakeMediaRecorder {
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
      this.onstop?.();
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

  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
}

/**
 * Web Speech 合成 API 桩（jsdom 未实现 SpeechSynthesisUtterance）
 * @returns speak 调用的 spy
 */
export function stubSpeechSynthesis(): ReturnType<typeof vi.fn> {
  const speak = vi.fn();

  class FakeUtterance {
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: unknown = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(public text: string) {}
  }

  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', {
    speaking: false,
    paused: false,
    getVoices: () => [],
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    speak: (utterance: FakeUtterance) => {
      speak(utterance.text);
      setTimeout(() => {
        utterance.onstart?.();
        utterance.onend?.();
      }, 0);
    },
  });

  return speak;
}

/** rAF 桩：立即返回句柄，不实际调度，避免测试里波形循环无限跑 */
export function stubAnimationFrame(): void {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

/** 一次性装好录音链路所需的全部桩 */
export function stubRecordingEnvironment(): {
  mic: MicRegistry;
  audio: AudioContextRegistry;
} {
  const mic = stubGetUserMedia();
  const audio = stubAudioContext();
  stubMediaRecorder();
  stubAnimationFrame();
  return { mic, audio };
}
