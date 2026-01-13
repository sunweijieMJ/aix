import { describe, expect, it } from 'vitest';
import {
  VideoPlayer,
  DefaultControls,
  // Composables
  useControls,
  useEvents,
  usePlaybackController,
  usePlayerState,
  useTimerWithVisibility,
  useNetworkStatus,
  useTouchEvents,
  useOrientationChange,
  useHls,
  useFlv,
  useDash,
  useRtsp,
  useWebRTC,
  useStreamAdapter,
  useSdkLoader,
  // Constants
  StreamProtocol,
  detectProtocol,
  getMimeType,
  isNativeFormat,
  needsSpecialPlayer,
  DEFAULT_VIDEOJS_OPTIONS,
  MIME_TYPES,
} from '../src/index';

describe('模块导出', () => {
  describe('组件导出', () => {
    it('应该导出 VideoPlayer 组件', () => {
      expect(VideoPlayer).toBeDefined();
      expect(VideoPlayer.name).toBe('VideoPlayer');
    });

    it('应该导出 DefaultControls 组件', () => {
      expect(DefaultControls).toBeDefined();
      expect(DefaultControls.name).toBe('DefaultControls');
    });
  });

  describe('Composables 导出', () => {
    it('应该导出所有 composables', () => {
      expect(useControls).toBeDefined();
      expect(typeof useControls).toBe('function');

      expect(useEvents).toBeDefined();
      expect(typeof useEvents).toBe('function');

      expect(usePlaybackController).toBeDefined();
      expect(typeof usePlaybackController).toBe('function');

      expect(usePlayerState).toBeDefined();
      expect(typeof usePlayerState).toBe('function');

      expect(useTimerWithVisibility).toBeDefined();
      expect(typeof useTimerWithVisibility).toBe('function');

      expect(useNetworkStatus).toBeDefined();
      expect(typeof useNetworkStatus).toBe('function');

      expect(useTouchEvents).toBeDefined();
      expect(typeof useTouchEvents).toBe('function');

      expect(useOrientationChange).toBeDefined();
      expect(typeof useOrientationChange).toBe('function');
    });

    it('应该导出流媒体相关 composables', () => {
      expect(useHls).toBeDefined();
      expect(typeof useHls).toBe('function');

      expect(useFlv).toBeDefined();
      expect(typeof useFlv).toBe('function');

      expect(useDash).toBeDefined();
      expect(typeof useDash).toBe('function');

      expect(useRtsp).toBeDefined();
      expect(typeof useRtsp).toBe('function');

      expect(useWebRTC).toBeDefined();
      expect(typeof useWebRTC).toBe('function');

      expect(useStreamAdapter).toBeDefined();
      expect(typeof useStreamAdapter).toBe('function');

      expect(useSdkLoader).toBeDefined();
      expect(typeof useSdkLoader).toBe('function');
    });
  });

  describe('常量导出', () => {
    it('应该导出 StreamProtocol 枚举', () => {
      expect(StreamProtocol).toBeDefined();
      expect(StreamProtocol.MP4).toBe('mp4');
      expect(StreamProtocol.HLS).toBe('hls');
    });

    it('应该导出工具函数', () => {
      expect(detectProtocol).toBeDefined();
      expect(typeof detectProtocol).toBe('function');

      expect(getMimeType).toBeDefined();
      expect(typeof getMimeType).toBe('function');

      expect(isNativeFormat).toBeDefined();
      expect(typeof isNativeFormat).toBe('function');

      expect(needsSpecialPlayer).toBeDefined();
      expect(typeof needsSpecialPlayer).toBe('function');
    });

    it('应该导出默认配置', () => {
      expect(DEFAULT_VIDEOJS_OPTIONS).toBeDefined();
      expect(typeof DEFAULT_VIDEOJS_OPTIONS).toBe('object');

      expect(MIME_TYPES).toBeDefined();
      expect(typeof MIME_TYPES).toBe('object');
    });
  });
});
