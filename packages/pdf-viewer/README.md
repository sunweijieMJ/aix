# @aix/pdf-viewer

基于 pdf.js 的 Vue 3 PDF 预览组件，支持文字选择、图片选择、缩略图生成等功能。

## ✨ 特性

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

## 快速开始

```vue
<template>
  <PdfViewer
    :source="pdfUrl"
    :config="{ showToolbar: true }"
    @loaded="onLoaded"
    @error="onError"
  />
</template>

<script setup lang="ts">
import { PdfViewer } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = 'https://example.com/document.pdf';

const onLoaded = (totalPages: number) => {
  console.log('PDF 加载完成，共', totalPages, '页');
};

const onError = (error: Error) => {
  console.error('PDF 加载失败:', error);
};
</script>
```

## API

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `source` | `string \| ArrayBuffer` | - | ✅ | PDF 文件 URL 或 ArrayBuffer 数据 |
| `initialPage` | `number` | `1` | - | 初始显示的页码 |
| `config` | `Partial<PdfViewerConfig>` | `{}` | - | 预览器配置项（缩放、工具栏、文字层等） |
| `imageLayerConfig` | `Partial<ImageLayerConfig>` | `{}` | - | 图片层配置（hover、选择、样式等） |
| `contextMenuConfig` | `Partial<ContextMenuConfig>` | `{}` | - | 右键菜单配置（菜单项、启用状态等） |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `ready` | `number` | PDF 加载完成，返回总页数 |
| `error` | `Error` | PDF 加载错误，返回错误信息 |
| `pageChange` | `number` | 页码变化，返回当前页码和总页数 |
| `scaleChange` | `number` | 缩放比例变化，返回当前缩放比例 |
| `textSelect` | `string` | 文本选中，返回选中的文本内容 |
| `imageClick` | `PdfImageInfo` | 图片点击，返回图片信息和鼠标事件 |
| `imageSelect` | `PdfImageInfo[]` | 图片选中（多选），返回所有选中的图片 |
| `contextMenu` | `ContextMenuContext` | 右键菜单触发，返回菜单上下文信息 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `toolbar` | - |
## 类型定义

```typescript
// PDF 图片信息
interface PdfImageInfo {
  id: string;
  objId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pdfRect: { x: number; y: number; width: number; height: number };
  transform: number[];
  pageNumber: number;
}

// 缩略图信息
interface ThumbnailInfo {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

// 右键菜单上下文
interface ContextMenuContext {
  type: 'text' | 'image' | 'mixed' | 'empty';
  selectedText: string;
  selectedImages: PdfImageInfo[];
  pageNumber: number;
  position: { x: number; y: number };
}
```

## License

MIT
