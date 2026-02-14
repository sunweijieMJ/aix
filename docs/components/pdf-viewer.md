---
title: PdfViewer PDF 预览器
outline: deep
---

基于 pdf.js 的 PDF 预览组件，支持文字选择、图片选择、缩略图生成等功能。

## 何时使用

- 需要在网页中预览 PDF 文档
- 需要选择和复制 PDF 中的文字
- 需要提取 PDF 中的图片
- 需要生成 PDF 缩略图

## 代码演示

### 基础用法

最简单的用法，传入 PDF 地址即可预览。

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

通过 ref 获取组件实例，可以调用组件方法进行控制。

```vue
<template>
  <div>
    <div class="toolbar">
      <button @click="pdfRef?.prevPage()">上一页</button>
      <span>{{ currentPage }} / {{ totalPages }}</span>
      <button @click="pdfRef?.nextPage()">下一页</button>
      <button @click="pdfRef?.zoomIn()">放大</button>
      <button @click="pdfRef?.zoomOut()">缩小</button>
      <button @click="pdfRef?.fitWidth()">适应宽度</button>
      <button @click="pdfRef?.fitPage()">适应页面</button>
    </div>
    <PdfViewer
      ref="pdfRef"
      :source="pdfUrl"
      @pageChange="onPageChange"
      @ready="onReady"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PdfViewer, type PdfViewerExpose } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfRef = ref<PdfViewerExpose>();
const pdfUrl = '/documents/sample.pdf';
const currentPage = ref(1);
const totalPages = ref(0);

const onReady = (pages: number) => {
  totalPages.value = pages;
};

const onPageChange = (page: number) => {
  currentPage.value = page;
};
</script>
```

### 文字选择

启用文字层后，可以选择和复制 PDF 中的文字。

```vue
<template>
  <PdfViewer
    :source="pdfUrl"
    :config="{ enableTextLayer: true }"
    @textSelect="onTextSelect"
  />
</template>

<script setup lang="ts">
import { PdfViewer } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = '/documents/sample.pdf';

const onTextSelect = (text: string) => {
  console.log('选中的文字:', text);
};
</script>
```

### 图片选择

启用图片层后，可以选择和提取 PDF 中的图片。

```vue
<template>
  <PdfViewer
    :source="pdfUrl"
    :config="{ enableImageLayer: true }"
    :imageLayerConfig="{ multiSelect: true }"
    @imageClick="onImageClick"
    @imageSelect="onImageSelect"
  />
</template>

<script setup lang="ts">
import { PdfViewer, type PdfImageInfo } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = '/documents/sample.pdf';

const onImageClick = (image: PdfImageInfo) => {
  console.log('点击了图片:', image);
};

const onImageSelect = (images: PdfImageInfo[]) => {
  console.log('选中了', images.length, '张图片');
};
</script>
```

### 生成缩略图

可以生成 PDF 各页的缩略图。

```vue
<template>
  <div class="pdf-with-thumbnails">
    <div class="thumbnails">
      <div
        v-for="thumb in thumbnails"
        :key="thumb.pageNumber"
        class="thumbnail"
        @click="pdfRef?.goToPage(thumb.pageNumber)"
      >
        <img :src="thumb.dataUrl" :alt="`Page ${thumb.pageNumber}`" />
        <span>{{ thumb.pageNumber }}</span>
      </div>
    </div>
    <PdfViewer
      ref="pdfRef"
      :source="pdfUrl"
      @ready="generateThumbnails"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PdfViewer, type PdfViewerExpose, type ThumbnailInfo } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfRef = ref<PdfViewerExpose>();
const pdfUrl = '/documents/sample.pdf';
const thumbnails = ref<ThumbnailInfo[]>([]);

const generateThumbnails = async () => {
  thumbnails.value = await pdfRef.value?.generateAllThumbnails(150) ?? [];
};
</script>

<style scoped>
.pdf-with-thumbnails {
  display: flex;
  height: 600px;
}
.thumbnails {
  width: 150px;
  overflow-y: auto;
  border-right: 1px solid #eee;
}
.thumbnail {
  cursor: pointer;
  padding: 8px;
  text-align: center;
}
.thumbnail img {
  max-width: 100%;
}
</style>
```

### 右键菜单

自定义右键菜单。

```vue
<template>
  <PdfViewer
    :source="pdfUrl"
    :contextMenuConfig="{
      enabled: true,
      items: ['copy', 'download', 'print']
    }"
    @contextMenu="onContextMenu"
  />
</template>

<script setup lang="ts">
import { PdfViewer, type ContextMenuContext } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = '/documents/sample.pdf';

const onContextMenu = (context: ContextMenuContext) => {
  console.log('右键菜单:', context.type);
  console.log('选中文字:', context.selectedText);
  console.log('选中图片:', context.selectedImages.length);
};
</script>
```

### 自定义工具栏

通过 `toolbar` 插槽自定义工具栏。

```vue
<template>
  <PdfViewer :source="pdfUrl">
    <template #toolbar="{ currentPage, totalPages, scale, actions }">
      <div class="custom-toolbar">
        <button @click="actions.prevPage">上一页</button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button @click="actions.nextPage">下一页</button>
        <span>缩放: {{ Math.round(scale * 100) }}%</span>
        <button @click="actions.zoomIn">+</button>
        <button @click="actions.zoomOut">-</button>
      </div>
    </template>
  </PdfViewer>
</template>
```

## API

::: warning 自动生成的 API 文档
以下 API 文档由 `pnpm docs:gen` 从组件源码自动生成。请勿手动编辑此部分。

如需更新 API 文档，请：
1. 修改组件源码中的 JSDoc 注释
2. 运行 `pnpm docs:gen` 生成到 README.md
3. 运行 `pnpm docs:sync` 同步到此文档
:::

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

### PdfImageInfo

```typescript
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
```

### ThumbnailInfo

```typescript
interface ThumbnailInfo {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}
```

### ContextMenuContext

```typescript
interface ContextMenuContext {
  type: 'text' | 'image' | 'mixed' | 'empty';
  selectedText: string;
  selectedImages: PdfImageInfo[];
  pageNumber: number;
  position: { x: number; y: number };
}
```

### PdfViewerConfig

```typescript
interface PdfViewerConfig {
  enableTextLayer: boolean;     // 启用文字层
  enableImageLayer: boolean;    // 启用图片层
  showToolbar: boolean;         // 显示工具栏
  scrollMode: 'continuous' | 'page';  // 滚动模式
  initialScale: number | 'fit-width' | 'fit-page';  // 初始缩放
}
```

::: tip 提示
PDF 预览需要一定高度的容器，建议设置容器高度或使用 `height: 100%` 配合父容器。
:::
