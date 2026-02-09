<template>
  <div ref="rootRef" class="aix-pdf-viewer" tabindex="-1">
    <!-- 单页模式 -->
    <div
      v-if="mergedConfig.scrollMode === 'single'"
      ref="contentRef"
      class="aix-pdf-viewer__content"
      :class="{ 'aix-pdf-viewer__content--loading': pdfLoader.loading.value }"
      @click="handleContentClick"
      @contextmenu="handleContextMenu"
    >
      <!-- 加载指示器（仅文档加载时显示，缩放重渲染时不显示） -->
      <div v-if="pdfLoader.loading.value" class="aix-pdf-viewer__loading">
        <div class="aix-pdf-viewer__spinner" />
      </div>

      <!-- PDF 页面容器 -->
      <div ref="pageContainerRef" class="aix-pdf-viewer__page">
        <canvas ref="canvasRef" class="aix-pdf-viewer__canvas" />
        <div
          v-if="mergedConfig.enableTextLayer"
          ref="textLayerRef"
          class="aix-pdf-viewer__text-layer textLayer"
        />
        <div
          v-if="mergedConfig.enableImageLayer"
          ref="imageLayerRef"
          class="aix-pdf-viewer__image-layer"
        />
      </div>
    </div>

    <!-- 连续滚动模式 -->
    <div
      v-else
      ref="continuousContentRef"
      class="aix-pdf-viewer__continuous"
      :class="{
        'aix-pdf-viewer__continuous--loading': pdfLoader.loading.value,
      }"
      @scroll="handleContinuousScroll"
      @click="handleContentClick"
      @contextmenu="handleContextMenu"
    >
      <!-- 加载指示器 -->
      <div
        v-if="loading && continuousScroll.pages.value.length === 0"
        class="aix-pdf-viewer__loading"
      >
        <div class="aix-pdf-viewer__spinner" />
      </div>

      <!-- 页面容器 -->
      <div
        class="aix-pdf-viewer__continuous-inner"
        :style="{ height: `${continuousScroll.totalHeight.value}px` }"
      >
        <div
          v-for="page in continuousScroll.pages.value"
          :key="page.pageNumber"
          :ref="
            (el) => setContinuousPageRef(page.pageNumber, el as HTMLElement)
          "
          class="aix-pdf-viewer__continuous-page"
          :style="{
            top: `${page.offsetY}px`,
            width: `${page.width}px`,
            height: `${page.height}px`,
          }"
        />
      </div>
    </div>

    <!-- 工具栏 -->
    <slot
      v-if="mergedConfig.showToolbar"
      name="toolbar"
      :current-page="currentPage"
      :total-pages="totalPages"
      :scale="scale"
      :goto-page="gotoPage"
      :prev-page="prevPage"
      :next-page="nextPage"
      :zoom-in="zoomIn"
      :zoom-out="zoomOut"
      :fit-to-page="fitToPage"
    >
      <PdfToolbar
        :current-page="currentPage"
        :total-pages="totalPages"
        :scale="scale"
        :min-scale="mergedConfig.minScale"
        :max-scale="mergedConfig.maxScale"
        @prev="prevPage"
        @next="nextPage"
        @goto="gotoPage"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @fit-page="fitToPage"
      />
    </slot>

    <!-- 搜索栏 -->
    <SearchBar
      :visible="searchBarVisible"
      :searching="textSearch.searching.value"
      :total-matches="textSearch.totalMatches.value"
      :current-index="textSearch.currentMatchIndex.value"
      @search="handleSearch"
      @prev="handleSearchPrev"
      @next="handleSearchNext"
      @clear="handleSearchClear"
      @close="closeSearch"
    />

    <!-- 右键菜单 -->
    <ContextMenu
      v-if="mergedConfig.enableContextMenu"
      :visible="contextMenu.visible.value"
      :position="contextMenu.position.value"
      :menu-items="contextMenu.menuItems.value"
      @click="contextMenu.handleMenuClick"
      @close="contextMenu.hide"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * PdfViewer - PDF 预览组件
 * @description 使用 pdfjs-dist 提供 PDF 预览功能，支持文本和图片选择
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import ContextMenu from './components/ContextMenu.vue';
import PdfToolbar from './components/PdfToolbar.vue';
import SearchBar from './components/SearchBar.vue';
import { useContextMenu } from './composables/useContextMenu';
import { useContinuousScroll } from './composables/useContinuousScroll';
import { useImageLayer } from './composables/useImageLayer';
import { usePdfLoader } from './composables/usePdfLoader';
import { usePdfRenderer } from './composables/usePdfRenderer';
import { useTextSearch } from './composables/useTextSearch';
import { useTextSelection } from './composables/useTextSelection';
import { useThumbnail } from './composables/useThumbnail';
import {
  DEFAULT_PDF_CONFIG,
  DEFAULT_IMAGE_LAYER_CONFIG,
  DEFAULT_CONTEXT_MENU_CONFIG,
  ZOOM_STEP,
} from './constants';
import type {
  PdfViewerConfig,
  ImageLayerConfig,
  ContextMenuConfig,
  PdfImageInfo,
  PdfViewerProps,
  ContextMenuContext,
  ThumbnailInfo,
} from './types';

