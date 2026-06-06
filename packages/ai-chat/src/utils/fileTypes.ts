import type { Component } from 'vue';
import {
  PictureAsPdf,
  Zip,
  Description,
  Slideshow,
  Movie,
  MusicVideo,
  Photo,
  File,
} from '@aix/icons';

export interface FileTypeMeta {
  icon: Component;
  /** 图标着色的 CSS 变量表达式（含 var() 包装与降级） */
  colorVar: string;
}

// 模块级常量，避免 Vue 响应式系统追踪组件对象（等效于 markRaw）
const META_PDF: FileTypeMeta = { icon: PictureAsPdf, colorVar: 'var(--aix-colorError)' };
const META_ZIP: FileTypeMeta = { icon: Zip, colorVar: 'var(--aix-colorWarning)' };
const META_DOC: FileTypeMeta = { icon: Description, colorVar: 'var(--aix-colorPrimary)' };
const META_SHEET: FileTypeMeta = { icon: Description, colorVar: 'var(--aix-colorSuccess)' };
const META_SLIDE: FileTypeMeta = { icon: Slideshow, colorVar: 'var(--aix-colorWarning)' };
const META_VIDEO: FileTypeMeta = {
  icon: Movie,
  colorVar: 'var(--aix-colorInfo, var(--aix-colorPrimary))',
};
const META_AUDIO: FileTypeMeta = {
  icon: MusicVideo,
  colorVar: 'var(--aix-colorInfo, var(--aix-colorPrimary))',
};
const META_IMAGE: FileTypeMeta = { icon: Photo, colorVar: 'var(--aix-colorTextSecondary)' };
const META_FILE: FileTypeMeta = { icon: File, colorVar: 'var(--aix-colorTextSecondary)' };

/** 后缀 → FileTypeMeta 映射表 */
const EXT_MAP: Record<string, FileTypeMeta> = {
  // PDF
  pdf: META_PDF,
  // 压缩包
  zip: META_ZIP,
  rar: META_ZIP,
  '7z': META_ZIP,
  tar: META_ZIP,
  gz: META_ZIP,
  // 文档
  doc: META_DOC,
  docx: META_DOC,
  txt: META_DOC,
  md: META_DOC,
  // 表格
  xls: META_SHEET,
  xlsx: META_SHEET,
  csv: META_SHEET,
  // 演示文稿
  ppt: META_SLIDE,
  pptx: META_SLIDE,
  // 视频
  mp4: META_VIDEO,
  avi: META_VIDEO,
  mov: META_VIDEO,
  mkv: META_VIDEO,
  webm: META_VIDEO,
  // 音频
  mp3: META_AUDIO,
  wav: META_AUDIO,
  flac: META_AUDIO,
  aac: META_AUDIO,
  ogg: META_AUDIO,
  // 图片
  png: META_IMAGE,
  jpg: META_IMAGE,
  jpeg: META_IMAGE,
  gif: META_IMAGE,
  webp: META_IMAGE,
  svg: META_IMAGE,
  bmp: META_IMAGE,
};

/**
 * 按文件名后缀（优先）/ mime 前缀（兜底）解析文件类型展示元数据。
 *
 * - 后缀取 name 最后一个 `.` 之后，统一转小写
 * - 无后缀或后缀未命中时，按 mime 前缀兜底：video/ → Movie、audio/ → MusicVideo、image/ → Photo
 * - 再降级则返回 File 图标 + colorTextSecondary
 */
export function getFileTypeMeta(name: string, mime?: string): FileTypeMeta {
  // 1. 尝试从文件名后缀查找
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx !== -1 && dotIdx < name.length - 1) {
    const ext = name.slice(dotIdx + 1).toLowerCase();
    const meta = EXT_MAP[ext];
    if (meta) return meta;
  }

  // 2. mime 前缀兜底
  if (mime) {
    if (mime.startsWith('video/')) return META_VIDEO;
    if (mime.startsWith('audio/')) return META_AUDIO;
    if (mime.startsWith('image/')) return META_IMAGE;
  }

  // 3. 最终降级
  return META_FILE;
}
