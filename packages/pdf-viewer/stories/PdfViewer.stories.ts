import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import PdfViewer from '../src/index.vue';
import type { PdfImageInfo, ContextMenuContext } from '../src/types';

// 使用 Mozilla 的示例 PDF
const SAMPLE_PDF_URL =
  'https://file.zhihuishu.com/zhs_yufa_150820/competition/attachment/202512/fe024e2ec1034268a01cfa7ee440cd55.pdf';

const meta: Meta<typeof PdfViewer> = {
  title: 'Components/PdfViewer',
  component: PdfViewer,
  tags: ['autodocs'],
  argTypes: {
    source: {
      control: 'text',
      description: 'PDF 文件 URL 或 ArrayBuffer',
    },
    initialPage: {
      control: { type: 'number', min: 1 },
      description: '初始页码',
    },
    config: {
      control: 'object',
      description: 'PDF 预览器配置',
    },
  },
  parameters: {
    docs: {
      story: { inline: false, height: '600px' },
    },
  },
  decorators: [
    () => ({
      template:
        '<div style="width: 100%; height: 600px; overflow: hidden;"><story /></div>',
    }),
  ],
};

export default meta;
type Story = StoryObj<typeof PdfViewer>;

/**
 * 基础用法 - 显示 PDF 文件
 */
export const Basic: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    initialPage: 1,
  },
};

/**
 * 带工具栏 - 显示分页和缩放控制
 */
export const WithToolbar: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    config: {
      showToolbar: true,
    },
  },
};

/**
 * 启用图片层 - 支持图片选择
 */
export const WithImageLayer: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    config: {
      showToolbar: true,
      enableImageLayer: true,
    },
  },
  render: (args) => ({
    components: { PdfViewer },
    setup() {
      return { args };
    },
    template: `
      <PdfViewer v-bind="args" style="height: 100%;" />
    `,
  }),
};

/**
 * 自定义配置 - 固定缩放比例
 */
export const CustomScale: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    config: {
      showToolbar: true,
      fitToContainer: false,
      initialScale: 1.0,
    },
  },
};

/**
 * 事件监听 - 监听各种事件
 */
