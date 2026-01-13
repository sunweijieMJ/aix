import { describe, expect, it } from 'vitest';
import {
  StreamProtocol,
  detectProtocol,
  getMimeType,
  isNativeFormat,
  needsSpecialPlayer,
  MIME_TYPES,
  DEFAULT_VIDEOJS_OPTIONS,
} from '../src/constants';

describe('constants', () => {
  describe('StreamProtocol', () => {
    it('应该包含所有协议类型', () => {
      expect(StreamProtocol.MP4).toBe('mp4');
      expect(StreamProtocol.WebM).toBe('webm');
      expect(StreamProtocol.OGG).toBe('ogg');
      expect(StreamProtocol.MOV).toBe('mov');
      expect(StreamProtocol.HLS).toBe('hls');
      expect(StreamProtocol.FLV).toBe('flv');
      expect(StreamProtocol.DASH).toBe('dash');
      expect(StreamProtocol.RTMP).toBe('rtmp');
      expect(StreamProtocol.RTSP).toBe('rtsp');
      expect(StreamProtocol.WebRTC).toBe('webrtc');
      expect(StreamProtocol.Unknown).toBe('unknown');
    });
  });

  describe('MIME_TYPES', () => {
    it('应该包含正确的 MIME 类型映射', () => {
      expect(MIME_TYPES.mp4).toBe('video/mp4');
      expect(MIME_TYPES.m4v).toBe('video/mp4');
      expect(MIME_TYPES.webm).toBe('video/webm');
      expect(MIME_TYPES.ogg).toBe('video/ogg');
      expect(MIME_TYPES.ogv).toBe('video/ogg');
      expect(MIME_TYPES.mov).toBe('video/quicktime');
      expect(MIME_TYPES.m3u8).toBe('application/x-mpegURL');
      expect(MIME_TYPES.mpd).toBe('application/dash+xml');
      expect(MIME_TYPES.flv).toBe('video/x-flv');
    });
  });

  describe('getMimeType', () => {
    it('应该根据扩展名返回正确的 MIME 类型', () => {
      expect(getMimeType('video.mp4')).toBe('video/mp4');
      expect(getMimeType('video.webm')).toBe('video/webm');
      expect(getMimeType('video.ogg')).toBe('video/ogg');
      expect(getMimeType('video.m3u8')).toBe('application/x-mpegURL');
      expect(getMimeType('video.mpd')).toBe('application/dash+xml');
    });

    it('应该处理带查询参数的 URL', () => {
      expect(getMimeType('video.mp4?token=abc123')).toBe('video/mp4');
      expect(getMimeType('video.m3u8?t=123456')).toBe('application/x-mpegURL');
    });

    it('未知扩展名应该返回默认值', () => {
      expect(getMimeType('video.unknown')).toBe('video/mp4');
      expect(getMimeType('video')).toBe('video/mp4');
    });
  });

  describe('detectProtocol', () => {
    describe('协议前缀检测', () => {
      it('应该检测 RTMP 协议', () => {
        expect(detectProtocol('rtmp://server/app/stream')).toBe(
          StreamProtocol.RTMP,
        );
      });

      it('应该检测 RTSP 协议', () => {
        expect(detectProtocol('rtsp://server/stream')).toBe(
          StreamProtocol.RTSP,
        );
      });

      it('应该检测 WebRTC 协议', () => {
        expect(detectProtocol('webrtc://server/stream')).toBe(
          StreamProtocol.WebRTC,
        );
      });

      it('应该检测 WebSocket WebRTC', () => {
        expect(detectProtocol('ws://server/webrtc')).toBe(
          StreamProtocol.WebRTC,
        );
        expect(detectProtocol('wss://server/rtc')).toBe(StreamProtocol.WebRTC);
      });

      it('普通 WebSocket 应该返回 Unknown', () => {
        expect(detectProtocol('ws://server/video')).toBe(
          StreamProtocol.Unknown,
        );
      });
    });

    describe('扩展名检测', () => {
      it('应该检测 HLS (.m3u8)', () => {
        expect(detectProtocol('https://example.com/video.m3u8')).toBe(
          StreamProtocol.HLS,
        );
        expect(detectProtocol('https://example.com/video.m3u8?token=abc')).toBe(
          StreamProtocol.HLS,
        );
      });

      it('应该检测 DASH (.mpd)', () => {
        expect(detectProtocol('https://example.com/video.mpd')).toBe(
          StreamProtocol.DASH,
        );
      });

      it('应该检测 FLV', () => {
        expect(detectProtocol('https://example.com/video.flv')).toBe(
          StreamProtocol.FLV,
        );
      });

      it('应该检测 MP4', () => {
        expect(detectProtocol('https://example.com/video.mp4')).toBe(
          StreamProtocol.MP4,
        );
        expect(detectProtocol('https://example.com/video.m4v')).toBe(
          StreamProtocol.MP4,
        );
      });

      it('应该检测 WebM', () => {
        expect(detectProtocol('https://example.com/video.webm')).toBe(
          StreamProtocol.WebM,
        );
      });

      it('应该检测 OGG', () => {
        expect(detectProtocol('https://example.com/video.ogg')).toBe(
          StreamProtocol.OGG,
        );
        expect(detectProtocol('https://example.com/video.ogv')).toBe(
          StreamProtocol.OGG,
        );
      });

      it('应该检测 MOV', () => {
        expect(detectProtocol('https://example.com/video.mov')).toBe(
          StreamProtocol.MOV,
        );
      });
    });

    describe('边缘情况', () => {
      it('空字符串应该返回 Unknown', () => {
        expect(detectProtocol('')).toBe(StreamProtocol.Unknown);
      });

      it('无扩展名应该返回 Unknown', () => {
        expect(detectProtocol('https://example.com/video')).toBe(
          StreamProtocol.Unknown,
        );
      });

      it('应该忽略大小写', () => {
        expect(detectProtocol('https://example.com/video.MP4')).toBe(
          StreamProtocol.MP4,
        );
        expect(detectProtocol('https://example.com/video.M3U8')).toBe(
          StreamProtocol.HLS,
        );
        expect(detectProtocol('RTSP://server/stream')).toBe(
          StreamProtocol.RTSP,
        );
      });
    });
  });

  describe('isNativeFormat', () => {
    it('原生格式应该返回 true', () => {
      expect(isNativeFormat(StreamProtocol.MP4)).toBe(true);
      expect(isNativeFormat(StreamProtocol.WebM)).toBe(true);
      expect(isNativeFormat(StreamProtocol.OGG)).toBe(true);
      expect(isNativeFormat(StreamProtocol.MOV)).toBe(true);
    });

    it('非原生格式应该返回 false', () => {
      expect(isNativeFormat(StreamProtocol.HLS)).toBe(false);
      expect(isNativeFormat(StreamProtocol.FLV)).toBe(false);
      expect(isNativeFormat(StreamProtocol.DASH)).toBe(false);
      expect(isNativeFormat(StreamProtocol.RTMP)).toBe(false);
      expect(isNativeFormat(StreamProtocol.RTSP)).toBe(false);
      expect(isNativeFormat(StreamProtocol.WebRTC)).toBe(false);
    });
  });

  describe('needsSpecialPlayer', () => {
    it('需要特殊播放器的格式应该返回 true', () => {
      expect(needsSpecialPlayer(StreamProtocol.HLS)).toBe(true);
      expect(needsSpecialPlayer(StreamProtocol.FLV)).toBe(true);
      expect(needsSpecialPlayer(StreamProtocol.DASH)).toBe(true);
      expect(needsSpecialPlayer(StreamProtocol.RTMP)).toBe(true);
      expect(needsSpecialPlayer(StreamProtocol.RTSP)).toBe(true);
      expect(needsSpecialPlayer(StreamProtocol.WebRTC)).toBe(true);
    });

    it('原生格式不需要特殊播放器', () => {
      expect(needsSpecialPlayer(StreamProtocol.MP4)).toBe(false);
      expect(needsSpecialPlayer(StreamProtocol.WebM)).toBe(false);
      expect(needsSpecialPlayer(StreamProtocol.OGG)).toBe(false);
      expect(needsSpecialPlayer(StreamProtocol.MOV)).toBe(false);
    });
  });

  describe('DEFAULT_VIDEOJS_OPTIONS', () => {
    it('应该有正确的默认值', () => {
      expect(DEFAULT_VIDEOJS_OPTIONS.autoplay).toBe(false);
      expect(DEFAULT_VIDEOJS_OPTIONS.controls).toBe(true);
      expect(DEFAULT_VIDEOJS_OPTIONS.fluid).toBe(true);
      expect(DEFAULT_VIDEOJS_OPTIONS.responsive).toBe(true);
      expect(DEFAULT_VIDEOJS_OPTIONS.playsinline).toBe(true);
      expect(DEFAULT_VIDEOJS_OPTIONS.techOrder).toEqual(['html5']);
      expect(DEFAULT_VIDEOJS_OPTIONS.language).toBe('zh-CN');
    });
  });
});