import 'pdfjs-dist/web/pdf_viewer.css';

const props = withDefaults(defineProps<PdfViewerProps>(), {
  initialPage: 1,
  config: () => ({}),
  imageLayerConfig: () => ({}),
  contextMenuConfig: () => ({}),
});

const emit = defineEmits<{
  (e: 'ready', totalPages: number): void;
  (e: 'error', error: Error): void;
  (e: 'pageChange', page: number, total: number): void;
  (e: 'scaleChange', scale: number): void;
  (e: 'textSelect', text: string): void;
  (e: 'imageClick', image: PdfImageInfo, event: MouseEvent): void;
  (e: 'imageSelect', images: PdfImageInfo[]): void;
  (e: 'contextMenu', context: ContextMenuContext): void;
}>();

// 合并配置
const mergedConfig = computed<PdfViewerConfig>(() => ({
  ...DEFAULT_PDF_CONFIG,
  ...props.config,
}));

const mergedImageLayerConfig = computed<ImageLayerConfig>(() => ({
  ...DEFAULT_IMAGE_LAYER_CONFIG,
  ...props.imageLayerConfig,
}));

const mergedContextMenuConfig = computed<ContextMenuConfig>(() => ({
  ...DEFAULT_CONTEXT_MENU_CONFIG,
  ...props.contextMenuConfig,
}));

// DOM refs - 根元素
const rootRef = ref<HTMLDivElement | null>(null);

// DOM refs - 单页模式
const contentRef = ref<HTMLDivElement | null>(null);
const pageContainerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const textLayerRef = ref<HTMLDivElement | null>(null);
const imageLayerRef = ref<HTMLDivElement | null>(null);

// DOM refs - 连续滚动模式
const continuousContentRef = ref<HTMLDivElement | null>(null);
const continuousPageRefs = new Map<number, HTMLElement>();

// 容器尺寸
const containerSize = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;
let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialRender = true;
let isManualZoom = false;

// PDF 加载器
const pdfLoader = usePdfLoader({
  onLoad: () => {
    emit('ready', pdfLoader.totalPages.value);
  },
  onError: (error) => {
    emit('error', error);
  },
});

// PDF 渲染器
const pdfRenderer = usePdfRenderer({
  getConfig: () => mergedConfig.value,
  onRenderError: (error) => {
    emit('error', error);
  },
});

// 图片层
const imageLayer = useImageLayer(() => mergedImageLayerConfig.value, {
  onImageClick: (image, event) => emit('imageClick', image, event),
  onSelectionChange: (images) => emit('imageSelect', images),
});

// 文字选择
const textSelection = useTextSelection({
  onSelectionChange: (text) => emit('textSelect', text),
});

// 缩略图
const thumbnail = useThumbnail();

// 右键菜单
const contextMenu = useContextMenu({
  config: () => mergedContextMenuConfig.value,
  getSelectedText: () => textSelection.getSelectedText(textLayerRef.value),
  getSelectedImages: () => imageLayer.getSelectedImages(),
  getCurrentPage: () => currentPage.value,
  onMenuClick: (_item, context) => emit('contextMenu', context),
});

