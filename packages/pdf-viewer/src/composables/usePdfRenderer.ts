/**
 * usePdfRenderer - PDF 页面渲染
 * @description 渲染 PDF 页面到 Canvas，包括 TextLayer
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { ref, type Ref } from 'vue';
import type { PdfViewerConfig } from '../types';
import { loadPdfJsLib } from './usePdfLoader';

export interface UsePdfRendererOptions {
  /** 配置 getter (支持响应式) */
  getConfig: () => PdfViewerConfig;
  /** 渲染成功回调 */
  onRenderSuccess?: (pageNumber: number) => void;
  /** 渲染失败回调 */
  onRenderError?: (error: Error, pageNumber: number) => void;
}

export interface RenderContext {
  /** Canvas 元素 */
  canvas: HTMLCanvasElement;
  /** 文本层容器 */
  textLayerContainer?: HTMLElement;
  /** 页面容器 */
  pageContainer?: HTMLElement;
  /** 容器尺寸 */
  containerSize?: { width: number; height: number };
  /** 使用指定的缩放比例（不自动计算） */
  useScale?: number;
  /** 渲染完成后的回调 (在 renderPage 内部、return 前调用，用于图片层等后处理) */
  onAfterRender?: (
    page: PDFPageProxy,
    viewport: { width: number; height: number; transform: number[] },
  ) => Promise<void>;
}

/** 渲染结果 */
export interface RenderResult {
  /** PDF 页面对象 */
  page: PDFPageProxy;
  /** 渲染使用的视口 (与 canvas/textLayer 共享) */
  viewport: { width: number; height: number; transform: number[] };
}

export interface UsePdfRendererReturn {
  /** 当前页码 */
  currentPage: Ref<number>;
  /** 当前缩放比例 */
  scale: Ref<number>;
  /** 渲染中 */
  rendering: Ref<boolean>;
  /** 渲染页面 */
  renderPage: (
    pdfDocument: PDFDocumentProxy,
    pageNumber: number,
    context: RenderContext,
  ) => Promise<RenderResult | null>;
  /** 计算自适应缩放 */
  calculateFitScale: (
    page: PDFPageProxy,
    containerSize: { width: number; height: number },
  ) => number;
  /** 取消渲染 */
  cancelRender: () => Promise<void>;
}

/**
 * PDF 页面渲染 Composable
 */
export function usePdfRenderer(
  options: UsePdfRendererOptions,
): UsePdfRendererReturn {
  const { getConfig } = options;

  const currentPage = ref(1);
  const scale = ref(getConfig().initialScale);
  const rendering = ref(false);

  let currentRenderTask: ReturnType<PDFPageProxy['render']> | null = null;

  /**
   * 计算自适应容器的缩放比例
   */
  function calculateFitScale(
    page: PDFPageProxy,
    containerSize: { width: number; height: number },
  ): number {
    const config = getConfig();
    if (!config.fitToContainer) {
      return config.initialScale;
    }

    const { width: containerWidth, height: containerHeight } = containerSize;
    if (containerWidth <= 0 || containerHeight <= 0) {
      return config.initialScale;
    }

    // 获取 PDF 原始尺寸 (scale = 1)
    const defaultViewport = page.getViewport({ scale: 1 });
    const padding = config.fitPadding;
    const availableWidth = containerWidth - padding * 2;
    const availableHeight = containerHeight - padding * 2;

    // 计算适应宽度和高度的缩放比例
    const scaleX = availableWidth / defaultViewport.width;
    const scaleY = availableHeight / defaultViewport.height;

    // 取较小值确保完全显示，并限制在配置范围内
    const fitScale = Math.min(scaleX, scaleY, config.maxScale);
    return Math.max(config.minScale, fitScale);
  }

  /**
   * 渲染 PDF 页面
   */
  async function renderPage(
    pdfDocument: PDFDocumentProxy,
    pageNumber: number,
    context: RenderContext,
  ): Promise<RenderResult | null> {
    const {
      canvas,
      textLayerContainer,
      pageContainer,
      containerSize,
      useScale,
    } = context;
    const config = getConfig();

    if (
      !pdfDocument ||
      !canvas ||
      pageNumber < 1 ||
      pageNumber > pdfDocument.numPages
    ) {
      return null;
    }

    // 取消之前的渲染任务
    await cancelRender();

    rendering.value = true;

    try {
      const lib = await loadPdfJsLib();
      const page = await pdfDocument.getPage(pageNumber);

      // 计算缩放比例：优先使用传入的 useScale，否则自动计算
      let renderScale: number;
      if (useScale !== undefined) {
        renderScale = useScale;
      } else if (containerSize) {
        renderScale = calculateFitScale(page, containerSize);
      } else {
        renderScale = config.initialScale;
      }
      scale.value = renderScale;

      const viewport = page.getViewport({ scale: renderScale });
      const outputScale = window.devicePixelRatio || 1;

      // 设置 Canvas 尺寸
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      // 渲染 Canvas (v5: 传 canvas 而非 canvasContext)
      const transform =
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      currentRenderTask = page.render({
        canvas,
        viewport,
        transform,
      });
      await currentRenderTask.promise;
      currentRenderTask = null;

      // 设置页面容器尺寸
      if (pageContainer) {
        pageContainer.style.width = `${Math.floor(viewport.width)}px`;
        pageContainer.style.height = `${Math.floor(viewport.height)}px`;
        pageContainer.style.setProperty('--scale-factor', String(renderScale));
        pageContainer.style.setProperty(
          '--total-scale-factor',
          String(renderScale),
        );
      }

      // 渲染文本层
      if (config.enableTextLayer && textLayerContainer) {
        textLayerContainer.innerHTML = '';
        const textContent = await page.getTextContent();
        const textLayer = new lib.TextLayer({
          textContentSource: textContent,
          container: textLayerContainer,
          viewport,
        });
        await textLayer.render();
      }

      // 渲染后回调 (图片层等后处理，在同一函数体内完成，与参考实现一致)
      if (context.onAfterRender) {
        await context.onAfterRender(page, viewport);
      }

      currentPage.value = pageNumber;
      options.onRenderSuccess?.(pageNumber);

      return { page, viewport };
    } catch (err: unknown) {
      // 忽略取消错误
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        err.name === 'RenderingCancelledException'
      ) {
        return null;
      }

      const renderError =
        err instanceof Error
          ? err
          : new Error(`PDF 第 ${pageNumber} 页渲染失败`);
      options.onRenderError?.(renderError, pageNumber);

      return null;
    } finally {
      rendering.value = false;
    }
  }

  /**
   * 取消渲染
   */
  async function cancelRender(): Promise<void> {
    if (currentRenderTask) {
      try {
        await currentRenderTask.cancel();
      } catch {
        // 忽略取消错误
      }
      currentRenderTask = null;
    }
  }

  return {
    currentPage,
    scale,
    rendering,
    renderPage,
    calculateFitScale,
    cancelRender,
  };
}
