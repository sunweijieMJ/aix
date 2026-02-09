/**
 * useContinuousScroll - 连续滚动模式
 * @description 管理 PDF 连续滚动视图，支持虚拟滚动优化
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { loadPdfJsLib } from './usePdfLoader';

/** 页面渲染信息 */
export interface PageRenderInfo {
  pageNumber: number;
  /** 页面在容器中的 Y 偏移 */
  offsetY: number;
  /** 页面宽度 */
  width: number;
  /** 页面高度 */
  height: number;
  /** 是否已渲染 */
  rendered: boolean;
  /** Canvas 元素 */
  canvas?: HTMLCanvasElement;
  /** 文本层容器 */
  textLayer?: HTMLDivElement;
}

export interface UseContinuousScrollOptions {
  /** 获取缩放比例 */
  getScale: () => number;
  /** 获取页面间距 */
  getPageGap: () => number;
  /** 获取是否启用文本层 */
  getEnableTextLayer: () => boolean;
  /** 预加载的页面数量 (上下各几页) */
  preloadPages?: number;
  /** 渲染错误回调 */
  onRenderError?: (error: Error, pageNumber: number) => void;
  /** 页面渲染完成后回调 (图片层等后处理) */
  onAfterPageRender?: (
    page: PDFPageProxy,
    viewport: { width: number; height: number; transform: number[] },
    pageNumber: number,
    container: HTMLDivElement,
  ) => Promise<void>;
  /** 最大保留的已渲染页面数 (0=不限制，默认 0) */
  maxRenderedPages?: number;
  /** 页面被卸载时的回调 (用于清理 DOM 占位符) */
  onPageUnload?: (pageNumber: number) => void;
}

export interface UseContinuousScrollReturn {
  /** 页面信息列表 */
  pages: Ref<PageRenderInfo[]>;
  /** 总高度 */
  totalHeight: ComputedRef<number>;
  /** 当前可见的页码 */
  visiblePage: Ref<number>;
  /** 是否正在渲染 */
  rendering: Ref<boolean>;
  /** 初始化页面布局 */
  initLayout: (pdf: PDFDocumentProxy, containerWidth: number) => Promise<void>;
  /** 处理滚动事件 */
  handleScroll: (scrollTop: number, viewportHeight: number) => void;
  /** 渲染可见页面 */
  renderVisiblePages: (
    scrollTop: number,
    viewportHeight: number,
  ) => Promise<void>;
  /** 滚动到指定页 */
  scrollToPage: (pageNumber: number) => number;
  /** 获取页面容器 */
  getPageContainer: (pageNumber: number) => HTMLDivElement | null;
  /** 清理资源 */
  cleanup: () => void;
}

/**
 * 连续滚动 Composable
 */
