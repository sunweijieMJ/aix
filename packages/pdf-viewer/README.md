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

| 属性 | 类型 | 默认值 | 必填 | 描述 |
|------|------|--------|:----:|------|
| source | `string \| ArrayBuffer` | - | ✅ | PDF 文件 URL 或 ArrayBuffer |
| initialPage | `number` | `1` | ❌ | 初始页码 |
| config | `Partial<PdfViewerConfig>` | - | ❌ | 预览器配置 |
| imageLayerConfig | `Partial<ImageLayerConfig>` | - | ❌ | 图片层配置 |
| contextMenuConfig | `Partial<ContextMenuConfig>` | - | ❌ | 右键菜单配置 |

### PdfViewerConfig

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| initialScale | `number` | `1` | 初始缩放比例（fitToContainer 为 false 时使用） |
| fitToContainer | `boolean` | `true` | 是否自适应容器尺寸 |
| maxScale | `number` | `5` | 最大缩放比例 |
| minScale | `number` | `0.25` | 最小缩放比例 |
| fitPadding | `number` | `20` | 自适应时的内边距（像素） |
| showToolbar | `boolean` | `true` | 是否显示工具栏 |
| enableTextLayer | `boolean` | `true` | 是否启用文字层（支持文字选择） |
| enableImageLayer | `boolean` | `false` | 是否启用图片层（支持图片选择） |
| enableContextMenu | `boolean` | `true` | 是否启用右键菜单 |
| scrollMode | `'single' \| 'continuous'` | `'continuous'` | 滚动模式 |
| pageGap | `number` | `10` | 连续模式下页面间距（像素） |

### ImageLayerConfig

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| enableHover | `boolean` | `true` | 是否启用 hover 效果 |
| enableSelection | `boolean` | `true` | 是否启用选择功能 |
| multiSelect | `boolean` | `true` | 是否多选模式（按住 Ctrl 多选） |
| minImageSize | `number` | `50` | 最小图片尺寸（小于此尺寸的图片会被过滤） |
| maxPageRatio | `number` | `0.8` | 最大图片占页面比例（超过此比例视为背景） |

### Events

| 事件名 | 参数 | 描述 |
|--------|------|------|
| loaded | `totalPages: number` | PDF 加载完成 |
| error | `error: Error` | PDF 加载失败 |
| pageChange | `page: number` | 页码变化 |
| scaleChange | `scale: number` | 缩放比例变化 |
| textSelect | `text: string` | 文字选中 |
| imageSelect | `images: PdfImageInfo[]` | 图片选中 |
| contextMenu | `context: ContextMenuContext` | 右键菜单打开 |

### Expose

组件暴露以下方法和状态：

#### 状态

| 属性 | 类型 | 描述 |
|------|------|------|
| loading | `Ref<boolean>` | 加载状态 |
| currentPage | `Ref<number>` | 当前页码 |
| totalPages | `Ref<number>` | 总页数 |
| scale | `Ref<number>` | 当前缩放比例 |

#### 页面控制

| 方法 | 参数 | 返回值 | 描述 |
|------|------|--------|------|
| gotoPage | `page: number` | `Promise<void>` | 跳转到指定页 |
| nextPage | - | `Promise<void>` | 下一页 |
| prevPage | - | `Promise<void>` | 上一页 |

#### 缩放控制

| 方法 | 参数 | 返回值 | 描述 |
|------|------|--------|------|
| setScale | `scale: number` | `Promise<void>` | 设置缩放比例 |
| zoomIn | `step?: number` | `Promise<void>` | 放大 |
| zoomOut | `step?: number` | `Promise<void>` | 缩小 |
| fitToWidth | - | `Promise<void>` | 适应宽度 |
| fitToPage | - | `Promise<void>` | 适应页面 |

#### 选择相关

| 方法 | 参数 | 返回值 | 描述 |
|------|------|--------|------|
| getSelectedText | - | `string` | 获取选中的文字 |
| getSelectedImages | - | `PdfImageInfo[]` | 获取选中的图片 |
| clearSelection | - | `void` | 清除选择 |

#### 缩略图

| 方法 | 参数 | 返回值 | 描述 |
|------|------|--------|------|
| generateThumbnail | `page: number, width?: number` | `Promise<ThumbnailInfo>` | 生成单页缩略图 |
| generateAllThumbnails | `width?: number` | `Promise<ThumbnailInfo[]>` | 生成所有页面缩略图 |

#### 图片提取

| 方法 | 参数 | 返回值 | 描述 |
|------|------|--------|------|
| extractImageAsBase64 | `image: PdfImageInfo` | `string` | 将图片区域提取为 Base64 |

#### 搜索

| 方法 | 参数 | 返回值 | 描述 |
|------|------|--------|------|
| openSearch | - | `void` | 打开搜索栏 |
| closeSearch | - | `void` | 关闭搜索栏 |
| search | `keyword: string` | `Promise<void>` | 执行搜索 |

#### 其他

| 方法 | 参数 | 返回值 | 描述 |
|------|------|--------|------|
| reload | - | `Promise<void>` | 重新加载 |
| destroy | - | `void` | 销毁实例 |

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