// 连续滚动
const continuousScroll = useContinuousScroll({
  getScale: () => pdfRenderer.scale.value,
  getPageGap: () => mergedConfig.value.pageGap,
  getEnableTextLayer: () => mergedConfig.value.enableTextLayer,
  preloadPages: 2,
  maxRenderedPages: 20,
  onRenderError: (error) => emit('error', error),
  onAfterPageRender: async (page, viewport, pageNumber, container) => {
    if (mergedConfig.value.enableImageLayer) {
      const pageImages = await imageLayer.extractImages(
        page,
        viewport,
        pageNumber,
      );
      let imgLayerDiv = container.querySelector(
        '.aix-pdf-viewer__image-layer',
      ) as HTMLElement | null;
      if (!imgLayerDiv) {
        imgLayerDiv = document.createElement('div');
        imgLayerDiv.className = 'aix-pdf-viewer__image-layer';
        container.appendChild(imgLayerDiv);
      }
      imageLayer.renderImageLayer(imgLayerDiv, pageImages);
    }
  },
  onPageUnload: (pageNumber) => {
    imageLayer.removePageImages(pageNumber);
    const placeholder = continuousPageRefs.get(pageNumber);
    if (placeholder) {
      placeholder.innerHTML = '';
    }
  },
});

// 文本搜索
const searchBarVisible = ref(false);
const textSearch = useTextSearch({
  onMatchChange: async (_current, match) => {
    if (match && match.pageNumber !== currentPage.value) {
      await gotoPage(match.pageNumber);
    }
    if (mergedConfig.value.scrollMode === 'continuous') {
      await nextTick();
      highlightContinuousSearchMatches();
    } else if (textLayerRef.value) {
      textSearch.highlightMatches(textLayerRef.value, currentPage.value);
    }
  },
});

// 导出状态
const loading = computed(() => {
  if (mergedConfig.value.scrollMode === 'continuous') {
    return pdfLoader.loading.value || continuousScroll.rendering.value;
  }
  return pdfLoader.loading.value || pdfRenderer.rendering.value;
});

const currentPage = computed(() => {
  if (mergedConfig.value.scrollMode === 'continuous') {
    return continuousScroll.visiblePage.value;
  }
  return pdfRenderer.currentPage.value;
});

const totalPages = computed(() => pdfLoader.totalPages.value);
const scale = computed(() => pdfRenderer.scale.value);

/**
 * 更新容器尺寸
 */
function updateContainerSize(): boolean {
  const container =
    mergedConfig.value.scrollMode === 'continuous'
      ? continuousContentRef.value
      : contentRef.value;

  if (container) {
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      containerSize.value = { width: rect.width, height: rect.height };
      return true;
    }
  }
  return false;
}

/**
 * 防抖的容器尺寸更新
 */
function debouncedResize(): void {
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer);
  }
  resizeDebounceTimer = setTimeout(async () => {
    resizeDebounceTimer = null;
    if (
      updateContainerSize() &&
      pdfLoader.pdfDocument.value &&
      !isInitialRender
    ) {
      if (mergedConfig.value.scrollMode === 'continuous') {
        // 连续滚动模式：重新初始化布局
        await continuousScroll.initLayout(
          pdfLoader.pdfDocument.value,
          containerSize.value.width,
        );
        if (continuousContentRef.value) {
          await continuousScroll.renderVisiblePages(
            continuousContentRef.value.scrollTop,
            continuousContentRef.value.clientHeight,
          );
          mountContinuousPages();
        }
      } else {
        if (isManualZoom) {
          await renderCurrentPage(pdfRenderer.scale.value);
        } else {
          await renderCurrentPage();
        }
      }
    }
  }, 100);
}

/**
 * 渲染当前页面
 * @param useScale 指定缩放比例（不自动计算）
 */
async function renderCurrentPage(useScale?: number): Promise<void> {
  const pdfDoc = pdfLoader.pdfDocument.value;
  if (!pdfDoc || !canvasRef.value) return;

  const pageNum = pdfRenderer.currentPage.value;
  const result = await pdfRenderer.renderPage(pdfDoc, pageNum, {
    canvas: canvasRef.value,
    textLayerContainer: textLayerRef.value ?? undefined,
    pageContainer: pageContainerRef.value ?? undefined,
    containerSize: containerSize.value,
    useScale,
    // 图片层渲染在 renderPage 内部完成，与参考实现保持一致
    onAfterRender: async (page, viewport) => {
      if (mergedConfig.value.enableImageLayer && imageLayerRef.value) {
        const pageImages = await imageLayer.extractImages(
          page,
          viewport,
          pageNum,
        );
        imageLayer.renderImageLayer(imageLayerRef.value, pageImages);
      }
    },
  });

  if (result) {
    emit('scaleChange', pdfRenderer.scale.value);
  }
}

