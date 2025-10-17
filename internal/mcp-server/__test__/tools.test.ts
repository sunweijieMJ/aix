import { beforeEach, describe, expect, it } from 'vitest';
import { createTools } from '../src/mcp-tools/index';
import type {
  ComponentIndex,
  ComponentInfo,
  SearchResult,
} from '../src/types/index';

describe('MCP Tools', () => {
  let tools: ReturnType<typeof createTools>;
  let mockIndex: ComponentIndex;

  beforeEach(() => {
    mockIndex = {
      components: [
        {
          name: 'TestComponent',
          packageName: '@aix/test-component',
          version: '1.0.0',
          description: '测试组件',
          category: '测试',
          tags: ['test', 'demo'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/test/path',
          dependencies: ['vue'],
          peerDependencies: ['vue'],
          props: [
            {
              name: 'title',
              type: 'string',
              required: true,
              description: '标题',
            },
          ],
          examples: [
            {
              title: '基础示例',
              description: '基础使用示例',
              code: '<TestComponent title="Hello" />',
              language: 'tsx',
            },
          ],
        },
      ],
      categories: ['测试'],
      tags: ['test', 'demo'],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    tools = createTools(mockIndex);
  });

  describe('ListComponentsTool', () => {
    it('should list all components', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      expect(tool).toBeDefined();

      const result = await tool!.execute({});
      expect(result).toHaveLength(1);
      expect((result as ComponentInfo[])?.[0]?.name).toBe('TestComponent');
    });

    it('should filter by category', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      const result = await tool!.execute({ category: '测试' });
      expect(result).toHaveLength(1);

      const noResult = await tool!.execute({ category: '不存在' });
      expect(noResult).toHaveLength(0);
    });
  });

  describe('GetComponentInfoTool', () => {
    it('should get component info by name', async () => {
      const tool = tools.find((t) => t.name === 'get-component-info');
      expect(tool).toBeDefined();

      const result = await tool!.execute({ name: 'TestComponent' });
      expect(result).toBeDefined();
      expect((result as ComponentInfo)?.name).toBe('TestComponent');
    });

    it('should return null for non-existent component', async () => {
      const tool = tools.find((t) => t.name === 'get-component-info');
      const result = await tool!.execute({ name: 'NonExistent' });
      expect(result).toBeNull();
    });
  });

  describe('SearchComponentsTool', () => {
    it('should search components by query', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      expect(tool).toBeDefined();

      const result = await tool!.execute({ query: 'TestComponent' });
      expect(result).toHaveLength(1);
      expect((result as SearchResult[])?.[0]?.component?.name).toBe(
        'TestComponent',
      );
      expect((result as SearchResult[])?.[0]?.score).toBeGreaterThan(0);
    });

    it('should limit search results', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: 'test', limit: 0 });
      expect(result).toHaveLength(0);
    });
  });
});
