/**
 * useThumbnail - 缩略图生成
 * @description 生成 PDF 页面的缩略图
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ref } from 'vue';
import type { ThumbnailInfo } from '../types';

export interface UseThumbnailOptions {
  /** 默认缩略图宽度 */
  defaultWidth?: number;
  /** 图片质量 (0-1) */
  quality?: number;
  /** 图片格式 */
  format?: 'image/jpeg' | 'image/png';
}

export interface UseThumbnailReturn {
  /** 缩略图缓存 */
  thumbnailCache: ReturnType<typeof ref<Map<number, ThumbnailInfo>>>;
  /** 生成单页缩略图 */
  generateThumbnail: (
    pdfDocument: PDFDocumentProxy,
    pageNumber: number,
    width?: number,
  ) => Promise<ThumbnailInfo>;
  /** 生成所有页面缩略图 */
  generateAllThumbnails: (
    pdfDocument: PDFDocumentProxy,
    width?: number,
    onProgress?: (current: number, total: number) => void,
  ) => Promise<ThumbnailInfo[]>;
  /** 清除缓存 */
  clearCache: () => void;
  /** 获取缓存的缩略图 */
  getCachedThumbnail: (pageNumber: number) => ThumbnailInfo | undefined;
}

/**
 * 缩略图生成 Composable
 */
export function useThumbnail(
  options: UseThumbnailOptions = {},
): UseThumbnailReturn {
  const { defaultWidth = 120, quality = 0.8, format = 'image/jpeg' } = options;

  const thumbnailCache = ref<Map<number, ThumbnailInfo>>(new Map());

  /**
   * 生成单页缩略图
   */
  async function generateThumbnail(
    pdfDocument: PDFDocumentProxy,
    pageNumber: number,
    width: number = defaultWidth,
  ): Promise<ThumbnailInfo> {
    // 检查缓存
    const cached = thumbnailCache.value.get(pageNumber);
    if (cached && cached.width === width) {
      return cached;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const defaultViewport = page.getViewport({ scale: 1 });

    // 计算缩略图的缩放比例
    const thumbnailScale = width / defaultViewport.width;
    const viewport = page.getViewport({ scale: thumbnailScale });

    // 创建离屏 canvas
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    // 渲染页面到 canvas (v5: 传 canvas 而非 canvasContext)
    await page.render({
      canvas,
      viewport,
    }).promise;

    // 转换为 data URL
    const dataUrl = canvas.toDataURL(format, quality);

    const thumbnailInfo: ThumbnailInfo = {
      pageNumber,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    };

    // 存入缓存
    thumbnailCache.value.set(pageNumber, thumbnailInfo);

    return thumbnailInfo;
  }

  /**
   * 生成所有页面缩略图（分批并行，每批 5 页）
   */
  async function generateAllThumbnails(
    pdfDocument: PDFDocumentProxy,
    width: number = defaultWidth,
    onProgress?: (current: number, total: number) => void,
  ): Promise<ThumbnailInfo[]> {
    const total = pdfDocument.numPages;
    const thumbnails: ThumbnailInfo[] = new Array(total);
    const batchSize = 5;

    for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, total);
      const batchPromises: Promise<void>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const pageNum = i + 1;
        batchPromises.push(
          generateThumbnail(pdfDocument, pageNum, width)
            .then((thumb) => {
              thumbnails[i] = thumb;
            })
            .catch((error) => {
              console.error(`生成第 ${pageNum} 页缩略图失败:`, error);
            }),
        );
      }

      await Promise.all(batchPromises);
      onProgress?.(batchEnd, total);
    }

    return thumbnails.filter(Boolean);
  }

  /**
   * 清除缓存
   */
  function clearCache(): void {
    thumbnailCache.value.clear();
  }

  /**
   * 获取缓存的缩略图
   */
  function getCachedThumbnail(pageNumber: number): ThumbnailInfo | undefined {
    return thumbnailCache.value.get(pageNumber);
  }

  return {
    thumbnailCache,
    generateThumbnail,
    generateAllThumbnails,
    clearCache,
    getCachedThumbnail,
  };
}
