/**
 * 流协议类型枚举
 */
export enum StreamProtocol {
  /** MP4 格式 */
  MP4 = 'mp4',
  /** WebM 格式 */
  WebM = 'webm',
  /** OGG 格式 */
  OGG = 'ogg',
  /** MOV 格式 */
  MOV = 'mov',
  /** HLS 流媒体 (.m3u8) */
  HLS = 'hls',
  /** FLV 流媒体 */
  FLV = 'flv',
  /** DASH 流媒体 (.mpd) */
  DASH = 'dash',
  /** RTMP 协议 */
  RTMP = 'rtmp',
  /** RTSP 协议 */
  RTSP = 'rtsp',
  /** WebRTC */
  WebRTC = 'webrtc',
  /** 未知协议 */
  Unknown = 'unknown',
}

/**
 * MIME 类型映射
 */
export const MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  m3u8: 'application/x-mpegURL',
  mpd: 'application/dash+xml',
  flv: 'video/x-flv',
};

/**
 * 根据文件扩展名获取 MIME 类型
 */
export function getMimeType(src: string): string {
  const pathWithoutQuery = src.split('?')[0] ?? '';
  const extension = pathWithoutQuery.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[extension] || 'video/mp4';
}

/**
 * 检测流协议类型
 * @param uri 视频地址
 * @returns 协议类型
 */
export function detectProtocol(uri: string): StreamProtocol {
  if (!uri) return StreamProtocol.Unknown;

  const lowerUri = uri.toLowerCase();

  // 协议前缀检测
  if (lowerUri.startsWith('rtmp://')) {
    return StreamProtocol.RTMP;
  }
  if (lowerUri.startsWith('rtsp://')) {
    return StreamProtocol.RTSP;
  }
  if (lowerUri.startsWith('webrtc://')) {
    return StreamProtocol.WebRTC;
  }
  if (lowerUri.startsWith('ws://') || lowerUri.startsWith('wss://')) {
    if (lowerUri.includes('webrtc') || lowerUri.includes('rtc')) {
      return StreamProtocol.WebRTC;
    }
    return StreamProtocol.Unknown;
  }

  // 扩展名检测 (去除查询参数)
  const pathPart = lowerUri.split('?')[0] ?? '';

  if (pathPart.endsWith('.m3u8')) {
    return StreamProtocol.HLS;
  }
  if (pathPart.endsWith('.mpd')) {
    return StreamProtocol.DASH;
  }
  if (pathPart.endsWith('.flv')) {
    return StreamProtocol.FLV;
  }
  if (pathPart.endsWith('.mp4') || pathPart.endsWith('.m4v')) {
    return StreamProtocol.MP4;
  }
  if (pathPart.endsWith('.webm')) {
    return StreamProtocol.WebM;
  }
  if (pathPart.endsWith('.ogg') || pathPart.endsWith('.ogv')) {
    return StreamProtocol.OGG;
  }
  if (pathPart.endsWith('.mov')) {
    return StreamProtocol.MOV;
  }

  return StreamProtocol.Unknown;
}

/**
 * 判断是否为原生支持的格式
 */
export function isNativeFormat(protocol: StreamProtocol): boolean {
  return [
    StreamProtocol.MP4,
    StreamProtocol.WebM,
    StreamProtocol.OGG,
    StreamProtocol.MOV,
  ].includes(protocol);
}

/**
 * 判断是否需要特殊播放器
 */
export function needsSpecialPlayer(protocol: StreamProtocol): boolean {
  return [
    StreamProtocol.HLS,
    StreamProtocol.FLV,
    StreamProtocol.DASH,
    StreamProtocol.RTMP,
    StreamProtocol.RTSP,
    StreamProtocol.WebRTC,
  ].includes(protocol);
}

/**
 * 默认 video.js 配置
 */
export const DEFAULT_VIDEOJS_OPTIONS = {
  autoplay: false,
  controls: true,
  fluid: true,
  responsive: true,
  playsinline: true,
  techOrder: ['html5'],
  language: 'zh-CN',
};
