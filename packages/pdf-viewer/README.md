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
| `source` | `string` \| `ArrayBuffer` | - | ✅ | PDF 文件 URL 或 ArrayBuffer |
| `initialPage` | `number` | `1` | - | 初始页码 |
| `config` | `Partial` | `() => ({})` | - | 配置项 |
| `imageLayerConfig` | `Partial` | `() => ({})` | - | 图片层配置 |
| `contextMenuConfig` | `Partial` | `() => ({})` | - | 右键菜单配置 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `ready` | `number` | - |
| `error` | `Error` | - |
| `pageChange` | `number` | - |
| `scaleChange` | `number` | - |
| `textSelect` | `string` | - |
| `imageClick` | `PdfImageInfo` | - |
| `imageSelect` | `Array` | - |
| `contextMenu` | `ContextMenuContext` | - |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `toolbar` | - |

## 使用示例

### 基础用法

```vue
<template>
  <div style="height: 600px">
    <PdfViewer :source="pdfUrl" />
  </div>
</template>

<script setup lang="ts">
import { PdfViewer } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = '/documents/sample.pdf';
</script>
```

### 使用 ref 控制

```vue
<template>
  <div>
    <div class="toolbar">
      <button @click="pdfRef?.prevPage()">上一页</button>
      <span>{{ pdfRef?.currentPage }} / {{ pdfRef?.totalPages }}</span>
      <button @click="pdfRef?.nextPage()">下一页</button>
      <button @click="pdfRef?.zoomIn()">放大</button>
      <button @click="pdfRef?.zoomOut()">缩小</button>
    </div>
    <PdfViewer ref="pdfRef" :source="pdfUrl" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PdfViewer, type PdfViewerExpose } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfRef = ref<PdfViewerExpose>();
const pdfUrl = '/documents/sample.pdf';
</script>
```

### 图片选择

```vue
<template>
  <PdfViewer
    :source="pdfUrl"
    :config="{ enableImageLayer: true }"
    :imageLayerConfig="{ multiSelect: true }"
    @imageSelect="onImageSelect"
  />
</template>

<script setup lang="ts">
import { PdfViewer, type PdfImageInfo } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = '/documents/sample.pdf';

const onImageSelect = (images: PdfImageInfo[]) => {
  console.log('选中了', images.length, '张图片');
};
</script>
```

### 生成缩略图

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { PdfViewer, type PdfViewerExpose, type ThumbnailInfo } from '@aix/pdf-viewer';

const pdfRef = ref<PdfViewerExpose>();
const thumbnails = ref<ThumbnailInfo[]>([]);

onMounted(async () => {
  // 等待 PDF 加载完成后生成缩略图
  thumbnails.value = await pdfRef.value?.generateAllThumbnails(150) ?? [];
});
</script>
```

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
