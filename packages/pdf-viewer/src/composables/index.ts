/**
 * Composables 导出
 */
export { usePdfLoader, loadPdfJsLib } from './usePdfLoader';
export type { UsePdfLoaderOptions, UsePdfLoaderReturn } from './usePdfLoader';

export { usePdfRenderer } from './usePdfRenderer';
export type {
  UsePdfRendererOptions,
  UsePdfRendererReturn,
  RenderContext,
  RenderResult,
} from './usePdfRenderer';

export { useImageLayer } from './useImageLayer';
export type { UseImageLayerReturn } from './useImageLayer';

export { useTextSelection } from './useTextSelection';
export type {
  UseTextSelectionOptions,
  UseTextSelectionReturn,
} from './useTextSelection';

export { useThumbnail } from './useThumbnail';
export type { UseThumbnailOptions, UseThumbnailReturn } from './useThumbnail';

export { useContextMenu } from './useContextMenu';
export type {
  UseContextMenuOptions,
  UseContextMenuReturn,
} from './useContextMenu';

export { useTextSearch } from './useTextSearch';
export type {
  UseTextSearchOptions,
  UseTextSearchReturn,
  SearchMatch,
} from './useTextSearch';

export { useContinuousScroll } from './useContinuousScroll';
export type {
  UseContinuousScrollOptions,
  UseContinuousScrollReturn,
  PageRenderInfo,
} from './useContinuousScroll';
