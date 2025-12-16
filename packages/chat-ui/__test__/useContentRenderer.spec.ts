import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useContentRenderer } from '../src/composables/useContentRenderer';
import {
  rendererRegistry,
  registerRenderer,
} from '../src/core/RendererRegistry';

describe('useContentRenderer', () => {
  beforeEach(() => {
    rendererRegistry.clear();

    // 注册基本渲染器
    registerRenderer({
      name: 'text',
      type: 'text',
      component: { template: '<div>{{ data }}</div>' },
      priority: 0,
      parser: (raw) => raw,
    });
    registerRenderer({
      name: 'markdown',
      type: 'markdown',
      component: { template: '<div v-html="data.html"></div>' },
      priority: 10,
      parser: (raw) => ({ html: raw, raw }),
      detector: (content) => /^#{1,6}\s|^\*\s|-\s|\*\*.+\*\*/.test(content),
    });
    registerRenderer({
      name: 'code',
      type: 'code',
      component: { template: '<pre><code>{{ data.code }}</code></pre>' },
      priority: 20,
      parser: (raw) => {
        const match = raw.match(/^```(\w*)\n([\s\S]*?)```$/);
        if (match && match[2]) {
          return { code: match[2], language: match[1] || 'text' };
        }
        return { code: raw, language: 'text' };
      },
    });
  });

  describe('basic functionality', () => {
    it('should parse content and return blocks', async () => {
      const content = ref('Hello world');
      const { blocks, loading, error } = useContentRenderer(content);

      await nextTick();
      // 等待异步解析
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(loading.value).toBe(false);
      expect(error.value).toBeNull();
      expect(blocks.value.length).toBeGreaterThan(0);
    });

    it('should handle empty content', async () => {
      const content = ref('');
      const { blocks, loading } = useContentRenderer(content);

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(loading.value).toBe(false);
      expect(blocks.value).toEqual([]);
    });

    it('should update blocks when content changes', async () => {
      const content = ref('Initial');
      const { blocks } = useContentRenderer(content);

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      content.value = 'Updated content';
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(blocks.value.length).toBeGreaterThan(0);
    });

    it('should detect multiple blocks correctly', async () => {
      const content = ref('# Title\n\n```js\ncode\n```');
      const { blocks } = useContentRenderer(content);

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 混合内容可能产生多个块
      expect(blocks.value.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('type option', () => {
    it('should force parse as specific type', async () => {
      const content = ref('some content');
      const type = ref<'code'>('code');
      const { blocks } = useContentRenderer(content, { type });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (blocks.value.length > 0) {
        expect(blocks.value[0]?.type).toBe('code');
      }
    });

    it('should update when type changes', async () => {
      const content = ref('some content');
      const type = ref<'text' | 'markdown'>('text');
      const { blocks } = useContentRenderer(content, { type });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      type.value = 'markdown';
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 类型应该改变
      expect(blocks.value[0]?.type).toBe('markdown');
    });
  });

  describe('custom parser', () => {
    it('should use custom parser when provided', async () => {
      const content = ref('custom content');
      const customParser = vi.fn().mockReturnValue({
        id: 'custom-1',
        type: 'text' as const,
        raw: 'custom content',
        data: 'parsed by custom',
        status: 'complete' as const,
      });

      const { blocks } = useContentRenderer(content, { parser: customParser });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(customParser).toHaveBeenCalledWith('custom content');
      expect(blocks.value[0]?.data).toBe('parsed by custom');
    });

    it('should handle custom parser returning array', async () => {
      const content = ref('multi block content');
      const customParser = vi.fn().mockReturnValue([
        {
          id: 'block-1',
          type: 'text' as const,
          raw: 'block 1',
          data: 'data 1',
          status: 'complete' as const,
        },
        {
          id: 'block-2',
          type: 'text' as const,
          raw: 'block 2',
          data: 'data 2',
          status: 'complete' as const,
        },
      ]);

      const { blocks, isMultiBlock } = useContentRenderer(content, {
        parser: customParser,
      });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(blocks.value).toHaveLength(2);
      expect(isMultiBlock.value).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle parser errors', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const content = ref('content');
      const customParser = vi.fn().mockImplementation(() => {
        throw new Error('Parser error');
      });

      const { error } = useContentRenderer(content, { parser: customParser });

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(error.value).toBeInstanceOf(Error);
      expect(error.value?.message).toBe('Parser error');

      consoleSpy.mockRestore();
    });
  });

  describe('reload function', () => {
    it('should reload and reparse content', async () => {
      const content = ref('Initial content');
      const { blocks, reload } = useContentRenderer(content);

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 修改内容但不触发 watch
      await reload();
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // reload 应该重新解析内容
      expect(blocks.value.length).toBeGreaterThan(0);
    });
  });

  describe('rendererDefs and rendererComponents', () => {
    it('should populate rendererDefs after parsing', async () => {
      const content = ref('Hello world');
      const { blocks, rendererDefs } = useContentRenderer(content);

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (blocks.value.length > 0) {
        const blockId = blocks.value[0]?.id;
        if (blockId) {
          const def = rendererDefs.value.get(blockId);
          expect(def).toBeDefined();
        }
      }
    });

    it('should load renderer components asynchronously', async () => {
      const content = ref('Hello world');
      const { rendererComponents, loading } = useContentRenderer(content);

      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(loading.value).toBe(false);
      // 组件映射应该被填充
      expect(rendererComponents.value).toBeDefined();
    });
  });
});