/**
 * 加载并渲染 PDF
 */
async function loadAndRender(): Promise<void> {
  isInitialRender = true;
  isManualZoom = false;
  thumbnail.clearCache();

  const pdf = await pdfLoader.load(props.source);
  if (!pdf) return;

  await nextTick();

  // 尝试多次获取有效的容器尺寸
  let retries = 3;
  while (retries > 0 && !updateContainerSize()) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    retries--;
  }

  if (mergedConfig.value.scrollMode === 'continuous') {
    // 连续滚动模式：初始化布局并渲染可见页面
    await continuousScroll.initLayout(pdf, containerSize.value.width);
    await nextTick();
    // 滚动到初始页
    if (props.initialPage > 1 && continuousContentRef.value) {
      const scrollTop = continuousScroll.scrollToPage(props.initialPage);
      continuousContentRef.value.scrollTop = scrollTop;
    }
    // 渲染可见页面
    if (continuousContentRef.value) {
      await continuousScroll.renderVisiblePages(
        continuousContentRef.value.scrollTop,
        continuousContentRef.value.clientHeight,
      );
      // 将渲染好的页面添加到 DOM
      mountContinuousPages();
    }
  } else {
    // 单页模式
    pdfRenderer.currentPage.value = Math.min(props.initialPage, pdf.numPages);
    await renderCurrentPage();
  }

  isInitialRender = false;

  const cp = currentPage.value;
  const tp = pdfLoader.totalPages.value;
  emit('pageChange', cp, tp);
}

/**
 * 初始化当前模式的渲染（不重新加载 PDF）
 */
async function initCurrentMode(): Promise<void> {
  const pdf = pdfLoader.pdfDocument.value;
  if (!pdf) return;

  await nextTick();
  updateContainerSize();

  if (mergedConfig.value.scrollMode === 'continuous') {
    await continuousScroll.initLayout(pdf, containerSize.value.width);
    await nextTick();
    if (continuousContentRef.value) {
      const scrollTop = continuousScroll.scrollToPage(currentPage.value);
      continuousContentRef.value.scrollTop = scrollTop;
      await continuousScroll.renderVisiblePages(
        continuousContentRef.value.scrollTop,
        continuousContentRef.value.clientHeight,
      );
      mountContinuousPages();
    }
  } else {
    pdfRenderer.currentPage.value = Math.min(
      continuousScroll.visiblePage.value || 1,
      pdf.numPages,
    );
    await renderCurrentPage();
  }
}

// ==================== 公共方法 ====================

async function gotoPage(page: number): Promise<void> {
  const tp = totalPages.value;
  if (page < 1 || page > tp) return;

  if (mergedConfig.value.scrollMode === 'continuous') {
    // 连续滚动模式：滚动到指定页，pageChange 由 scroll handler 自然触发
    if (continuousContentRef.value) {
      const scrollTop = continuousScroll.scrollToPage(page);
      continuousContentRef.value.scrollTo({
        top: scrollTop,
        behavior: 'smooth',
      });
    }
  } else {
    // 单页模式
    pdfRenderer.currentPage.value = page;
    await renderCurrentPage();
    emit('pageChange', page, tp);
  }
}

async function nextPage(): Promise<void> {
  const cp = currentPage.value;
  const tp = totalPages.value;
  if (cp >= tp) return;
  await gotoPage(cp + 1);
}

async function prevPage(): Promise<void> {
  const cp = currentPage.value;
  if (cp <= 1) return;
  await gotoPage(cp - 1);
}

async function applyContinuousScale(newScale: number): Promise<void> {
  const pdfDoc = pdfLoader.pdfDocument.value;
  if (!pdfDoc || !continuousContentRef.value) return;

  const currentVisiblePage = continuousScroll.visiblePage.value;
  pdfRenderer.scale.value = newScale;

  await continuousScroll.initLayout(pdfDoc, containerSize.value.width);
  await nextTick();

  const scrollTop = continuousScroll.scrollToPage(currentVisiblePage);
  continuousContentRef.value.scrollTop = scrollTop;

  await continuousScroll.renderVisiblePages(
    continuousContentRef.value.scrollTop,
    continuousContentRef.value.clientHeight,
  );
  mountContinuousPages();

  emit('scaleChange', newScale);
}

