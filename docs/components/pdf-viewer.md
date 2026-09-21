---
title: PdfViewer PDF 预览器
outline: deep
---

<script setup>
import { ref } from 'vue'
import { PdfViewer } from '@aix/pdf-viewer'

// 演示用的公开 PDF：pdf.js 官方示例文档（14 页）
const PDF = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf'

const viewerRef = ref()
const page = ref(1)
const total = ref(0)
const selectedText = ref('')
const pickedImages = ref(0)
const menuInfo = ref('')

const thumbRef = ref()
const thumbnails = ref([])
const thumbLoading = ref(false)

async function makeThumbnails() {
  if (!thumbRef.value) return
  thumbLoading.value = true
  try {
    thumbnails.value = await thumbRef.value.generateAllThumbnails(120)
  } finally {
    thumbLoading.value = false
  }
}
</script>

<style>
.pdf-demo {
  display: block;
  padding: 0;
}

.pdf-demo__frame {
  height: 420px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}

.pdf-demo__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
  font-size: 13px;
}

.pdf-demo__thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin-top: 12px;
}

.pdf-demo__thumbs img {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
}

.pdf-demo__toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 13px;
}
</style>

# PdfViewer PDF 预览器

基于 [pdf.js](https://mozilla.github.io/pdf.js/) 的 PDF 预览组件：连续滚动翻页、缩放、全文搜索、
文字选择与框选取图，工具栏可替换。

## 何时使用

- 在业务页面里内嵌 PDF 预览，不想把用户甩到浏览器自带阅读器
- 需要从 PDF 里取内容：复制选中文字、框选区域导出图片、生成页面缩略图
- 需要自定义工具栏，或用右键菜单接业务动作

只是让用户下载 PDF，给个链接即可。要预览 Word / Excel 等格式本组件不支持——它只认 PDF。

## 安装

```bash
pnpm add @aix/pdf-viewer
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/pdf-viewer/style';
import '@aix/theme/style';
```

## 代码演示

本节的活演示用 [pdf.js 官方示例文档](https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf)（14 页）。
渲染依赖网络：PDF 本身，以及 pdf.js 的 worker（默认取 jsDelivr CDN）都要能访问。
内网部署把 worker 换成自托管副本即可：`:config="{ workerSrc: '/pdfjs/pdf.worker.min.mjs' }"`。
pdf.js 在一个页面里只初始化一次，以首个渲染的 PdfViewer 传入的值为准。

### 基础用法

传入 PDF 地址即可预览，内置工具栏提供翻页、跳页、缩放与适应页面。外层容器必须有确定高度。

<ClientOnly>
<div class="demo-block pdf-demo">
  <div class="pdf-demo__frame">
    <PdfViewer :source="PDF" />
  </div>
</div>
</ClientOnly>

```vue
<template>
  <div style="height: 420px">
    <PdfViewer :source="pdfUrl" />
  </div>
</template>

<script setup lang="ts">
import { PdfViewer } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';
</script>
```

### 使用 ref 控制

实例上的翻页、缩放、适应方法都是异步的；页码与总页数既能从 `pageChange` / `ready` 事件拿，
也能直接读实例上的 `currentPage` / `totalPages`。

<ClientOnly>
<div class="demo-block pdf-demo">
  <div class="pdf-demo__frame">
    <PdfViewer
      ref="viewerRef"
      :source="PDF"
      :config="{ showToolbar: false }"
      @ready="total = $event"
      @page-change="page = $event"
    />
  </div>
  <div class="pdf-demo__bar">
    <button @click="viewerRef?.prevPage()">上一页</button>
    <span>{{ page }} / {{ total }}</span>
    <button @click="viewerRef?.nextPage()">下一页</button>
    <button @click="viewerRef?.zoomIn()">放大</button>
    <button @click="viewerRef?.zoomOut()">缩小</button>
    <button @click="viewerRef?.fitToPage()">适应页面</button>
    <button @click="viewerRef?.gotoPage(5)">跳到第 5 页</button>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <PdfViewer
    ref="pdfRef"
    :source="pdfUrl"
    :config="{ showToolbar: false }"
    @ready="totalPages = $event"
    @page-change="currentPage = $event"
  />
  <button @click="pdfRef?.prevPage()">上一页</button>
  <span>{{ currentPage }} / {{ totalPages }}</span>
  <button @click="pdfRef?.nextPage()">下一页</button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PdfViewer, type PdfViewerExpose } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfRef = ref<PdfViewerExpose>();
