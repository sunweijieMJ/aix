/**
 * 图片处理工具
 *
 * 基于 pngjs 实现 PNG 图片的读取、尺寸获取、裁剪、调整大小等操作
 */

import fs from 'node:fs';
import { PNG } from 'pngjs';

/**
 * 图片尺寸信息
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * 从文件读取 PNG 图片
 */
export function readPNG(filePath: string): Promise<PNG> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const png = new PNG();

    const cleanup = () => {
      if (!stream.destroyed) stream.destroy();
    };

    stream
      .pipe(png)
      .on('parsed', () => resolve(png))
      .on('error', (err) => {
        cleanup();
        reject(err);
      });
    stream.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

/**
 * 将 PNG 写入文件
 */
export function writePNG(png: PNG, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    const packed = png.pack();
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      if (!packed.destroyed) packed.destroy();
      if (!stream.destroyed) stream.destroy();
      reject(err);
    };

    packed.on('error', fail);
    packed.pipe(stream);
    stream.on('finish', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    stream.on('error', fail);
  });
}

/**
 * 获取图片尺寸
 */
export async function getImageDimensions(
  filePath: string,
): Promise<ImageDimensions> {
  const png = await readPNG(filePath);
  return { width: png.width, height: png.height };
}

/**
 * 将两张不同尺寸的图片对齐到相同尺寸（取较大值）
 * 用于像素比对前的预处理
 */
export function alignImages(
  img1: PNG,
  img2: PNG,
): { aligned1: PNG; aligned2: PNG; width: number; height: number } {
  const width = Math.max(img1.width, img2.width);
  const height = Math.max(img1.height, img2.height);

  const aligned1 = padImage(img1, width, height);
  const aligned2 = padImage(img2, width, height);

  return { aligned1, aligned2, width, height };
}

/**
 * 将图片填充到指定尺寸（右下角填充透明像素）
 */
function padImage(src: PNG, targetWidth: number, targetHeight: number): PNG {
  if (src.width === targetWidth && src.height === targetHeight) {
    return src;
  }

  const dst = new PNG({ width: targetWidth, height: targetHeight, fill: true });
  // 默认填充透明黑色 (0,0,0,0)
  dst.data.fill(0);

  for (let row = 0; row < src.height; row++) {
    const srcOffset = (row * src.width) << 2;
    const dstOffset = (row * targetWidth) << 2;
    src.data.copy(dst.data, dstOffset, srcOffset, srcOffset + (src.width << 2));
  }

  return dst;
}
