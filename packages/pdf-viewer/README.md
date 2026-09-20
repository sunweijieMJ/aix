# @aix/pdf-viewer

基于 pdf.js 的 Vue 3 PDF 预览组件，支持文字选择、图片选择、缩略图生成等功能。

## 特性

- 基于 pdf.js 5.x，支持最新 PDF 标准
- 支持单页和连续滚动两种模式
- 文字层支持（可选择、复制文字）
- 图片层支持（可选择、提取图片）
- 缩略图生成
- 文本搜索
- 缩放控制（放大、缩小、适应宽度、适应页面）
- 右键菜单支持
- TypeScript 类型支持
- 响应式设计

## 安装

```bash
pnpm add @aix/pdf-viewer
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/pdf-viewer/style';
import '@aix/theme/style';
```

## 快速开始

```vue
<template>
  <PdfViewer
    :source="pdfUrl"
    :config="{ showToolbar: true }"
    @ready="onReady"
    @error="onError"
  />
</template>

<script setup lang="ts">
import { PdfViewer } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = 'https://example.com/document.pdf';

const onReady = (totalPages: number) => {
  console.log('PDF 加载完成，共', totalPages, '页');
};

const onError = (error: Error) => {
  console.error('PDF 加载失败:', error);
};
</script>
```

## API

**PdfViewer** — PDF 预览组件

使用 pdfjs-dist 提供 PDF 预览功能，支持文本和图片选择

### PdfViewer Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `source` | `string \| ArrayBuffer` | - | ✅ | PDF 文件 URL 或 ArrayBuffer 数据 |
| `initialPage` | `number` | `1` | - | 初始显示的页码 |
| `config` | `Partial<PdfViewerConfig>` | `{}` | - | 预览器配置项（缩放、工具栏、文字层等） |
| `imageLayerConfig` | `Partial<ImageLayerConfig>` | `{}` | - | 图片层配置（hover、选择、样式等） |
| `contextMenuConfig` | `Partial<ContextMenuConfig>` | `{}` | - | 右键菜单配置（菜单项、启用状态等） |

### PdfViewer Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `ready` | `totalPages: number` | PDF 加载完成，返回总页数 |
| `error` | `error: Error` | PDF 加载错误，返回错误信息 |
| `pageChange` | `page: number, total: number` | 页码变化，返回当前页码和总页数 |
| `scaleChange` | `scale: number` | 缩放比例变化，返回当前缩放比例 |
| `textSelect` | `text: string` | 文本选中，返回选中的文本内容 |
| `imageClick` | `image: PdfImageInfo, event: MouseEvent` | 图片点击，返回图片信息和鼠标事件 |
| `imageSelect` | `images: PdfImageInfo[]` | 图片选中（多选），返回所有选中的图片 |
| `contextMenu` | `context: ContextMenuContext` | 右键菜单触发，返回菜单上下文信息 |

### PdfViewer Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `toolbar` | `props: PdfViewerToolbarSlotScope` | 自定义工具栏，默认渲染内置 PdfToolbar |

### PdfViewer Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `loading` | `Ref<boolean>` | 加载状态 |
| `currentPage` | `Ref<number>` | 当前页码 |
| `totalPages` | `Ref<number>` | 总页数 |
| `scale` | `Ref<number>` | 当前缩放比例 |
| `gotoPage` | `(page: number) => Promise<void>` | 跳转到指定页 |
| `nextPage` | `() => Promise<void>` | 下一页 |
| `prevPage` | `() => Promise<void>` | 上一页 |
| `setScale` | `(scale: number) => Promise<void>` | 设置缩放比例 |
| `zoomIn` | `(step?: number) => Promise<void>` | 放大 |
| `zoomOut` | `(step?: number) => Promise<void>` | 缩小 |
| `fitToWidth` | `() => Promise<void>` | 适应宽度 |
| `fitToPage` | `() => Promise<void>` | 适应页面 |
| `getSelectedText` | `() => string` | 获取选中的文字 |
| `getSelectedImages` | `() => PdfImageInfo[]` | 获取选中的图片 |
| `clearSelection` | `() => void` | 清除选择 |
| `generateThumbnail` | `(page: number, width?: number) => Promise<ThumbnailInfo>` | 生成单页缩略图 |
| `generateAllThumbnails` | `(width?: number) => Promise<ThumbnailInfo[]>` | 生成所有页面缩略图 |
| `extractImageAsBase64` | `(image: PdfImageInfo) => string` | 将图片区域提取为 Base64 |
| `openSearch` | `() => void` | 打开搜索栏 |
| `closeSearch` | `() => void` | 关闭搜索栏 |
| `search` | `(keyword: string) => Promise<void>` | 执行搜索 |
| `reload` | `() => Promise<void>` | 重新加载 |
| `destroy` | `() => void` | 销毁 |

---

**PdfToolbar** — PDF 工具栏：翻页、跳页、缩放与适应页面，三个区域都可用插槽替换。

### PdfToolbar Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `currentPage` | `number` | - | ✅ | 当前页码（从 1 开始） |
| `totalPages` | `number` | - | ✅ | 总页数 |
| `scale` | `number` | - | ✅ | 当前缩放比例，1 为 100% |
| `minScale` | `number` | - | ✅ | 最小缩放比例 |
| `maxScale` | `number` | - | ✅ | 最大缩放比例 |

### PdfToolbar Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `prev` | - | 上一页 |
| `next` | - | 下一页 |
| `goto` | `page: number` | 跳转到指定页 |
| `zoom-in` | - | 放大 |
| `zoom-out` | - | 缩小 |
| `fit-page` | - | 适应页面 |

### PdfToolbar Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `left` | - | 左侧区域，默认渲染翻页控件与页码输入 |
| `center` | - | 中间区域，默认渲染缩放控件 |
| `right` | - | 右侧区域，默认渲染适应页面按钮 |

---

**PdfSearchBar** — PDF 搜索栏：关键字输入与命中项的上一个 / 下一个跳转。

### PdfSearchBar Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `visible` | `boolean` | - | ✅ | 是否显示搜索栏 |
| `searching` | `boolean` | - | ✅ | 是否正在搜索 |
| `totalMatches` | `number` | - | ✅ | 匹配总数 |
| `currentIndex` | `number` | - | ✅ | 当前匹配序号，与 totalMatches 一起显示为「n / 总数」 |

### PdfSearchBar Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `search` | `keyword: string` | 提交关键字搜索 |
| `prev` | - | 上一个匹配 |
| `next` | - | 下一个匹配 |
| `clear` | - | 清空关键字与结果 |
| `close` | - | 关闭搜索栏 |

## 类型定义

```typescript
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

/** `toolbar` 插槽的作用域 */
export interface PdfViewerToolbarSlotScope {
  /** 当前页码（连续滚动模式下为视口内可见页） */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 当前缩放比例 */
  scale: number;
  /** 跳转到指定页 */
  gotoPage: (page: number) => Promise<void>;
  /** 上一页 */
  prevPage: () => Promise<void>;
  /** 下一页 */
  nextPage: () => Promise<void>;
  /** 放大，step 缺省为 ZOOM_STEP */
  zoomIn: (step?: number) => Promise<void>;
  /** 缩小，step 缺省为 ZOOM_STEP */
  zoomOut: (step?: number) => Promise<void>;
  /** 适应页面 */
  fitToPage: () => Promise<void>;
}
```