export function useContinuousScroll(
  options: UseContinuousScrollOptions,
): UseContinuousScrollReturn {
  const {
    getScale,
    getPageGap,
    getEnableTextLayer,
    preloadPages = 1,
    onRenderError,
    onAfterPageRender,
    maxRenderedPages = 0,
    onPageUnload,
  } = options;

  const pages = ref<PageRenderInfo[]>([]);
  const visiblePage = ref(1);
  const rendering = ref(false);

  let pdfDocument: PDFDocumentProxy | null = null;
  const pageContainers = new Map<number, HTMLDivElement>();
  const renderingPages = new Set<number>();
  let pendingRenderArgs: { scrollTop: number; viewportHeight: number } | null =
    null;
  /** 布局版本号，initLayout 每次递增，旧渲染据此跳过 */
  let layoutVersion = 0;

  const totalHeight = computed(() => {
    if (pages.value.length === 0) return 0;
    const lastPage = pages.value[pages.value.length - 1];
    return lastPage ? lastPage.offsetY + lastPage.height : 0;
  });

  /**
   * 初始化页面布局 (不渲染内容，只计算位置)
   * 使用第 1 页的 viewport 作为基准估算，渲染时通过 updatePageLayout 修正实际尺寸
   */
  async function initLayout(
    pdf: PDFDocumentProxy,
    _containerWidth: number,
  ): Promise<void> {
    pdfDocument = pdf;
    visiblePage.value = 1;
    layoutVersion++;
    renderingPages.clear();
    pendingRenderArgs = null;
    const scale = getScale();
    const gap = getPageGap();

    // 仅获取第 1 页的 viewport 作为基准尺寸
    const firstPage = await pdf.getPage(1);
    const baseViewport = firstPage.getViewport({ scale });

    // 用基准尺寸估算所有页面的布局位置
    const pageInfos: PageRenderInfo[] = [];
    let currentY = 0;

    for (let i = 0; i < pdf.numPages; i++) {
      pageInfos.push({
        pageNumber: i + 1,
        offsetY: currentY,
        width: baseViewport.width,
        height: baseViewport.height,
        rendered: false,
      });
      currentY += baseViewport.height + gap;
    }

    pages.value = pageInfos;
    pageContainers.clear();
    renderingPages.clear();
  }

  /**
   * 更新页面布局（当实际渲染尺寸与估算不同时调用）
   */
  function updatePageLayout(
    pageNumber: number,
    actualWidth: number,
    actualHeight: number,
  ): void {
    const pageInfo = pages.value.find((p) => p.pageNumber === pageNumber);
    if (!pageInfo) return;

    // 尺寸无变化则跳过
    if (
      Math.abs(pageInfo.width - actualWidth) < 1 &&
      Math.abs(pageInfo.height - actualHeight) < 1
    ) {
      return;
    }

    const gap = getPageGap();
    pageInfo.width = actualWidth;
    pageInfo.height = actualHeight;

    // 重新计算该页及后续所有页面的 offsetY
    const idx = pages.value.indexOf(pageInfo);
    for (let i = idx + 1; i < pages.value.length; i++) {
      const prev = pages.value[i - 1]!;
      pages.value[i]!.offsetY = prev.offsetY + prev.height + gap;
    }
  }

  /**
   * 处理滚动事件 - 更新当前可见页
   */
  function handleScroll(scrollTop: number, viewportHeight: number): void {
    const centerY = scrollTop + viewportHeight / 2;

    // 找到中心点所在的页面
    for (const page of pages.value) {
      if (centerY >= page.offsetY && centerY < page.offsetY + page.height) {
        if (visiblePage.value !== page.pageNumber) {
          visiblePage.value = page.pageNumber;
        }
        break;
      }
    }
  }

  /**
   * 渲染可见页面及预加载页面
   */
  async function renderVisiblePages(
    scrollTop: number,
    viewportHeight: number,
  ): Promise<void> {
    if (!pdfDocument) return;

    if (rendering.value) {
      // 记录待渲染参数，当前渲染完成后重试
      pendingRenderArgs = { scrollTop, viewportHeight };
      return;
    }

    const viewTop = scrollTop;
    const viewBottom = scrollTop + viewportHeight;

    // 找出需要渲染的页面
    const pagesToRender: number[] = [];

    for (const page of pages.value) {
      const pageTop = page.offsetY;
      const pageBottom = page.offsetY + page.height;

      // 检查是否在可见区域内 (含预加载)
      const preloadOffset = viewportHeight * preloadPages;
      const isVisible =
        pageBottom >= viewTop - preloadOffset &&
        pageTop <= viewBottom + preloadOffset;

      if (isVisible && !page.rendered && !renderingPages.has(page.pageNumber)) {
        pagesToRender.push(page.pageNumber);
      }
    }

    if (pagesToRender.length === 0) return;

    rendering.value = true;

    try {
      // 并行渲染多个页面
      await Promise.all(pagesToRender.map((pageNum) => renderPage(pageNum)));
    } finally {
      rendering.value = false;
      // 回收远离视口的页面以释放内存
      unloadDistantPages(scrollTop, viewportHeight);
      // 处理渲染期间积累的待渲染请求
      if (pendingRenderArgs) {
        const args = pendingRenderArgs;
        pendingRenderArgs = null;
        await renderVisiblePages(args.scrollTop, args.viewportHeight);
      }
    }
  }

  /**
   * 渲染单个页面
   */
  async function renderPage(pageNumber: number): Promise<void> {
    if (!pdfDocument || renderingPages.has(pageNumber)) return;

    renderingPages.add(pageNumber);
    const version = layoutVersion;

    try {
      const lib = await loadPdfJsLib();
      if (version !== layoutVersion) return;
      const page = await pdfDocument.getPage(pageNumber);
      if (version !== layoutVersion) return;
      const scale = getScale();
      const viewport = page.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;

      // 获取或创建页面容器
      let container = pageContainers.get(pageNumber);
      if (!container) {
        container = document.createElement('div');
        container.className = 'aix-pdf-continuous__page';
        container.dataset.pageNumber = String(pageNumber);
        pageContainers.set(pageNumber, container);
      }

      // 设置容器样式
      container.style.width = `${viewport.width}px`;
      container.style.height = `${viewport.height}px`;
      container.style.setProperty('--scale-factor', String(scale));

      // 创建 Canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'aix-pdf-continuous__canvas';
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      // 渲染到 Canvas (v5: 传 canvas 而非 canvasContext)
      const transform =
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      await page.render({
        canvas,
        viewport,
        transform,
      }).promise;
      if (version !== layoutVersion) return;

      // 清空容器并添加 Canvas
      container.innerHTML = '';
      container.appendChild(canvas);

      // 渲染文本层
      if (getEnableTextLayer()) {
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'aix-pdf-continuous__text-layer textLayer';

        const textContent = await page.getTextContent();
        if (version !== layoutVersion) return;
        const textLayer = new lib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        await textLayer.render();
        if (version !== layoutVersion) return;

        container.appendChild(textLayerDiv);
      }

      // 渲染后回调 (图片层等后处理)
      if (onAfterPageRender) {
        await onAfterPageRender(page, viewport, pageNumber, container);
        if (version !== layoutVersion) return;
      }

      // 更新页面信息和布局（如果实际尺寸与估算不同）
      updatePageLayout(pageNumber, viewport.width, viewport.height);
      const pageInfo = pages.value.find((p) => p.pageNumber === pageNumber);
      if (pageInfo) {
        pageInfo.rendered = true;
        pageInfo.canvas = canvas;
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(`渲染第 ${pageNumber} 页失败`);
      onRenderError?.(error, pageNumber);
    } finally {
      renderingPages.delete(pageNumber);
    }
  }

  /**
   * 卸载单个页面以释放内存
   */
  function unloadPage(pageNumber: number): void {
    const pageInfo = pages.value.find((p) => p.pageNumber === pageNumber);
    if (!pageInfo || !pageInfo.rendered) return;

    const container = pageContainers.get(pageNumber);
    if (container) {
      container.innerHTML = '';
      pageContainers.delete(pageNumber);
    }

    pageInfo.rendered = false;
    pageInfo.canvas = undefined;
    pageInfo.textLayer = undefined;
    onPageUnload?.(pageNumber);
  }

  /**
   * 卸载远离视口的页面，保持已渲染页面数在 maxRenderedPages 以内
   */
  function unloadDistantPages(scrollTop: number, viewportHeight: number): void {
    if (maxRenderedPages <= 0) return;

    const renderedPages = pages.value.filter((p) => p.rendered);
    if (renderedPages.length <= maxRenderedPages) return;

    const centerY = scrollTop + viewportHeight / 2;

    // 按离视口中心距离降序排列（最远的在前）
    const sorted = [...renderedPages].sort((a, b) => {
      const distA = Math.abs(a.offsetY + a.height / 2 - centerY);
      const distB = Math.abs(b.offsetY + b.height / 2 - centerY);
      return distB - distA;
    });

    // 卸载超出限制的页面（跳过正在渲染的）
    const toUnload = sorted.slice(0, sorted.length - maxRenderedPages);
    for (const page of toUnload) {
      if (!renderingPages.has(page.pageNumber)) {
        unloadPage(page.pageNumber);
      }
    }
  }

  /**
   * 滚动到指定页
   */
  function scrollToPage(pageNumber: number): number {
    const page = pages.value.find((p) => p.pageNumber === pageNumber);
    if (page) {
      return page.offsetY;
    }
    return 0;
  }

  /**
   * 获取页面容器
   */
  function getPageContainer(pageNumber: number): HTMLDivElement | null {
    return pageContainers.get(pageNumber) ?? null;
  }

  /**
   * 清理资源
   */
  function cleanup(): void {
    layoutVersion++;
    pages.value = [];
    pageContainers.clear();
    renderingPages.clear();
    pendingRenderArgs = null;
    pdfDocument = null;
  }

  return {
    pages,
    totalHeight,
    visiblePage,
    rendering,
    initLayout,
    handleScroll,
    renderVisiblePages,
    scrollToPage,
    getPageContainer,
    cleanup,
  };
}
