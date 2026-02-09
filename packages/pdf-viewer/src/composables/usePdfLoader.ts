/**
 * usePdfLoader - PDF 文档加载
 * @description 动态加载 pdfjs-dist 并管理 PDF 文档生命周期
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';

type PdfJs = typeof import('pdfjs-dist');

let pdfjsLib: PdfJs | null = null;

/**
 * 动态加载 pdfjs-dist 库
 * @param workerSrc 自定义 worker URL，不传则使用 CDN
 */
export async function loadPdfJsLib(workerSrc?: string): Promise<PdfJs> {
  if (pdfjsLib) return pdfjsLib;

  const lib = await import('pdfjs-dist');

  // new URL(bare_specifier, import.meta.url) 在 Vite dev 模式下解析为错误路径，
  // worker 加载失败会导致 pdfjs 回退到主线程阻塞式解析，直接崩溃。
  // 使用 jsdelivr CDN 作为默认方案确保 worker 在所有环境下可用。
  lib.GlobalWorkerOptions.workerSrc =
    workerSrc ??
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;

  pdfjsLib = lib;
  return lib;
}

export interface UsePdfLoaderOptions {
  /** 加载成功回调 */
  onLoad?: (pdf: PDFDocumentProxy) => void;
  /** 加载失败回调 */
  onError?: (error: Error) => void;
}

export interface UsePdfLoaderReturn {
  /** PDF 文档对象 */
  pdfDocument: ShallowRef<PDFDocumentProxy | null>;
  /** 总页数 */
  totalPages: Ref<number>;
  /** 加载状态 */
  loading: Ref<boolean>;
  /** 错误信息 */
  error: Ref<Error | null>;
  /** 加载 PDF */
  load: (source: string | ArrayBuffer) => Promise<PDFDocumentProxy | null>;
  /** 销毁 */
  destroy: () => Promise<void>;
}

/**
 * PDF 文档加载 Composable
 */
export function usePdfLoader(
  options: UsePdfLoaderOptions = {},
): UsePdfLoaderReturn {
  const pdfDocument = shallowRef<PDFDocumentProxy | null>(null);
  const totalPages = ref(0);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  let currentLoadingTask: ReturnType<PdfJs['getDocument']> | null = null;

  /**
   * 加载 PDF 文档
   */
  async function load(
    source: string | ArrayBuffer,
  ): Promise<PDFDocumentProxy | null> {
    if (!source) return null;

    loading.value = true;
    error.value = null;

    try {
      const lib = await loadPdfJsLib();

      // 取消之前的加载任务
      if (currentLoadingTask) {
        try {
          await currentLoadingTask.destroy();
        } catch {
          // 忽略取消错误
        }
        currentLoadingTask = null;
      }

      // 销毁之前的文档
      if (pdfDocument.value) {
        try {
          await pdfDocument.value.destroy();
        } catch {
          // 忽略销毁错误
        }
        pdfDocument.value = null;
      }

      // 创建加载参数
      const loadingParams =
        typeof source === 'string' ? { url: source } : { data: source };

      currentLoadingTask = lib.getDocument(loadingParams);
      const pdf = await currentLoadingTask.promise;
      currentLoadingTask = null;

      if (!pdf?.numPages) {
        throw new Error('PDF 文档无效');
      }

      pdfDocument.value = pdf;
      totalPages.value = pdf.numPages;
      options.onLoad?.(pdf);

      return pdf;
    } catch (err: unknown) {
      // 忽略取消错误
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        err.name === 'AbortException'
      ) {
        return null;
      }

      const loadError = err instanceof Error ? err : new Error('PDF 加载失败');
      error.value = loadError;
      totalPages.value = 0;
      options.onError?.(loadError);

      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 销毁资源
   */
  async function destroy(): Promise<void> {
    // 取消加载任务
    if (currentLoadingTask) {
      try {
        await currentLoadingTask.destroy();
      } catch {
        // 忽略
      }
      currentLoadingTask = null;
    }

    // 销毁文档
    if (pdfDocument.value) {
      try {
        await pdfDocument.value.destroy();
      } catch {
        // 忽略
      }
      pdfDocument.value = null;
    }

    totalPages.value = 0;
    error.value = null;
  }

  return {
    pdfDocument,
    totalPages,
    loading,
    error,
    load,
    destroy,
  };
}
