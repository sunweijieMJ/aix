import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { usePlayerState } from '../src/composables/usePlayerState';

// Mock HTMLVideoElement
function createMockVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');

  // 定义可写的属性
  Object.defineProperties(video, {
    paused: { value: true, writable: true, configurable: true },
    ended: { value: false, writable: true, configurable: true },
    currentTime: { value: 0, writable: true, configurable: true },
    duration: { value: 100, writable: true, configurable: true },
    volume: { value: 1, writable: true, configurable: true },
    muted: { value: false, writable: true, configurable: true },
    buffered: {
      value: {
        length: 1,
        start: () => 0,
        end: () => 50,
      },
      writable: true,
      configurable: true,
    },
    readyState: { value: 4, writable: true, configurable: true },
  });

  return video;
}

describe('usePlayerState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('初始化', () => {
    it('应该返回响应式状态对象', () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      const state = usePlayerState(videoRef);

      expect(state.isPlaying).toBeDefined();
      expect(state.currentTime).toBeDefined();
      expect(state.duration).toBeDefined();
      expect(state.volume).toBeDefined();
      expect(state.isMuted).toBeDefined();
      expect(state.isFullscreen).toBeDefined();
      expect(state.buffered).toBeDefined();
    });

    it('初始状态应该是默认值', () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      const state = usePlayerState(videoRef);

      expect(state.isPlaying.value).toBe(false);
      expect(state.currentTime.value).toBe(0);
      expect(state.duration.value).toBe(0);
      expect(state.volume.value).toBe(1);
      expect(state.isMuted.value).toBe(false);
      expect(state.isFullscreen.value).toBe(false);
      expect(state.buffered.value).toBe(0);
    });
  });

  describe('video 元素变化', () => {
    it('设置 video 元素后应该绑定事件', async () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      usePlayerState(videoRef);

      const mockVideo = createMockVideoElement();
      const addEventListenerSpy = vi.spyOn(mockVideo, 'addEventListener');

      videoRef.value = mockVideo;
      await nextTick();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'play',
        expect.any(Function),
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'pause',
        expect.any(Function),
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'ended',
        expect.any(Function),
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'timeupdate',
        expect.any(Function),
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'volumechange',
        expect.any(Function),
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'progress',
        expect.any(Function),
      );
    });

    it('更换 video 元素后应该重新绑定事件', async () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      const mockVideo = createMockVideoElement();

      videoRef.value = mockVideo;
      usePlayerState(videoRef);
      await nextTick();

      // 设置新的 video 元素
      const newMockVideo = createMockVideoElement();
      const addEventListenerSpy = vi.spyOn(newMockVideo, 'addEventListener');

      videoRef.value = newMockVideo;
      await nextTick();

      // 验证新元素绑定了事件
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'play',
        expect.any(Function),
      );
    });
  });

  describe('状态更新', () => {
    it('play 事件应该更新 isPlaying', async () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      const state = usePlayerState(videoRef);

      const mockVideo = createMockVideoElement();
      videoRef.value = mockVideo;
      await nextTick();

      // 模拟播放状态
      Object.defineProperty(mockVideo, 'paused', { value: false });
      mockVideo.dispatchEvent(new Event('play'));

      expect(state.isPlaying.value).toBe(true);
    });

    it('pause 事件应该更新 isPlaying', async () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      const state = usePlayerState(videoRef);

      const mockVideo = createMockVideoElement();
      Object.defineProperty(mockVideo, 'paused', { value: false });
      videoRef.value = mockVideo;
      await nextTick();

      // 先设置为播放中
      mockVideo.dispatchEvent(new Event('play'));
      expect(state.isPlaying.value).toBe(true);

      // 暂停
      Object.defineProperty(mockVideo, 'paused', { value: true });
      mockVideo.dispatchEvent(new Event('pause'));
      expect(state.isPlaying.value).toBe(false);
    });

    it('timeupdate 事件应该更新 currentTime 和 duration', async () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      const state = usePlayerState(videoRef);

      const mockVideo = createMockVideoElement();
      Object.defineProperty(mockVideo, 'currentTime', {
        value: 30,
        writable: true,
      });
      Object.defineProperty(mockVideo, 'duration', {
        value: 120,
        writable: true,
      });

      videoRef.value = mockVideo;
      await nextTick();

      mockVideo.dispatchEvent(new Event('timeupdate'));

      expect(state.currentTime.value).toBe(30);
      expect(state.duration.value).toBe(120);
    });

    it('volumechange 事件应该更新 volume 和 isMuted', async () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      const state = usePlayerState(videoRef);

      const mockVideo = createMockVideoElement();
      Object.defineProperty(mockVideo, 'volume', {
        value: 0.5,
        writable: true,
      });
      Object.defineProperty(mockVideo, 'muted', {
        value: true,
        writable: true,
      });

      videoRef.value = mockVideo;
      await nextTick();

      mockVideo.dispatchEvent(new Event('volumechange'));

      expect(state.volume.value).toBe(0.5);
      expect(state.isMuted.value).toBe(true);
    });
  });

  describe('缓冲进度', () => {
    it('progress 事件应该更新 buffered (超过阈值时)', async () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      const state = usePlayerState(videoRef);

      const mockVideo = createMockVideoElement();
      Object.defineProperty(mockVideo, 'duration', { value: 100 });
      Object.defineProperty(mockVideo, 'buffered', {
        value: {
          length: 1,
          start: () => 0,
          end: () => 50,
        },
      });

      videoRef.value = mockVideo;
      await nextTick();

      mockVideo.dispatchEvent(new Event('progress'));

      // 缓冲进度 50/100 = 0.5
      expect(state.buffered.value).toBe(0.5);
    });

    it('空 buffered 不应该报错', async () => {
      const videoRef = ref<HTMLVideoElement | null>(null);
      usePlayerState(videoRef);

      const mockVideo = createMockVideoElement();
      Object.defineProperty(mockVideo, 'buffered', {
        value: {
          length: 0,
          start: () => 0,
          end: () => 0,
        },
      });

      videoRef.value = mockVideo;
      await nextTick();

      expect(() => {
        mockVideo.dispatchEvent(new Event('progress'));
      }).not.toThrow();
    });
  });
});
