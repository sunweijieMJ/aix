<template>
  <div class="demo-page">
    <h2>PdfViewer PDF 查看器</h2>
    <p class="description">
      基于 @aix/pdf-viewer 的 PDF 预览组件，支持文本选择、图片提取、缩略图等
    </p>

    <div class="demo-group">
      <h3>加载 PDF</h3>
      <div class="demo-row">
        <input
          v-model="pdfUrl"
          class="url-input"
          placeholder="输入 PDF URL..."
        />
        <button class="action-btn" @click="loadPdf">加载</button>
      </div>
    </div>

    <div class="demo-group">
      <h3>PDF 预览</h3>
      <div v-if="source" class="pdf-container">
        <div class="pdf-toolbar">
          <button class="tool-btn" @click="pdfRef?.prevPage()">上一页</button>
          <span class="page-info"> {{ currentPage }} / {{ totalPages }} </span>
          <button class="tool-btn" @click="pdfRef?.nextPage()">下一页</button>
          <span class="divider" />
          <button class="tool-btn" @click="pdfRef?.zoomOut()">缩小</button>
          <span class="scale-info">{{ Math.round(scale * 100) }}%</span>
          <button class="tool-btn" @click="pdfRef?.zoomIn()">放大</button>
          <span class="divider" />
          <button class="tool-btn" @click="pdfRef?.fitToWidth()">
            适应宽度
          </button>
          <button class="tool-btn" @click="pdfRef?.fitToPage()">
            适应页面
          </button>
        </div>
        <PdfViewer
          ref="pdfRef"
          :source="source"
          :config="{ scrollMode: 'continuous', enableTextLayer: true }"
          @ready="totalPages = $event"
          @page-change="onPageChange"
          @scale-change="scale = $event"
        />
      </div>
      <div v-else class="empty-state">
        <p>请输入 PDF URL 并点击"加载"按钮</p>
        <p class="tip">提示: 可以使用任意在线 PDF 链接进行测试</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PdfViewer } from '@aix/pdf-viewer';
import type { PdfViewerExpose } from '@aix/pdf-viewer';
import { ref } from 'vue';

const pdfUrl = ref('');
const source = ref('');
const pdfRef = ref<PdfViewerExpose>();
const currentPage = ref(1);
const totalPages = ref(0);
const scale = ref(1);

const loadPdf = () => {
  if (pdfUrl.value) {
    source.value = pdfUrl.value;
  }
};

const onPageChange = (page: number, total: number) => {
  currentPage.value = page;
  totalPages.value = total;
};
</script>

<style scoped>
.url-input {
  flex: 1;
  padding: 8px 12px;
  transition: border-color 0.3s;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  outline: none;
  font-size: 14px;
}

.url-input:focus {
  border-color: #667eea;
}

.action-btn {
  padding: 8px 20px;
  transition: background 0.3s;
  border: none;
  border-radius: 6px;
  background: #667eea;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.action-btn:hover {
  background: #5a6fd6;
}

.pdf-container {
  overflow: hidden;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
}

.pdf-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
  gap: 8px;
}

.tool-btn {
  padding: 4px 12px;
  transition: all 0.3s;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  font-size: 13px;
  cursor: pointer;
}

.tool-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.page-info,
.scale-info {
  min-width: 60px;
  color: #666;
  font-size: 13px;
  text-align: center;
}

.divider {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: #d9d9d9;
}

.empty-state {
  padding: 60px 20px;
  border-radius: 8px;
  background: #fafafa;
  color: #999;
  text-align: center;
}

.empty-state .tip {
  margin-top: 8px;
  font-size: 13px;
}
</style>