export const WithEvents: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    config: {
      showToolbar: true,
      enableImageLayer: true,
      enableContextMenu: true,
    },
  },
  render: (args) => ({
    components: { PdfViewer },
    setup() {
      const logs = ref<string[]>([]);

      const addLog = (message: string) => {
        logs.value.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
        if (logs.value.length > 10) logs.value.pop();
      };

      const handleReady = (totalPages: number) => {
        addLog(`PDF 加载完成，共 ${totalPages} 页`);
      };

      const handlePageChange = (page: number, total: number) => {
        addLog(`页面切换: ${page} / ${total}`);
      };

      const handleScaleChange = (scale: number) => {
        addLog(`缩放变化: ${Math.round(scale * 100)}%`);
      };

      const handleTextSelect = (text: string) => {
        if (text)
          addLog(
            `选中文字: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
          );
      };

      const handleImageClick = (image: PdfImageInfo) => {
        addLog(`点击图片: ${image.id}`);
      };

      const handleContextMenu = (context: ContextMenuContext) => {
        addLog(`右键菜单: 类型=${context.type}, 页码=${context.pageNumber}`);
      };

      return {
        args,
        logs,
        handleReady,
        handlePageChange,
        handleScaleChange,
        handleTextSelect,
        handleImageClick,
        handleContextMenu,
      };
    },
    template: `
      <div style="display: flex; height: 100%;">
        <PdfViewer
          v-bind="args"
          style="flex: 1;"
          @ready="handleReady"
          @page-change="handlePageChange"
          @scale-change="handleScaleChange"
          @text-select="handleTextSelect"
          @image-click="handleImageClick"
          @context-menu="handleContextMenu"
        />
        <div style="width: 280px; padding: 12px; background: #1a1a1a; color: #fff; font-family: monospace; font-size: 12px; overflow-y: auto;">
          <div style="color: #888; margin-bottom: 8px;">事件日志:</div>
          <div v-for="(log, index) in logs" :key="index" style="margin-bottom: 4px; color: #4ade80;">
            {{ log }}
          </div>
          <div v-if="!logs.length" style="color: #666;">暂无事件</div>
        </div>
      </div>
    `,
  }),
};

/**
 * 暴露方法 - 使用 ref 调用组件方法
 */
export const ExposedMethods: Story = {
  args: {
    source: SAMPLE_PDF_URL,
  },
  render: (args) => ({
    components: { PdfViewer },
    setup() {
      const pdfRef = ref<InstanceType<typeof PdfViewer> | null>(null);
      const thumbnails = ref<Array<{ pageNumber: number; dataUrl: string }>>(
        [],
      );
      const loading = ref(false);

      const generateThumbnails = async () => {
        if (!pdfRef.value) return;
        loading.value = true;
        try {
          thumbnails.value = await pdfRef.value.generateAllThumbnails(80);
        } catch (e) {
          console.error('生成缩略图失败:', e);
        } finally {
          loading.value = false;
        }
      };

      const gotoPage = (page: number) => {
        pdfRef.value?.gotoPage(page);
      };

      return {
        args,
        pdfRef,
        thumbnails,
        loading,
        generateThumbnails,
        gotoPage,
      };
    },
    template: `
      <div style="display: flex; height: 100%;">
        <!-- 缩略图侧边栏 -->
        <div style="width: 120px; background: #f5f5f5; border-right: 1px solid #e0e0e0; overflow-y: auto; padding: 8px;">
          <button
            @click="generateThumbnails"
            :disabled="loading"
            style="width: 100%; padding: 8px; margin-bottom: 8px; cursor: pointer;"
          >
            {{ loading ? '生成中...' : '生成缩略图' }}
          </button>
          <div
            v-for="thumb in thumbnails"
            :key="thumb.pageNumber"
            @click="gotoPage(thumb.pageNumber)"
            style="margin-bottom: 8px; cursor: pointer; border: 2px solid transparent; transition: border-color 0.2s;"
            @mouseenter="$event.target.style.borderColor = '#409eff'"
            @mouseleave="$event.target.style.borderColor = 'transparent'"
          >
            <img :src="thumb.dataUrl" style="width: 100%; display: block;" />
            <div style="text-align: center; font-size: 12px; color: #666;">第 {{ thumb.pageNumber }} 页</div>
          </div>
        </div>

        <!-- PDF 查看器 -->
        <PdfViewer
          ref="pdfRef"
          v-bind="args"
          style="flex: 1;"
          :config="{ showToolbar: true }"
        />
      </div>
    `,
  }),
};

/**
 * 文本搜索 - 支持 Ctrl+F 搜索文档内容
 */
export const TextSearch: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    config: {
      showToolbar: true,
      enableTextLayer: true,
    },
  },
  render: (args) => ({
    components: { PdfViewer },
    setup() {
      const pdfRef = ref<InstanceType<typeof PdfViewer> | null>(null);

      const openSearch = () => {
        pdfRef.value?.openSearch();
      };

      const searchKeyword = async (keyword: string) => {
        await pdfRef.value?.search(keyword);
      };

      return { args, pdfRef, openSearch, searchKeyword };
    },
    template: `
      <div style="display: flex; flex-direction: column; height: 100%;">
        <div style="padding: 8px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; display: flex; gap: 8px;">
          <button @click="openSearch" style="padding: 6px 12px; cursor: pointer;">
            打开搜索 (Ctrl+F)
          </button>
          <button @click="searchKeyword('function')" style="padding: 6px 12px; cursor: pointer;">
            搜索 "function"
          </button>
          <button @click="searchKeyword('trace')" style="padding: 6px 12px; cursor: pointer;">
            搜索 "trace"
          </button>
        </div>
        <PdfViewer
          ref="pdfRef"
          v-bind="args"
          style="flex: 1;"
        />
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story:
          '按 Ctrl+F (或 Cmd+F) 打开搜索栏，输入关键词搜索文档内容。支持上下导航和高亮显示。',
      },
    },
  },
};

/**
 * 连续滚动模式 - 一次显示所有页面
 */
export const ContinuousScroll: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    config: {
      showToolbar: true,
      scrollMode: 'continuous',
      pageGap: 16,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          '连续滚动模式下，所有页面垂直排列，可以像浏览网页一样滚动阅读。支持虚拟滚动优化性能。',
      },
    },
  },
};

/**
 * 连续滚动 + 缩略图导航
 */
