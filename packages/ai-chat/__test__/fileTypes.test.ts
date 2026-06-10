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
import { describe, it, expect } from 'vitest';
import { getFileTypeMeta } from '../src/utils/fileTypes';

describe('getFileTypeMeta', () => {
  // --- PDF ---
  it('pdf 后缀 → PictureAsPdf + colorError', () => {
    const m = getFileTypeMeta('report.pdf');
    expect(m.icon).toBe(PictureAsPdf);
    expect(m.colorVar).toBe('var(--aix-colorError)');
  });

  it('大写 PDF 后缀应忽略大小写', () => {
    const m = getFileTypeMeta('A.PDF');
    expect(m.icon).toBe(PictureAsPdf);
  });

  // --- 压缩包 ---
  it('zip 后缀 → Zip + colorWarning', () => {
    const m = getFileTypeMeta('archive.zip');
    expect(m.icon).toBe(Zip);
    expect(m.colorVar).toBe('var(--aix-colorWarning)');
  });

  it('rar 后缀 → Zip', () => {
    expect(getFileTypeMeta('data.rar').icon).toBe(Zip);
  });

  it('7z 后缀 → Zip', () => {
    expect(getFileTypeMeta('data.7z').icon).toBe(Zip);
  });

  it('tar 后缀 → Zip', () => {
    expect(getFileTypeMeta('data.tar').icon).toBe(Zip);
  });

  it('gz 后缀 → Zip', () => {
    expect(getFileTypeMeta('data.tar.gz').icon).toBe(Zip);
  });

  // --- 文档 ---
  it('doc 后缀 → Description + colorPrimary', () => {
    const m = getFileTypeMeta('note.doc');
    expect(m.icon).toBe(Description);
    expect(m.colorVar).toBe('var(--aix-colorPrimary)');
  });

  it('docx 后缀 → Description + colorPrimary', () => {
    expect(getFileTypeMeta('report.docx').icon).toBe(Description);
  });

  it('txt 后缀 → Description + colorPrimary', () => {
    expect(getFileTypeMeta('readme.txt').icon).toBe(Description);
  });

  it('md 后缀 → Description + colorPrimary', () => {
    expect(getFileTypeMeta('README.md').icon).toBe(Description);
  });

  // --- 表格 ---
  it('xls 后缀 → Description + colorSuccess', () => {
    const m = getFileTypeMeta('data.xls');
    expect(m.icon).toBe(Description);
    expect(m.colorVar).toBe('var(--aix-colorSuccess)');
  });

  it('xlsx 后缀 → Description + colorSuccess', () => {
    expect(getFileTypeMeta('data.xlsx').icon).toBe(Description);
  });

  it('csv 后缀 → Description + colorSuccess', () => {
    expect(getFileTypeMeta('export.csv').icon).toBe(Description);
  });

  // --- 演示文稿 ---
  it('ppt 后缀 → Slideshow + colorWarning', () => {
    const m = getFileTypeMeta('slides.ppt');
    expect(m.icon).toBe(Slideshow);
    expect(m.colorVar).toBe('var(--aix-colorWarning)');
  });

  it('pptx 后缀 → Slideshow + colorWarning', () => {
    expect(getFileTypeMeta('slides.pptx').icon).toBe(Slideshow);
  });

  // --- 视频 ---
  it('mp4 后缀 → Movie + colorInfo', () => {
    const m = getFileTypeMeta('clip.mp4');
    expect(m.icon).toBe(Movie);
    expect(m.colorVar).toBe('var(--aix-colorInfo, var(--aix-colorPrimary))');
  });

  it('avi 后缀 → Movie', () => {
    expect(getFileTypeMeta('clip.avi').icon).toBe(Movie);
  });

  it('mov 后缀 → Movie', () => {
    expect(getFileTypeMeta('clip.mov').icon).toBe(Movie);
  });

  it('mkv 后缀 → Movie', () => {
    expect(getFileTypeMeta('clip.mkv').icon).toBe(Movie);
  });

  it('webm 后缀 → Movie', () => {
    expect(getFileTypeMeta('clip.webm').icon).toBe(Movie);
  });

  // --- 音频 ---
  it('mp3 后缀 → MusicVideo + colorInfo', () => {
    const m = getFileTypeMeta('song.mp3');
    expect(m.icon).toBe(MusicVideo);
    expect(m.colorVar).toBe('var(--aix-colorInfo, var(--aix-colorPrimary))');
  });

  it('wav 后缀 → MusicVideo', () => {
    expect(getFileTypeMeta('sound.wav').icon).toBe(MusicVideo);
  });

  it('flac 后缀 → MusicVideo', () => {
    expect(getFileTypeMeta('track.flac').icon).toBe(MusicVideo);
  });

  it('aac 后缀 → MusicVideo', () => {
    expect(getFileTypeMeta('track.aac').icon).toBe(MusicVideo);
  });

  it('ogg 后缀 → MusicVideo', () => {
    expect(getFileTypeMeta('track.ogg').icon).toBe(MusicVideo);
  });

  // --- 图片（无 url，仅名后缀判定） ---
  it('png 后缀 → Photo + colorTextSecondary', () => {
    const m = getFileTypeMeta('image.png');
    expect(m.icon).toBe(Photo);
    expect(m.colorVar).toBe('var(--aix-colorTextSecondary)');
  });

  it('jpg 后缀 → Photo', () => {
    expect(getFileTypeMeta('photo.jpg').icon).toBe(Photo);
  });

  it('jpeg 后缀 → Photo', () => {
    expect(getFileTypeMeta('photo.jpeg').icon).toBe(Photo);
  });

  it('gif 后缀 → Photo', () => {
    expect(getFileTypeMeta('anim.gif').icon).toBe(Photo);
  });

  it('webp 后缀 → Photo', () => {
    expect(getFileTypeMeta('img.webp').icon).toBe(Photo);
  });

  it('svg 后缀 → Photo', () => {
    expect(getFileTypeMeta('logo.svg').icon).toBe(Photo);
  });

  it('bmp 后缀 → Photo', () => {
    expect(getFileTypeMeta('bitmap.bmp').icon).toBe(Photo);
  });

  // --- 未知后缀降级 ---
  it('未知后缀 → File + colorTextSecondary', () => {
    const m = getFileTypeMeta('unknown.xyz');
    expect(m.icon).toBe(File);
    expect(m.colorVar).toBe('var(--aix-colorTextSecondary)');
  });

  // --- 多点文件名 ---
  it('多点文件名（a.b.pdf）取最后一个点之后', () => {
    expect(getFileTypeMeta('a.b.pdf').icon).toBe(PictureAsPdf);
  });

  // --- 无后缀 mime 兜底 ---
  it('无后缀 + video/* mime → Movie', () => {
    const m = getFileTypeMeta('videofile', 'video/mp4');
    expect(m.icon).toBe(Movie);
    expect(m.colorVar).toBe('var(--aix-colorInfo, var(--aix-colorPrimary))');
  });

  it('无后缀 + audio/* mime → MusicVideo', () => {
    const m = getFileTypeMeta('audiofile', 'audio/mpeg');
    expect(m.icon).toBe(MusicVideo);
  });

  it('无后缀 + image/* mime → Photo', () => {
    const m = getFileTypeMeta('imagefile', 'image/jpeg');
    expect(m.icon).toBe(Photo);
  });

  // --- 无后缀无 mime ---
  it('无后缀无 mime → File + colorTextSecondary', () => {
    const m = getFileTypeMeta('justname');
    expect(m.icon).toBe(File);
    expect(m.colorVar).toBe('var(--aix-colorTextSecondary)');
  });
});
