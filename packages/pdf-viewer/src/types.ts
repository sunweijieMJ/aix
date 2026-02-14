/**
 * @aix/pdf 类型定义
 */
import type { Ref } from 'vue';

// ==================== PDF 预览器配置 ====================

/** 滚动模式 */
export type ScrollMode = 'single' | 'continuous';

/** PDF 预览器配置 */
export interface PdfViewerConfig {
  /** 初始缩放比例 (当 fitToContainer 为 false 时使用) */
  initialScale: number;
  /** 是否自适应容器尺寸 */
  fitToContainer: boolean;
  /** 最大缩放比例 */
  maxScale: number;
  /** 最小缩放比例 */
  minScale: number;
  /** 自适应时的内边距 (像素) */
  fitPadding: number;
  /** 是否显示工具栏 */
  showToolbar: boolean;
  /** 是否启用文字层 (支持文字选择) */
  enableTextLayer: boolean;
  /** 是否启用图片层 (支持图片选择) */
  enableImageLayer: boolean;
  /** 是否启用右键菜单 */
  enableContextMenu: boolean;
  /** 滚动模式: 'single' 单页 | 'continuous' 连续滚动 */
  scrollMode: ScrollMode;
  /** 连续模式下页面间距 (像素) */
  pageGap: number;
}

// ==================== 图片信息 ====================

/** 图片高亮样式 */
export interface ImageHighlightStyle {
  /** 边框颜色 */
  borderColor: string;
  /** 边框宽度 */
  borderWidth: number;
  /** 背景颜色 */
  backgroundColor?: string;
}

/** PDF 图片信息 */
export interface PdfImageInfo {
  /** 唯一标识 */
  id: string;
  /** 图片对象 ID (pdfjs 内部) */
  objId: string;
  /** 视口坐标 X */
  x: number;
  /** 视口坐标 Y */
  y: number;
  /** 视口宽度 */
  width: number;
  /** 视口高度 */
  height: number;
  /** 图片在 PDF 坐标系中的原始位置 */
  pdfRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 变换矩阵 */
  transform: number[];
  /** 页码 */
  pageNumber: number;
}

// ==================== 图片层配置 ====================

/** 图片层配置 */
export interface ImageLayerConfig {
  /** 是否启用 hover 效果 */
  enableHover: boolean;
  /** 是否启用选择功能 */
  enableSelection: boolean;
  /** 是否多选模式 (按住 Ctrl 多选) */
  multiSelect: boolean;
  /** 最小图片尺寸 (小于此尺寸的图片会被过滤) */
  minImageSize: number;
  /** 最大图片占页面比例 (0-1)，超过此比例的图片会被过滤（视为背景） */
  maxPageRatio: number;
  /** hover 样式 */
  hoverStyle: ImageHighlightStyle;
  /** 选中样式 */
  selectedStyle: ImageHighlightStyle;
}

/** 图片层事件 */
export interface ImageLayerEvents {
  /** 图片点击 */
  onImageClick?: (image: PdfImageInfo, event: MouseEvent) => void;
  /** 图片双击 */
  onImageDblClick?: (image: PdfImageInfo, event: MouseEvent) => void;
  /** 图片 hover */
  onImageHover?: (image: PdfImageInfo | null, event: MouseEvent) => void;
  /** 图片选中变化 */
  onSelectionChange?: (selectedImages: PdfImageInfo[]) => void;
}

// ==================== 右键菜单 ====================

/** 右键菜单项 */
export interface ContextMenuItem {
  /** 菜单项 ID */
  id: string;
  /** 显示文本 */
  label: string;
  /** 图标 (可选) */
  icon?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示分割线 */
  divider?: boolean;
}

/** 右键菜单类型 */
export type ContextMenuType = 'text' | 'image' | 'mixed' | 'empty';

/** 右键菜单上下文 */
export interface ContextMenuContext {
  /** 菜单类型 */
  type: ContextMenuType;
  /** 选中的文字 */
  selectedText: string;
  /** 选中的图片 */
  selectedImages: PdfImageInfo[];
  /** 当前页码 */
  pageNumber: number;
  /** 鼠标位置 */
  position: { x: number; y: number };
}

