/**
 * Recorder 单元测试
 * 使用 vi.stubGlobal 模拟浏览器 API
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Recorder } from '../src/core/audio/recorder';

// ── Mock ─────────────────────────────────────────────────────────────────────

const mockTrackStop = vi.fn();
const mockStream = {
  getTracks: () => [{ stop: mockTrackStop }],
} as unknown as MediaStream;

/**
 * 共享 mock 对象——实例通过 getter/setter 代理到此处，
 * 确保测试侧修改 state / 读取 event handler 与 Recorder 内部同步
 */
const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  state: 'inactive' as RecordingState,
  mimeType: 'audio/webm',
  ondataavailable: null as ((e: BlobEvent) => void) | null,
  onstop: null as (() => void) | null,
  onerror: null as ((e: Event) => void) | null,
  onstart: null as (() => void) | null,
  onpause: null as (() => void) | null,
  onresume: null as (() => void) | null,
};

/**
 * 构造函数 mock：所有属性均代理到 mockMediaRecorder，
 * state 是 live getter 使 Recorder 内部读到测试侧设置的值
 */
function MockMediaRecorder(this: any) {
  // 方法直接指向 mock fn（引用相同，call 会被记录）
  this.start = mockMediaRecorder.start;
  this.stop = mockMediaRecorder.stop;
  this.pause = mockMediaRecorder.pause;
  this.resume = mockMediaRecorder.resume;
  this.mimeType = mockMediaRecorder.mimeType;

  // state 必须用 live getter，否则测试侧改 mockMediaRecorder.state 不会反映到实例
  Object.defineProperty(this, 'state', {
    get: () => mockMediaRecorder.state,
    configurable: true,
  });

  // event handler 用 getter/setter 双向同步
  for (const key of [
    'ondataavailable',
    'onstop',
    'onerror',
    'onstart',
    'onpause',
    'onresume',
  ] as const) {
    Object.defineProperty(this, key, {
      get: () => mockMediaRecorder[key],
      set: (v) => {
        (mockMediaRecorder as any)[key] = v;
      },
      configurable: true,
    });
  }
}
(MockMediaRecorder as any).isTypeSupported = vi.fn(() => false);

beforeEach(() => {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
  });
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock') });

  vi.clearAllMocks();
  mockMediaRecorder.state = 'inactive';
  mockMediaRecorder.ondataavailable = null;
  mockMediaRecorder.onstop = null;
  mockMediaRecorder.onstart = null;
  mockMediaRecorder.onpause = null;
  mockMediaRecorder.onresume = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── 测试 ──────────────────────────────────────────────────────────────────────

describe('Recorder', () => {
  describe('init()', () => {
    it('应调用 getUserMedia 并持有 stream', async () => {
      const recorder = new Recorder();
      await recorder.init();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
      expect(recorder.getMediaStream()).toBe(mockStream);
    });

    it('getUserMedia 失败时应抛出错误并触发 onError', async () => {
      const onError = vi.fn();
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
        new Error('permission denied'),
      );

      const recorder = new Recorder({}, { onError });
      await expect(recorder.init()).rejects.toThrow('permission denied');
      expect(onError).toHaveBeenCalledOnce();
    });
  });

  describe('start()', () => {
    it('未调用 init 时直接 start 应抛出错误', () => {
      const recorder = new Recorder();
      expect(() => recorder.start()).toThrow('请先调用 init()');
    });

    it('init 后 start 应创建 MediaRecorder 并调用 start(100)', async () => {
      const recorder = new Recorder();
      await recorder.init();
      recorder.start();

      expect(mockMediaRecorder.start).toHaveBeenCalledWith(100);
    });

    it('触发 onstart 后应通知 onStateChange(recording)', async () => {
      const onStateChange = vi.fn();
      const recorder = new Recorder({}, { onStateChange });
      await recorder.init();
      recorder.start();

      // 手动触发实例上的 onstart（通过 getter 读到 mockMediaRecorder.onstart）
      mockMediaRecorder.onstart?.();
      expect(onStateChange).toHaveBeenCalledWith('recording');
    });
  });

  describe('stop()', () => {
    it('recording 状态下 stop 应调用 mediaRecorder.stop()', async () => {
      const recorder = new Recorder();
      await recorder.init();
      recorder.start();
      mockMediaRecorder.state = 'recording'; // live getter 确保 Recorder 读到此值

      recorder.stop();
      expect(mockMediaRecorder.stop).toHaveBeenCalledOnce();
    });

    it('触发 onstop 后应调用 onStop 回调并返回 RecordingResult', async () => {
      const onStop = vi.fn();
      const recorder = new Recorder({}, { onStop });
      await recorder.init();
      recorder.start();

      // 模拟数据收集
      const blob = new Blob(['audio'], { type: 'audio/webm' });
      mockMediaRecorder.ondataavailable?.({ data: blob } as BlobEvent);
      mockMediaRecorder.onstop?.();

      expect(onStop).toHaveBeenCalledOnce();
      const result = onStop.mock.calls[0]![0];
      expect(result).toHaveProperty('blob');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('duration');
      expect(result.mimeType).toBe('audio/webm');
    });
  });

  describe('pause() / resume()', () => {
    it('recording 状态下 pause 应调用 mediaRecorder.pause()', async () => {
      const recorder = new Recorder();
      await recorder.init();
      recorder.start();
      mockMediaRecorder.state = 'recording';

      recorder.pause();
      expect(mockMediaRecorder.pause).toHaveBeenCalledOnce();
    });

    it('paused 状态下 resume 应调用 mediaRecorder.resume()', async () => {
      const recorder = new Recorder();
      await recorder.init();
      recorder.start();
      mockMediaRecorder.state = 'paused';

      recorder.resume();
      expect(mockMediaRecorder.resume).toHaveBeenCalledOnce();
    });
  });

  describe('destroy()', () => {
    it('destroy 应停止所有 track 并清空 mediaStream', async () => {
      const recorder = new Recorder();
      await recorder.init();
      mockMediaRecorder.state = 'inactive';

      recorder.destroy();
      expect(mockTrackStop).toHaveBeenCalledOnce();
      expect(recorder.getMediaStream()).toBeNull();
    });
  });
});
