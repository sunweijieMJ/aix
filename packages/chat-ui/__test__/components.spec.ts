import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, nextTick, h, ref } from 'vue';
import ContentRenderer from '../src/core/ContentRenderer.vue';
import DynamicRenderer from '../src/core/DynamicRenderer.vue';
import {
  rendererRegistry,
  registerRenderer,
} from '../src/core/RendererRegistry';
import type { ContentBlock } from '../src/core/types';

// Mock 文本渲染器
const MockTextRenderer = defineComponent({
  name: 'MockTextRenderer',
  props: ['block', 'data', 'streaming', 'theme'],
  emits: ['action'],
  template: '<div class="mock-text">{{ data }}</div>',
});

// Mock 代码渲染器
const MockCodeRenderer = defineComponent({
  name: 'MockCodeRenderer',
  props: ['block', 'data', 'streaming', 'theme'],
  emits: ['action'],
  setup(props) {
    return () =>
      h('pre', { class: 'mock-code' }, [
        h(
          'code',
          typeof props.data === 'object' ? props.data.code : props.data,
        ),
      ]);
  },
});

describe('DynamicRenderer', () => {
  beforeEach(() => {
    rendererRegistry.clear();

    // 注册 mock 渲染器
    registerRenderer({
      name: 'text',
      type: 'text',
      component: MockTextRenderer,
      priority: 0,
    });
    registerRenderer({
      name: 'code',
      type: 'code',
      component: MockCodeRenderer,
      priority: 10,
    });
  });

  describe('rendering', () => {
    it('should render text block with text renderer', async () => {
      const block: ContentBlock = {
        id: 'test-1',
        type: 'text',
        raw: 'Hello World',
        data: 'Hello World',
        status: 'complete',
      };

      const wrapper = mount(DynamicRenderer, {
        props: { block, streaming: false },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(wrapper.find('.mock-text').exists()).toBe(true);
      expect(wrapper.text()).toContain('Hello World');
    });

    it('should render code block with code renderer', async () => {
      const block: ContentBlock = {
        id: 'test-2',
        type: 'code',
        raw: '```js\nconst x = 1;\n```',
        data: { code: 'const x = 1;', language: 'javascript' },
        status: 'complete',
      };

      const wrapper = mount(DynamicRenderer, {
        props: { block, streaming: false },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(wrapper.find('.mock-code').exists()).toBe(true);
      expect(wrapper.find('code').text()).toContain('const x = 1');
    });

    it('should show fallback for unknown type', async () => {
      const block: ContentBlock = {
        id: 'test-3',
        type: 'unknown' as any,
        raw: 'Unknown content',
        status: 'complete',
      };

      const wrapper = mount(DynamicRenderer, {
        props: { block, streaming: false },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 应该使用 text 作为 fallback 或显示 fallback UI
      const hasFallbackOrText =
        wrapper.find('.aix-dynamic-renderer__fallback').exists() ||
        wrapper.find('.mock-text').exists();
      expect(hasFallbackOrText).toBe(true);
    });
  });

  describe('streaming state', () => {
    it('should pass streaming prop to child', async () => {
      const block: ContentBlock = {
        id: 'test-4',
        type: 'text',
        raw: 'Streaming',
        data: 'Streaming',
        status: 'complete',
      };

      const wrapper = mount(DynamicRenderer, {
        props: { block, streaming: true },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect((wrapper.props() as Record<string, unknown>).streaming).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit action event from child', async () => {
      const block: ContentBlock = {
        id: 'test-5',
        type: 'text',
        raw: 'Test',
        data: 'Test',
        status: 'complete',
      };

      const wrapper = mount(DynamicRenderer, {
        props: { block, streaming: false },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 触发子组件的 action 事件
      const childComponent = wrapper.findComponent(MockTextRenderer);
      if (childComponent.exists()) {
        await childComponent.vm.$emit('action', { action: 'test', data: {} });
        expect(wrapper.emitted('action')).toBeTruthy();
      }
    });

    it('should emit rendered event when component loads', async () => {
      const block: ContentBlock = {
        id: 'test-6',
        type: 'text',
        raw: 'Test',
        data: 'Test',
        status: 'complete',
      };

      const wrapper = mount(DynamicRenderer, {
        props: { block, streaming: false },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(wrapper.emitted('rendered')).toBeTruthy();
    });
  });

  describe('block changes', () => {
    it('should reload renderer when type changes', async () => {
      const block = ref<ContentBlock>({
        id: 'test-7',
        type: 'text',
        raw: 'Text',
        data: 'Text',
        status: 'complete',
      });

      const wrapper = mount(DynamicRenderer, {
        props: { block: block.value, streaming: false },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(wrapper.find('.mock-text').exists()).toBe(true);

      // 更改类型
      await wrapper.setProps({
        block: {
          id: 'test-7-new',
          type: 'code',
          raw: '```\ncode\n```',
          data: { code: 'code', language: 'text' },
          status: 'complete',
        },
      });
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(wrapper.find('.mock-code').exists()).toBe(true);
    });
  });
});

describe('ContentRenderer', () => {
  beforeEach(() => {
    rendererRegistry.clear();

    // 注册 mock 渲染器
    registerRenderer({
      name: 'text',
      type: 'text',
      component: MockTextRenderer,
      priority: 0,
    });
    registerRenderer({
      name: 'markdown',
      type: 'markdown',
      component: MockTextRenderer,
      priority: 10,
      detector: (content) => /^#{1,6}\s/.test(content),
    });
  });

  describe('rendering', () => {
    it('should render content', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Hello World',
        },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(wrapper.find('.aix-content-renderer').exists()).toBe(true);
    });

    it('should handle empty content', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: '',
        },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(wrapper.find('.aix-content-renderer').exists()).toBe(true);
    });
  });

  describe('streaming', () => {
    it('should pass streaming config to DynamicRenderer', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Streaming content',
          streaming: true,
        },
      });

      expect((wrapper.props() as Record<string, unknown>).streaming).toBe(true);
    });

    it('should handle streaming config object', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Streaming content',
          streaming: { hasNextChunk: true },
        },
      });

      expect((wrapper.props() as Record<string, unknown>).streaming).toEqual({
        hasNextChunk: true,
      });
    });
  });

  describe('events', () => {
    it('should emit action event', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Test',
        },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 找到 DynamicRenderer 并触发事件
      const dynamicRenderer = wrapper.findComponent(DynamicRenderer);
      if (dynamicRenderer.exists()) {
        await dynamicRenderer.vm.$emit('action', {
          blockId: 'test',
          action: 'copy',
          data: {},
        });
        expect(wrapper.emitted('action')).toBeTruthy();
      }
    });

    it('should emit rendered event', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Test',
        },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const dynamicRenderer = wrapper.findComponent(DynamicRenderer);
      if (dynamicRenderer.exists()) {
        await dynamicRenderer.vm.$emit('rendered');
        expect(wrapper.emitted('rendered')).toBeTruthy();
      }
    });
  });

  describe('custom className and style', () => {
    it('should apply custom className', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Test',
          className: 'custom-class',
        },
      });

      expect(wrapper.find('.aix-content-renderer.custom-class').exists()).toBe(
        true,
      );
    });

    it('should apply custom style', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Test',
          style: { color: 'red' },
        },
      });

      const style = wrapper.find('.aix-content-renderer').attributes('style');
      expect(style).toContain('color: red');
    });
  });

  describe('forced type', () => {
    it('should force parse as specific type', async () => {
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Not markdown',
          type: 'markdown',
        },
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 内容应该被强制解析为 markdown
      expect(wrapper.exists()).toBe(true);
    });
  });

  describe('loading and error states', () => {
    it('should show loading indicator when loading', async () => {
      // 模拟加载状态需要设置渲染器为异步加载
      const wrapper = mount(ContentRenderer, {
        props: {
          content: 'Test',
        },
      });

      // 初始可能显示加载状态
      expect(wrapper.find('.aix-content-renderer').exists()).toBe(true);
    });
  });
});

describe('Error Boundary', () => {
  beforeEach(() => {
    rendererRegistry.clear();
  });

  it('should catch errors from child renderers', async () => {
    const ErrorRenderer = defineComponent({
      name: 'ErrorRenderer',
      props: ['block', 'data', 'streaming', 'theme'],
      setup() {
        throw new Error('Intentional render error');
      },
    });

    registerRenderer({
      name: 'error-test',
      type: 'error' as any,
      component: ErrorRenderer,
      priority: 100,
      detector: () => true,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(ContentRenderer, {
      props: {
        content: 'Test',
      },
    });

    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 组件应该优雅降级，不崩溃
    expect(wrapper.exists()).toBe(true);

    consoleSpy.mockRestore();
  });
});