async function setScale(newScale: number): Promise<void> {
  const clampedScale = Math.max(
    mergedConfig.value.minScale,
    Math.min(mergedConfig.value.maxScale, newScale),
  );
  isManualZoom = true;

  if (mergedConfig.value.scrollMode === 'continuous') {
    await applyContinuousScale(clampedScale);
  } else {
    await renderCurrentPage(clampedScale);
  }
}

async function zoomIn(step: number = ZOOM_STEP): Promise<void> {
  await setScale(scale.value + step);
}

async function zoomOut(step: number = ZOOM_STEP): Promise<void> {
  await setScale(scale.value - step);
}

async function fitToWidth(): Promise<void> {
  const pdfDoc = pdfLoader.pdfDocument.value;
  if (!pdfDoc) return;

  isManualZoom = false;
  const page = await pdfDoc.getPage(currentPage.value);
  const defaultViewport = page.getViewport({ scale: 1 });
  const containerWidth =
    mergedConfig.value.scrollMode === 'continuous'
      ? (continuousContentRef.value?.clientWidth ?? containerSize.value.width)
      : containerSize.value.width;
  const newScale =
    (containerWidth - mergedConfig.value.fitPadding * 2) /
    defaultViewport.width;

  if (mergedConfig.value.scrollMode === 'continuous') {
    await applyContinuousScale(newScale);
  } else {
    await renderCurrentPage(newScale);
  }
}

async function fitToPage(): Promise<void> {
  const pdfDoc = pdfLoader.pdfDocument.value;
  if (!pdfDoc) return;

  isManualZoom = false;
  const page = await pdfDoc.getPage(currentPage.value);
  const size =
    mergedConfig.value.scrollMode === 'continuous'
      ? {
          width:
            continuousContentRef.value?.clientWidth ??
            containerSize.value.width,
          height:
            continuousContentRef.value?.clientHeight ??
            containerSize.value.height,
        }
      : containerSize.value;
  const newScale = pdfRenderer.calculateFitScale(page, size);

  if (mergedConfig.value.scrollMode === 'continuous') {
    await applyContinuousScale(newScale);
  } else {
    await renderCurrentPage(newScale);
  }
}

function getSelectedText(): string {
  if (mergedConfig.value.scrollMode === 'continuous') {
    return textSelection.getSelectedText(continuousContentRef.value);
  }
  return textSelection.getSelectedText(textLayerRef.value);
}

function getSelectedImages(): PdfImageInfo[] {
  return imageLayer.getSelectedImages();
}

function clearSelection(): void {
  textSelection.clearSelection();
  imageLayer.clearSelection();
  if (imageLayerRef.value) {
    imageLayer.refreshStyles(imageLayerRef.value);
  }
}

async function generateThumbnail(
  page: number,
  width?: number,
): Promise<ThumbnailInfo> {
  const pdfDoc = pdfLoader.pdfDocument.value;
  if (!pdfDoc) throw new Error('PDF 文档未加载');
  return thumbnail.generateThumbnail(pdfDoc, page, width);
}

async function generateAllThumbnails(width?: number): Promise<ThumbnailInfo[]> {
  const pdfDoc = pdfLoader.pdfDocument.value;
  if (!pdfDoc) throw new Error('PDF 文档未加载');
  return thumbnail.generateAllThumbnails(pdfDoc, width);
}

function extractImageAsBase64(imageInfo: PdfImageInfo): string {
  let canvas: HTMLCanvasElement | null = null;

  if (mergedConfig.value.scrollMode === 'continuous') {
    const placeholder = continuousPageRefs.get(imageInfo.pageNumber);
    if (placeholder) {
      canvas = placeholder.querySelector('canvas');
    }
  } else {
    canvas = canvasRef.value;
  }

  if (!canvas) return '';

  const outputScale = window.devicePixelRatio || 1;
  const tempCanvas = document.createElement('canvas');
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return '';

  const srcX = Math.floor(imageInfo.x * outputScale);
  const srcY = Math.floor(imageInfo.y * outputScale);
  const srcWidth = Math.floor(imageInfo.width * outputScale);
  const srcHeight = Math.floor(imageInfo.height * outputScale);

  tempCanvas.width = srcWidth;
  tempCanvas.height = srcHeight;
  ctx.drawImage(
    canvas,
    srcX,
    srcY,
    srcWidth,
    srcHeight,
    0,
    0,
    srcWidth,
    srcHeight,
  );

  return tempCanvas.toDataURL('image/png');
}

