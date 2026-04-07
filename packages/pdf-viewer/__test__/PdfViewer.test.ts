import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PdfViewer from '../src/index.vue';

// Mock pdfjs-dist
const mockGetPage = vi.fn(() =>
  Promise.resolve({
    getViewport: vi.fn(() => ({ width: 612, height: 792, scale: 1 })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
    getTextContent: vi.fn(() => Promise.resolve({ items: [{ str: 'test text' }] })),
    getOperatorList: vi.fn(() => Promise.resolve({ fnArray: [], argsArray: [] })),
    cleanup: vi.fn(),
  }),
);

const mockPdfDocument = {
  numPages: 5,
  getPage: mockGetPage,
  destroy: vi.fn(),
};

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve(mockPdfDocument),
  })),
  GlobalWorkerOptions: { workerSrc: '' },
  version: '5.0.0',
  OPS: {},
}));

// Mock canvas getContext（jsdom 不支持 canvas）
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  canvas: { width: 0, height: 0 },
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

describe('PdfViewer 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染根元素', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      expect(wrapper.find('.aix-pdf-viewer').exists()).toBe(true);
      expect(wrapper.attributes('tabindex')).toBe('-1');
    });

    it('应包含 loading spinner 结构', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      // 组件应包含 loading 相关的 DOM 结构
      expect(wrapper.find('.aix-pdf-viewer__content').exists()).toBe(true);
    });

    it('默认应渲染单页模式视图', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      expect(wrapper.find('.aix-pdf-viewer__content').exists()).toBe(true);
      expect(wrapper.find('.aix-pdf-viewer__continuous').exists()).toBe(false);
    });
  });

  describe('Props 测试', () => {
    it('应接受字符串 source', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      expect(wrapper.find('.aix-pdf-viewer').exists()).toBe(true);
    });

    it('应接受 ArrayBuffer source', () => {
      const buffer = new ArrayBuffer(8);
      const wrapper = mount(PdfViewer, {
        props: { source: buffer },
      });

      expect(wrapper.find('.aix-pdf-viewer').exists()).toBe(true);
    });

    it('config 应控制工具栏显示', () => {
      const wrapper = mount(PdfViewer, {
        props: {
          source: 'https://example.com/test.pdf',
          config: { showToolbar: true },
        },
      });

      expect(wrapper.find('.aix-pdf-toolbar').exists()).toBe(true);
    });

    it('config showToolbar=false 应隐藏工具栏', () => {
      const wrapper = mount(PdfViewer, {
        props: {
          source: 'https://example.com/test.pdf',
          config: { showToolbar: false },
        },
      });

      expect(wrapper.find('.aix-pdf-toolbar').exists()).toBe(false);
    });

    it('scrollMode="continuous" 应渲染连续滚动模式', () => {
      const wrapper = mount(PdfViewer, {
        props: {
          source: 'https://example.com/test.pdf',
          config: { scrollMode: 'continuous' },
        },
      });

      expect(wrapper.find('.aix-pdf-viewer__continuous').exists()).toBe(true);
      expect(wrapper.find('.aix-pdf-viewer__content').exists()).toBe(false);
    });
  });

  describe('Expose 方法测试', () => {
    it('应暴露 loading/currentPage/totalPages/scale 状态', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      const vm = wrapper.vm as InstanceType<typeof PdfViewer>;
      expect(vm.loading).toBeDefined();
      expect(vm.currentPage).toBeDefined();
      expect(vm.totalPages).toBeDefined();
      expect(vm.scale).toBeDefined();
    });

    it('应暴露页面控制方法', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      const vm = wrapper.vm as InstanceType<typeof PdfViewer>;
      expect(typeof vm.gotoPage).toBe('function');
      expect(typeof vm.nextPage).toBe('function');
      expect(typeof vm.prevPage).toBe('function');
    });

    it('应暴露缩放控制方法', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      const vm = wrapper.vm as InstanceType<typeof PdfViewer>;
      expect(typeof vm.setScale).toBe('function');
      expect(typeof vm.zoomIn).toBe('function');
      expect(typeof vm.zoomOut).toBe('function');
      expect(typeof vm.fitToWidth).toBe('function');
      expect(typeof vm.fitToPage).toBe('function');
    });

    it('应暴露选择相关方法', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      const vm = wrapper.vm as InstanceType<typeof PdfViewer>;
      expect(typeof vm.getSelectedText).toBe('function');
      expect(typeof vm.getSelectedImages).toBe('function');
      expect(typeof vm.clearSelection).toBe('function');
    });

    it('应暴露搜索相关方法', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      const vm = wrapper.vm as InstanceType<typeof PdfViewer>;
      expect(typeof vm.openSearch).toBe('function');
      expect(typeof vm.closeSearch).toBe('function');
      expect(typeof vm.search).toBe('function');
    });

    it('应暴露生命周期方法', () => {
      const wrapper = mount(PdfViewer, {
        props: { source: 'https://example.com/test.pdf' },
      });

      const vm = wrapper.vm as InstanceType<typeof PdfViewer>;
      expect(typeof vm.reload).toBe('function');
      expect(typeof vm.destroy).toBe('function');
    });
  });
});