const pdfUrl = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';
const currentPage = ref(1);
const totalPages = ref(0);
</script>
```

### 文字选择

文字层默认开启（`config.enableTextLayer`），鼠标划选正文就会抛出 `textSelect`。

<ClientOnly>
<div class="demo-block pdf-demo">
  <div class="pdf-demo__frame">
    <PdfViewer :source="PDF" :config="{ enableTextLayer: true }" @text-select="selectedText = $event" />
  </div>
  <div class="pdf-demo__bar">选中的文字：{{ selectedText || '（用鼠标在上面划一段试试）' }}</div>
</div>
</ClientOnly>

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

开启图片层后，页面里的图片区域可 hover、点选，`multiSelect` 下按住 Ctrl 多选。
选中的图片可以用实例方法 `extractImageAsBase64` 导出。示例文档第 3、5 页有插图。

<ClientOnly>
<div class="demo-block pdf-demo">
  <div class="pdf-demo__frame">
    <PdfViewer
      :source="PDF"
      :config="{ enableImageLayer: true }"
      :image-layer-config="{ multiSelect: true }"
      @image-select="pickedImages = $event.length"
    />
  </div>
  <div class="pdf-demo__bar">已选中 {{ pickedImages }} 张图片</div>
</div>
</ClientOnly>

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

`generateAllThumbnails(width)` 一次渲染全部页面并返回 Data URL 列表，页数多时开销不小，
按需触发比在 `ready` 里直接跑更稳妥；单页用 `generateThumbnail(page, width)`。

<ClientOnly>
<div class="demo-block pdf-demo">
  <div class="pdf-demo__frame">
    <PdfViewer ref="thumbRef" :source="PDF" />
  </div>
  <div class="pdf-demo__bar">
    <button :disabled="thumbLoading" @click="makeThumbnails">
      {{ thumbLoading ? '生成中…' : '生成全部缩略图' }}
    </button>
    <span v-if="thumbnails.length">共 {{ thumbnails.length }} 页，点缩略图跳页</span>
  </div>
  <div v-if="thumbnails.length" class="pdf-demo__thumbs">
    <img
      v-for="t in thumbnails"
      :key="t.pageNumber"
      :src="t.dataUrl"
      :alt="`第 ${t.pageNumber} 页`"
      :width="t.width / 2"
      @click="thumbRef?.gotoPage(t.pageNumber)"
    />
  </div>
</div>
</ClientOnly>

```vue
<template>
  <div class="pdf-with-thumbnails">
    <div class="thumbnails">
      <div
        v-for="thumb in thumbnails"
        :key="thumb.pageNumber"
        class="thumbnail"
        @click="pdfRef?.gotoPage(thumb.pageNumber)"
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

右键菜单按选区类型切换菜单项：选中文字用 `textMenuItems`，选中图片用 `imageMenuItems`，
两者都有用 `mixedMenuItems`，空白处用 `emptyMenuItems`（默认为空，即空白处不弹菜单）。

点击菜单项抛 `contextMenu` 事件，两个参数：选区上下文（类型、选中文字、选中图片、页码、鼠标位置）
与被点击的菜单项。组件只负责弹出与关闭菜单，**具体动作要业务侧按 `item.id` 自己实现**——
内置的「复制」也一样不会自动执行。

<ClientOnly>
<div class="demo-block pdf-demo">
  <div class="pdf-demo__frame">
    <PdfViewer
      :source="PDF"
      :context-menu-config="{
        enabled: true,
        textMenuItems: [
          { id: 'copy', label: '复制' },
          { id: 'translate', label: '翻译这段' },
          { id: 'note', label: '记笔记', divider: true },
        ],
      }"
      @context-menu="(ctx, item) => (menuInfo = `${item.label} / ${ctx.type} / 第 ${ctx.pageNumber} 页 / 「${ctx.selectedText.slice(0, 20)}」`)"
    />
  </div>
  <div class="pdf-demo__bar">最近一次菜单点击：{{ menuInfo || '（先划选一段文字，再点右键）' }}</div>
</div>
</ClientOnly>

```vue
<template>
  <PdfViewer
    :source="pdfUrl"
    :context-menu-config="{
      enabled: true,
      textMenuItems: [
        { id: 'copy', label: '复制' },
        { id: 'translate', label: '翻译这段' },
      ],
    }"
    @context-menu="onContextMenu"
  />
</template>

<script setup lang="ts">
import { PdfViewer, type ContextMenuContext, type ContextMenuItem } from '@aix/pdf-viewer';
import '@aix/pdf-viewer/style';

const pdfUrl = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

function onContextMenu(context: ContextMenuContext, item: ContextMenuItem) {
  // context.type: 'text' | 'image' | 'mixed' | 'empty'
  if (item.id === 'copy') navigator.clipboard.writeText(context.selectedText);
}
</script>
```

### 自定义工具栏

`toolbar` 插槽整体替换内置工具栏，作用域是扁平的一组状态与方法（`currentPage` / `totalPages` /
`scale` 与 `gotoPage` / `prevPage` / `nextPage` / `zoomIn` / `zoomOut` / `fitToPage`），没有 `actions` 这层包装。

