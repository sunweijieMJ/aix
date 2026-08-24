/**
 * @aix/pdf 常量定义
 */
import type {
  PdfViewerConfig,
  ImageLayerConfig,
  ContextMenuConfig,
  ImageHighlightStyle,
  ContextMenuItem,
} from './types';

/**
 * 默认图片高亮样式。
 *
 * 值最终经 `element.style.borderColor = ...` 写进内联样式，内联样式会解析 `var()`，
 * 故此处直接写主题 Token 即可跟随明暗切换。兜底值保留原先的字面量，
 * 供未引入 `@aix/theme/style` 的消费方使用。
 */
export const DEFAULT_IMAGE_HIGHLIGHT_STYLES: {
  hover: ImageHighlightStyle;
  selected: ImageHighlightStyle;
} = {
  hover: {
    borderColor: 'var(--aix-colorPrimary, #409eff)',
    borderWidth: 2,
    backgroundColor: 'var(--aix-colorPrimaryBg, rgb(64 158 255 / 0.1))',
  },
  selected: {
    borderColor: 'var(--aix-colorSuccess, #67c23a)',
    borderWidth: 2,
    backgroundColor: 'var(--aix-colorSuccessBg, rgb(103 194 58 / 0.15))',
  },
};

/** 默认 PDF 预览器配置 */
export const DEFAULT_PDF_CONFIG: PdfViewerConfig = {
  initialScale: 1.5,
  fitToContainer: true,
  maxScale: 3,
  minScale: 0.5,
  fitPadding: 16,
  showToolbar: false,
  enableTextLayer: true,
  enableImageLayer: false,
  enableContextMenu: true,
  scrollMode: 'single',
  pageGap: 16,
};

/** 默认图片层配置 */
export const DEFAULT_IMAGE_LAYER_CONFIG: ImageLayerConfig = {
  enableHover: true,
  enableSelection: true,
  multiSelect: false,
  minImageSize: 5,
  maxPageRatio: 0.9,
  hoverStyle: { ...DEFAULT_IMAGE_HIGHLIGHT_STYLES.hover },
  selectedStyle: { ...DEFAULT_IMAGE_HIGHLIGHT_STYLES.selected },
};

/** 默认文字菜单项 */
export const DEFAULT_TEXT_MENU_ITEMS: ContextMenuItem[] = [{ id: 'copy', label: '复制' }];

/** 默认图片菜单项 */
export const DEFAULT_IMAGE_MENU_ITEMS: ContextMenuItem[] = [
  { id: 'copy-image', label: '复制图片' },
  { id: 'save-image', label: '保存图片' },
];

/** 默认右键菜单配置 */
export const DEFAULT_CONTEXT_MENU_CONFIG: ContextMenuConfig = {
  enabled: true,
  textMenuItems: DEFAULT_TEXT_MENU_ITEMS,
  imageMenuItems: DEFAULT_IMAGE_MENU_ITEMS,
  mixedMenuItems: [
    ...DEFAULT_TEXT_MENU_ITEMS,
    { id: 'divider', label: '', divider: true },
    ...DEFAULT_IMAGE_MENU_ITEMS,
  ],
  emptyMenuItems: [],
};

/** CSS 类名前缀 */
export const CLASS_PREFIX = 'aix-pdf';

/** 缩放步长 */
export const ZOOM_STEP = 0.25;