export const ContinuousWithThumbnails: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    config: {
      showToolbar: true,
      scrollMode: 'continuous',
      pageGap: 20,
    },
  },
  render: (args) => ({
    components: { PdfViewer },
    setup() {
      const pdfRef = ref<InstanceType<typeof PdfViewer> | null>(null);
      const thumbnails = ref<Array<{ pageNumber: number; dataUrl: string }>>(
        [],
      );
      const currentPage = ref(1);

      const handleReady = async () => {
        if (!pdfRef.value) return;
        try {
          thumbnails.value = await pdfRef.value.generateAllThumbnails(60);
        } catch (e) {
          console.error('生成缩略图失败:', e);
        }
      };

      const handlePageChange = (page: number) => {
        currentPage.value = page;
      };

      const gotoPage = (page: number) => {
        pdfRef.value?.gotoPage(page);
      };

      return {
        args,
        pdfRef,
        thumbnails,
        currentPage,
        handleReady,
        handlePageChange,
        gotoPage,
      };
    },
    template: `
      <div style="display: flex; height: 100%;">
        <!-- 缩略图侧边栏 -->
        <div style="width: 100px; background: #2a2a2a; overflow-y: auto; padding: 8px;">
          <div
            v-for="thumb in thumbnails"
            :key="thumb.pageNumber"
            @click="gotoPage(thumb.pageNumber)"
            :style="{
              marginBottom: '8px',
              cursor: 'pointer',
              border: currentPage === thumb.pageNumber ? '2px solid #409eff' : '2px solid transparent',
              borderRadius: '4px',
              overflow: 'hidden',
              transition: 'border-color 0.2s',
            }"
          >
            <img :src="thumb.dataUrl" style="width: 100%; display: block;" />
            <div style="text-align: center; font-size: 11px; color: #999; padding: 4px 0;">
              {{ thumb.pageNumber }}
            </div>
          </div>
          <div v-if="!thumbnails.length" style="color: #666; font-size: 12px; text-align: center; padding: 20px 0;">
            加载中...
          </div>
        </div>

        <!-- PDF 查看器 -->
        <PdfViewer
          ref="pdfRef"
          v-bind="args"
          style="flex: 1;"
          @ready="handleReady"
          @page-change="handlePageChange"
        />
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: '连续滚动模式配合缩略图导航，点击缩略图可快速跳转到对应页面。',
      },
    },
  },
};

/**
 * 页码输入跳转 - 工具栏支持直接输入页码
 */
export const PageInput: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    initialPage: 5,
    config: {
      showToolbar: true,
    },
  },
  parameters: {
    docs: {
      description: {
        story: '工具栏中的页码支持直接输入，按 Enter 或失焦后跳转到指定页面。',
      },
    },
  },
};

/**
 * 完整功能演示 - 所有功能集成
 */
export const FullFeatures: Story = {
  args: {
    source: SAMPLE_PDF_URL,
    config: {
      showToolbar: true,
      enableTextLayer: true,
      enableImageLayer: true,
      enableContextMenu: true,
      scrollMode: 'single',
    },
  },
  render: (args) => ({
    components: { PdfViewer },
    setup() {
      const pdfRef = ref<InstanceType<typeof PdfViewer> | null>(null);
      const scrollMode = ref<'single' | 'continuous'>('single');
      const logs = ref<string[]>([]);

      const addLog = (message: string) => {
        logs.value.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
        if (logs.value.length > 8) logs.value.pop();
      };

      const toggleScrollMode = () => {
        scrollMode.value =
          scrollMode.value === 'single' ? 'continuous' : 'single';
        addLog(
          `切换到${scrollMode.value === 'single' ? '单页' : '连续滚动'}模式`,
        );
      };

      const handleReady = (totalPages: number) => {
        addLog(`加载完成，共 ${totalPages} 页`);
      };

      const handlePageChange = (page: number, total: number) => {
        addLog(`页面: ${page}/${total}`);
      };

      const handleTextSelect = (text: string) => {
        if (text) addLog(`选中: "${text.substring(0, 20)}..."`);
      };

      return {
        args,
        pdfRef,
        scrollMode,
        logs,
        toggleScrollMode,
        handleReady,
        handlePageChange,
        handleTextSelect,
      };
    },
    template: `
      <div style="display: flex; flex-direction: column; height: 100%;">
        <!-- 控制栏 -->
        <div style="padding: 8px 12px; background: #f0f0f0; border-bottom: 1px solid #ddd; display: flex; gap: 8px; align-items: center;">
          <button @click="toggleScrollMode" style="padding: 6px 12px; cursor: pointer;">
            {{ scrollMode === 'single' ? '切换到连续滚动' : '切换到单页模式' }}
          </button>
          <button @click="pdfRef?.openSearch()" style="padding: 6px 12px; cursor: pointer;">
            搜索 (Ctrl+F)
          </button>
          <span style="margin-left: auto; color: #666; font-size: 12px;">
            提示: 右键可打开菜单，支持选择文字和图片
          </span>
        </div>

        <div style="display: flex; flex: 1; min-height: 0;">
          <!-- PDF 查看器 -->
          <PdfViewer
            ref="pdfRef"
            :source="args.source"
            :config="{ ...args.config, scrollMode }"
            style="flex: 1;"
            @ready="handleReady"
            @page-change="handlePageChange"
            @text-select="handleTextSelect"
          />

          <!-- 日志面板 -->
          <div style="width: 200px; background: #1e1e1e; color: #d4d4d4; font-family: monospace; font-size: 11px; padding: 8px; overflow-y: auto;">
            <div style="color: #569cd6; margin-bottom: 8px;">// Event Log</div>
            <div v-for="(log, i) in logs" :key="i" style="margin-bottom: 4px; color: #9cdcfe;">
              {{ log }}
            </div>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story:
          '集成所有功能：工具栏、文字选择、图片选择、右键菜单、文本搜索、滚动模式切换。',
      },
    },
  },
};