<ClientOnly>
<div class="demo-block pdf-demo">
  <div class="pdf-demo__frame">
    <PdfViewer :source="PDF">
      <template #toolbar="{ currentPage, totalPages, scale, prevPage, nextPage, zoomIn, zoomOut, fitToPage }">
        <div class="pdf-demo__toolbar">
          <button @click="prevPage()">←</button>
          <span>{{ currentPage }} / {{ totalPages }}</span>
          <button @click="nextPage()">→</button>
          <span>{{ Math.round(scale * 100) }}%</span>
          <button @click="zoomOut()">-</button>
          <button @click="zoomIn()">+</button>
          <button @click="fitToPage()">适应页面</button>
        </div>
      </template>
    </PdfViewer>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <PdfViewer :source="pdfUrl">
    <template #toolbar="{ currentPage, totalPages, scale, prevPage, nextPage, zoomIn, zoomOut }">
      <div class="custom-toolbar">
        <button @click="prevPage()">上一页</button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button @click="nextPage()">下一页</button>
        <span>缩放: {{ Math.round(scale * 100) }}%</span>
        <button @click="zoomIn()">+</button>
        <button @click="zoomOut()">-</button>
      </div>
    </template>
  </PdfViewer>
</template>
```

::: tip 提示
PDF 预览需要一定高度的容器，建议设置容器高度或使用 `height: 100%` 配合父容器。
:::

## 主题变量定制

组件的配色收敛在 12 个 `--aix-pdf-*` 变量上，每个都回退到 `@aix/theme` 的语义 token，不覆盖任何东西时跟随主题明暗切换。

| 变量 | 回退到 | 用途 |
|------|--------|------|
| `--aix-pdf-bg` | `--aix-colorBgLayout` | 阅读区背景 |
| `--aix-pdf-border` | `--aix-colorBorder` | 页面与分隔线边框 |
| `--aix-pdf-text` | `--aix-colorText` | 主文字（页码、工具栏文案） |
| `--aix-pdf-text-secondary` | `--aix-colorTextSecondary` | 次要文字 |
| `--aix-pdf-primary` | `--aix-colorPrimary` | 主色：选中框、激活态 |
| `--aix-pdf-primary-light` | `--aix-colorPrimaryBg` | 主色浅底：搜索命中高亮 |
| `--aix-pdf-spinner-color` | `--aix-colorPrimary` | 加载指示器 |
| `--aix-pdf-toolbar-bg` | `--aix-colorBgContainer` | 工具栏背景 |
| `--aix-pdf-toolbar-border` | `--aix-colorBorderSecondary` | 工具栏边框 |
| `--aix-pdf-menu-bg` | `--aix-colorBgElevated` | 右键菜单背景 |
| `--aix-pdf-menu-hover` | `--aix-controlItemBgHover` | 右键菜单悬停底色 |
| `--aix-pdf-menu-shadow` | `--aix-shadowMD` | 右键菜单阴影 |

单独换色时优先指向另一个语义 token，不要写死色值：

```css
.my-viewer {
  --aix-pdf-primary: var(--aix-colorInfo);
  --aix-pdf-bg: var(--aix-colorBgContainer);
}
```

## 多语言

组件自己渲染的文案共 15 条，都在工具栏、搜索栏与右键菜单里：

| key | 中文 | English |
|-----|------|---------|
| `prev` / `next` | 上一页 / 下一页 | Previous / Next |
| `zoomIn` / `zoomOut` / `fitPage` | 放大 / 缩小 / 适应页面 | Zoom in / Zoom out / Fit to page |
| `searchPlaceholder` | 搜索文档... | Search document... |
| `prevMatch` / `nextMatch` | 上一个 (Shift+Enter) / 下一个 (Enter) | Previous (Shift+Enter) / Next (Enter) |
| `noResults` | 无结果 | No results |
| `closeSearch` / `clearSearch` | 关闭 (Esc) / 清除 | Close (Esc) / Clear |
| `copy` | 复制 | Copy |
| `copyImage` / `saveImage` | 复制图片 / 保存图片 | Copy image / Save image |

默认跟随 `@aix/hooks` 的全局语言，切片名是 `pdf-viewer`：

```ts
import { createLocale } from '@aix/hooks';

createLocale('en-US');
createLocale('zh-CN', { messages: { 'pdf-viewer': { copy: '拷贝' } } });
```

语言包也可以单独导入：`pdfViewerLocale` / `pdfViewerZhCN` / `pdfViewerEnUS`。

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

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
| `contextMenu` | `context: ContextMenuContext, item: ContextMenuItem` | 点击右键菜单项时触发，返回选区上下文与被点击的菜单项。组件只负责弹出与关闭菜单，具体动作（复制、下载等）由业务侧按 `item.id` 实现。 |

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

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

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
  /**
   * pdf.js worker 地址，缺省取 jsDelivr CDN 上与 pdfjs-dist 同版本的 worker。
   * 内网部署可指向自托管副本。pdf.js 库在页面内只初始化一次，因此以首个渲染的
   * PdfViewer 传入的值为准，之后再改无效。
   */
  workerSrc?: string;
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