/** 右键菜单配置 */
export interface ContextMenuConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 文字选中时的菜单项 */
  textMenuItems?: ContextMenuItem[];
  /** 图片选中时的菜单项 */
  imageMenuItems?: ContextMenuItem[];
  /** 混合选中时的菜单项 */
  mixedMenuItems?: ContextMenuItem[];
  /** 空白区域的菜单项 */
  emptyMenuItems?: ContextMenuItem[];
}

// ==================== 缩略图 ====================

/** 缩略图信息 */
export interface ThumbnailInfo {
  /** 页码 */
  pageNumber: number;
  /** 缩略图 Data URL */
  dataUrl: string;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

// ==================== 组件 Props ====================

/** PdfViewer Props */
export interface PdfViewerProps {
  /** PDF 文件 URL 或 ArrayBuffer 数据 */
  source: string | ArrayBuffer;
  /**
   * 初始显示的页码
   * @default 1
   */
  initialPage?: number;
  /** 预览器配置项（缩放、工具栏、文字层等） */
  config?: Partial<PdfViewerConfig>;
  /** 图片层配置（hover、选择、样式等） */
  imageLayerConfig?: Partial<ImageLayerConfig>;
  /** 右键菜单配置（菜单项、启用状态等） */
  contextMenuConfig?: Partial<ContextMenuConfig>;
}

// ==================== 组件 Emits ====================

/** PdfViewer Emits */
export interface PdfViewerEmits {
  /** PDF 加载完成，返回总页数 */
  (e: 'ready', totalPages: number): void;
  /** PDF 加载错误，返回错误信息 */
  (e: 'error', error: Error): void;
  /** 页码变化，返回当前页码和总页数 */
  (e: 'pageChange', page: number, total: number): void;
  /** 缩放比例变化，返回当前缩放比例 */
  (e: 'scaleChange', scale: number): void;
  /** 文本选中，返回选中的文本内容 */
  (e: 'textSelect', text: string): void;
  /** 图片点击，返回图片信息和鼠标事件 */
  (e: 'imageClick', image: PdfImageInfo, event: MouseEvent): void;
  /** 图片选中（多选），返回所有选中的图片 */
  (e: 'imageSelect', images: PdfImageInfo[]): void;
  /** 右键菜单触发，返回菜单上下文信息 */
  (e: 'contextMenu', context: ContextMenuContext): void;
}

// ==================== 组件 Expose ====================

/** PdfViewer 暴露的方法和状态 */
export interface PdfViewerExpose {
  // 状态
  /** 加载状态 */
  loading: Ref<boolean>;
  /** 当前页码 */
  currentPage: Ref<number>;
  /** 总页数 */
  totalPages: Ref<number>;
  /** 当前缩放比例 */
  scale: Ref<number>;

  // 页面控制
  /** 跳转到指定页 */
  gotoPage: (page: number) => Promise<void>;
  /** 下一页 */
  nextPage: () => Promise<void>;
  /** 上一页 */
  prevPage: () => Promise<void>;

  // 缩放控制
  /** 设置缩放比例 */
  setScale: (scale: number) => Promise<void>;
  /** 放大 */
  zoomIn: (step?: number) => Promise<void>;
  /** 缩小 */
  zoomOut: (step?: number) => Promise<void>;
  /** 适应宽度 */
  fitToWidth: () => Promise<void>;
  /** 适应页面 */
  fitToPage: () => Promise<void>;

  // 选择相关
  /** 获取选中的文字 */
  getSelectedText: () => string;
  /** 获取选中的图片 */
  getSelectedImages: () => PdfImageInfo[];
  /** 清除选择 */
  clearSelection: () => void;

  // 缩略图
  /** 生成单页缩略图 */
  generateThumbnail: (page: number, width?: number) => Promise<ThumbnailInfo>;
  /** 生成所有页面缩略图 */
  generateAllThumbnails: (width?: number) => Promise<ThumbnailInfo[]>;

  // 图片提取
  /** 将图片区域提取为 Base64 */
  extractImageAsBase64: (image: PdfImageInfo) => string;

  // 搜索
  /** 打开搜索栏 */
  openSearch: () => void;
  /** 关闭搜索栏 */
  closeSearch: () => void;
  /** 执行搜索 */
  search: (keyword: string) => Promise<void>;

  // 其他
  /** 重新加载 */
  reload: () => Promise<void>;
  /** 销毁 */
  destroy: () => void;
}