async function reload(): Promise<void> {
  await loadAndRender();
}

function destroy(): void {
  // 同步触发清理，不等待 Promise 完成（onUnmounted 无法 await）
  pdfLoader.destroy().catch(() => {});
  pdfRenderer.cancelRender().catch(() => {});
  imageLayer.cleanup();
  thumbnail.clearCache();
  continuousScroll.cleanup();
  continuousPageRefs.clear();
}

// ==================== 连续滚动处理 ====================

/** 设置连续页面的 ref */
function setContinuousPageRef(
  pageNumber: number,
  el: HTMLElement | null,
): void {
  if (el) {
    continuousPageRefs.set(pageNumber, el);
  } else {
    continuousPageRefs.delete(pageNumber);
  }
}

/** 将渲染好的页面挂载到 DOM */
function mountContinuousPages(): void {
  for (const page of continuousScroll.pages.value) {
    const container = continuousScroll.getPageContainer(page.pageNumber);
    const placeholder = continuousPageRefs.get(page.pageNumber);
    if (
      container &&
      placeholder &&
      page.rendered &&
      container.hasChildNodes()
    ) {
      // 已挂载则跳过，避免无谓 DOM 操作
      if (placeholder.hasChildNodes()) continue;
      while (container.firstChild) {
        placeholder.appendChild(container.firstChild);
      }
    }
  }

  // 页面重新挂载后，重新应用搜索高亮
  if (textSearch.keyword.value) {
    highlightContinuousSearchMatches();
  }
}

/** 处理连续滚动事件 */
let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function handleContinuousScroll(event: Event): Promise<void> {
  const target = event.target as HTMLElement;
  const scrollTop = target.scrollTop;
  const viewportHeight = target.clientHeight;

  // 更新当前可见页
  const prevPage = continuousScroll.visiblePage.value;
  continuousScroll.handleScroll(scrollTop, viewportHeight);

  // 仅在页码变化时触发事件
  const newPage = continuousScroll.visiblePage.value;
  if (newPage !== prevPage) {
    emit('pageChange', newPage, totalPages.value);
  }

  // 防抖渲染
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
  }
  scrollDebounceTimer = setTimeout(async () => {
    scrollDebounceTimer = null;
    await continuousScroll.renderVisiblePages(scrollTop, viewportHeight);
    mountContinuousPages();
  }, 100);
}

// ==================== 事件处理 ====================

function handleContentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  // 检查点击是否在图片 overlay 内部（包括子元素）
  if (target.closest('.aix-pdf-image-overlay')) {
    return;
  }
  if (
    mergedConfig.value.enableImageLayer &&
    imageLayer.selectedImages.value.size > 0
  ) {
    imageLayer.clearSelection();
    if (mergedConfig.value.scrollMode === 'continuous') {
      // 连续模式：刷新所有页面的图片层样式
      for (const [, placeholder] of continuousPageRefs) {
        const imgLayer = placeholder.querySelector(
          '.aix-pdf-viewer__image-layer',
        ) as HTMLElement | null;
        if (imgLayer) {
          imageLayer.refreshStyles(imgLayer);
        }
      }
    } else if (imageLayerRef.value) {
      imageLayer.refreshStyles(imageLayerRef.value);
    }
  }
}

function handleContextMenu(event: MouseEvent): void {
  if (mergedConfig.value.enableContextMenu) {
    contextMenu.show(event);
  }
}

// ==================== 搜索处理 ====================

function highlightContinuousSearchMatches(): void {
  if (!continuousContentRef.value || !textSearch.keyword.value) return;

  for (const page of continuousScroll.pages.value) {
    if (!page.rendered) continue;
    const placeholder = continuousPageRefs.get(page.pageNumber);
    if (!placeholder) continue;
    const textLayer = placeholder.querySelector(
      '.textLayer',
    ) as HTMLElement | null;
    if (textLayer) {
      textSearch.highlightMatches(textLayer, page.pageNumber);
    }
  }
}

function clearContinuousHighlights(): void {
  for (const [, placeholder] of continuousPageRefs) {
    const textLayer = placeholder.querySelector(
      '.textLayer',
    ) as HTMLElement | null;
    if (textLayer) {
      textSearch.clearHighlights(textLayer);
    }
  }
}

async function handleSearch(keyword: string): Promise<void> {
  const pdfDoc = pdfLoader.pdfDocument.value;
  if (!pdfDoc) return;
  await textSearch.search(pdfDoc, keyword);
}

function handleSearchNext(): void {
  textSearch.nextMatch();
}

function handleSearchPrev(): void {
  textSearch.prevMatch();
}

function handleSearchClear(): void {
  textSearch.clearSearch();
  if (mergedConfig.value.scrollMode === 'continuous') {
    clearContinuousHighlights();
  } else if (textLayerRef.value) {
    textSearch.clearHighlights(textLayerRef.value);
  }
}

function handleKeydown(event: KeyboardEvent): void {
  // 仅当焦点在当前组件实例内时处理
  const target = (document.activeElement || event.target) as Node | null;
  if (!rootRef.value?.contains(target)) return;

  // Ctrl+F 或 Cmd+F 打开搜索
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault();
    searchBarVisible.value = true;
  }
}

/** 打开搜索栏 */
function openSearch(): void {
  searchBarVisible.value = true;
}

/** 关闭搜索栏 */
function closeSearch(): void {
  searchBarVisible.value = false;
  handleSearchClear();
}

// ==================== 生命周期 ====================

watch(
  () => props.source,
  (newSource) => {
    if (newSource) loadAndRender();
  },
);

// 运行时切换 scrollMode
watch(
  () => mergedConfig.value.scrollMode,
  async () => {
    if (!pdfLoader.pdfDocument.value) return;

    // 断开旧 ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    await nextTick();

    // 重连到新容器
    const newContainer =
      mergedConfig.value.scrollMode === 'continuous'
        ? continuousContentRef.value
        : contentRef.value;

    if (newContainer && mergedConfig.value.fitToContainer) {
      resizeObserver = new ResizeObserver(debouncedResize);
      resizeObserver.observe(newContainer);
    }

    // 初始化新模式渲染
    await initCurrentMode();
  },
);

onMounted(async () => {
  await nextTick();

  // 观察正确的容器（根据滚动模式）
  const observeContainer =
    mergedConfig.value.scrollMode === 'continuous'
      ? continuousContentRef.value
      : contentRef.value;

  if (observeContainer && mergedConfig.value.fitToContainer) {
    resizeObserver = new ResizeObserver(debouncedResize);
    resizeObserver.observe(observeContainer);
  }

  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeydown);

  if (props.source) {
    loadAndRender();
  }
});

onUnmounted(() => {
  // 清理所有定时器
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = null;
  }
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  document.removeEventListener('keydown', handleKeydown);
  destroy();
});

// 页面切换时更新搜索高亮
watch(currentPage, () => {
  if (textSearch.keyword.value) {
    nextTick(() => {
      if (mergedConfig.value.scrollMode === 'continuous') {
        highlightContinuousSearchMatches();
      } else if (textLayerRef.value) {
        textSearch.highlightMatches(
          textLayerRef.value,
          pdfRenderer.currentPage.value,
        );
      }
    });
  }
});

defineExpose({
  // 状态
  loading,
  currentPage,
  totalPages,
  scale,

  // 页面控制
  gotoPage,
  nextPage,
  prevPage,

  // 缩放控制
  setScale,
  zoomIn,
  zoomOut,
  fitToWidth,
  fitToPage,

  // 选择相关
  getSelectedText,
  getSelectedImages,
  clearSelection,

  // 缩略图
  generateThumbnail,
  generateAllThumbnails,

  // 图片提取
  extractImageAsBase64,

  // 搜索
  openSearch,
  closeSearch,
  search: handleSearch,

  // 其他
  reload,
  destroy,
});
</script>

<style lang="scss">
@use './styles/index';
</style>
