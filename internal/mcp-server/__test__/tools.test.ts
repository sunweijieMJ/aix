import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTools } from '../src/mcp-tools/index';
import type {
  ComponentExample,
  ComponentIndex,
  ComponentInfo,
  SearchResult,
} from '../src/types/index';

// Mock fs/promises for changelog reading
vi.mock('node:fs/promises');

describe('MCP Tools', () => {
  let tools: ReturnType<typeof createTools>;
  let mockIndex: ComponentIndex;
  let mockComponent: ComponentInfo;

  beforeEach(() => {
    vi.clearAllMocks();

    mockComponent = {
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
        {
          name: 'disabled',
          type: 'boolean',
          required: false,
          defaultValue: 'false',
          description: '是否禁用',
        },
      ],
      examples: [
        {
          title: '基础示例',
          description: '基础使用示例',
          code: '<TestComponent title="Hello" />',
          language: 'tsx',
        },
        {
          title: 'Vue 示例',
          description: 'Vue 模板示例',
          code: '<template><TestComponent title="Hello" /></template>',
          language: 'vue',
        },
      ],
    };

    mockIndex = {
      components: [
        mockComponent,
        {
          name: 'AnotherComponent',
          packageName: '@aix/another-component',
          version: '2.0.0',
          description: '另一个组件',
          category: '通用',
          tags: ['common', 'demo'],
          author: 'AIX Team',
          license: 'MIT',
          sourcePath: '/another/path',
          dependencies: ['vue', 'lodash'],
          peerDependencies: ['vue'],
          props: [],
          examples: [],
        },
      ],
      categories: ['测试', '通用'],
      tags: ['test', 'demo', 'common'],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    tools = createTools(mockIndex, '/test/data');
  });

  describe('ListComponentsTool', () => {
    it('应该列出所有组件', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      expect(tool).toBeDefined();

      const result = await tool!.execute({});
      expect(result).toHaveLength(2);
      expect((result as ComponentInfo[])?.[0]?.name).toBe('TestComponent');
    });

    it('应该按分类过滤组件', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      const result = await tool!.execute({ category: '测试' });
      expect(result).toHaveLength(1);
      expect((result as ComponentInfo[])?.[0]?.name).toBe('TestComponent');

      const noResult = await tool!.execute({ category: '不存在' });
      expect(noResult).toHaveLength(0);
    });

    it('应该按标签过滤组件', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      const result = await tool!.execute({ tag: 'test' });
      expect(result).toHaveLength(1);
      expect((result as ComponentInfo[])?.[0]?.name).toBe('TestComponent');
    });

    it('应该支持分类和标签同时过滤', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      const result = await tool!.execute({ category: '测试', tag: 'demo' });
      expect(result).toHaveLength(1);
    });
  });

  describe('GetComponentInfoTool', () => {
    it('应该通过名称获取组件信息', async () => {
      const tool = tools.find((t) => t.name === 'get-component-info');
      expect(tool).toBeDefined();

      const result = await tool!.execute({ name: 'TestComponent' });
      expect(result).toBeDefined();
      expect((result as ComponentInfo)?.name).toBe('TestComponent');
    });

    it('应该通过包名获取组件信息', async () => {
      const tool = tools.find((t) => t.name === 'get-component-info');
      const result = await tool!.execute({ name: '@aix/test-component' });
      expect(result).toBeDefined();
      expect((result as ComponentInfo)?.packageName).toBe(
        '@aix/test-component',
      );
    });

    it('应该对不存在的组件返回 null', async () => {
      const tool = tools.find((t) => t.name === 'get-component-info');
      const result = await tool!.execute({ name: 'NonExistent' });
      expect(result).toBeNull();
    });
  });

  describe('GetComponentPropsTool', () => {
    it('应该获取组件的 Props', async () => {
      const tool = tools.find((t) => t.name === 'get-component-props');
      expect(tool).toBeDefined();

      const result = await tool!.execute({ name: 'TestComponent' });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect((result as ComponentInfo['props'])?.length).toBe(2);
      expect((result as ComponentInfo['props'])?.[0]?.name).toBe('title');
      expect((result as ComponentInfo['props'])?.[0]?.type).toBe('string');
      expect((result as ComponentInfo['props'])?.[0]?.required).toBe(true);
    });

    it('应该对不存在的组件返回 null', async () => {
      const tool = tools.find((t) => t.name === 'get-component-props');
      const result = await tool!.execute({ name: 'NonExistent' });
      expect(result).toBeNull();
    });

    it('应该返回没有 Props 的组件的空数组', async () => {
      const tool = tools.find((t) => t.name === 'get-component-props');
      const result = await tool!.execute({ name: 'AnotherComponent' });
      expect(result).toEqual([]);
    });
  });

  describe('GetComponentExamplesTool', () => {
    it('应该获取组件的示例', async () => {
      const tool = tools.find((t) => t.name === 'get-component-examples');
      expect(tool).toBeDefined();

      const result = await tool!.execute({ name: 'TestComponent' });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect((result as ComponentExample[])?.length).toBe(2);
      expect((result as ComponentExample[])?.[0]?.title).toBe('基础示例');
    });

    it('应该按语言过滤示例', async () => {
      const tool = tools.find((t) => t.name === 'get-component-examples');
      const result = await tool!.execute({
        name: 'TestComponent',
        language: 'vue',
      });
      expect(result).toBeDefined();
      expect((result as ComponentExample[])?.length).toBe(1);
      expect((result as ComponentExample[])?.[0]?.language).toBe('vue');
    });

    it('应该对不存在的组件返回 null', async () => {
      const tool = tools.find((t) => t.name === 'get-component-examples');
      const result = await tool!.execute({ name: 'NonExistent' });
      expect(result).toBeNull();
    });

    it('应该返回没有示例的组件的空数组', async () => {
      const tool = tools.find((t) => t.name === 'get-component-examples');
      const result = await tool!.execute({ name: 'AnotherComponent' });
      expect(result).toEqual([]);
    });
  });

  describe('SearchComponentsTool', () => {
    it('应该通过关键词搜索组件', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      expect(tool).toBeDefined();

      const result = await tool!.execute({ query: 'TestComponent' });
      expect(result).toHaveLength(1);
      expect((result as SearchResult[])?.[0]?.component?.name).toBe(
        'TestComponent',
      );
      expect((result as SearchResult[])?.[0]?.score).toBeGreaterThan(0);
    });

    it('应该限制搜索结果数量', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: 'component', limit: 1 });
      expect((result as SearchResult[]).length).toBeLessThanOrEqual(1);
    });

    it('应该对空查询返回空数组', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: '' });
      expect(result).toHaveLength(0);
    });

    it('应该对 limit 为 0 返回空数组', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: 'test', limit: 0 });
      expect(result).toHaveLength(0);
    });

    it('应该返回匹配字段信息', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: 'TestComponent' });
      expect((result as SearchResult[])?.[0]?.matchedFields).toBeDefined();
    });
  });

  describe('GetComponentDependenciesTool', () => {
    it('应该获取组件依赖', async () => {
      const tool = tools.find((t) => t.name === 'get-component-dependencies');
      expect(tool).toBeDefined();

      const result = await tool!.execute({ name: 'TestComponent' });
      expect(result).toBeDefined();
      expect((result as any)?.dependencies).toContain('vue');
      expect((result as any)?.peerDependencies).toContain('vue');
    });

    it('应该对不存在的组件返回 null', async () => {
      const tool = tools.find((t) => t.name === 'get-component-dependencies');
      const result = await tool!.execute({ name: 'NonExistent' });
      expect(result).toBeNull();
    });

    it('应该返回完整的依赖信息', async () => {
      const tool = tools.find((t) => t.name === 'get-component-dependencies');
      const result = await tool!.execute({ name: 'AnotherComponent' });
      expect(result).toBeDefined();
      expect((result as any)?.dependencies).toEqual(['vue', 'lodash']);
      expect((result as any)?.peerDependencies).toEqual(['vue']);
    });
  });

  describe('GetCategoriesAndTagsTool', () => {
    it('应该获取所有分类和标签', async () => {
      const tool = tools.find((t) => t.name === 'get-categories-and-tags');
      expect(tool).toBeDefined();

      const result = await tool!.execute({});
      expect(result).toBeDefined();
      expect((result as any)?.categories).toContain('测试');
      expect((result as any)?.categories).toContain('通用');
      expect((result as any)?.tags).toContain('test');
      expect((result as any)?.tags).toContain('demo');
    });

    it('应该返回统计信息', async () => {
      const tool = tools.find((t) => t.name === 'get-categories-and-tags');
      const result = await tool!.execute({});
      expect((result as any)?.stats).toBeDefined();
      expect((result as any)?.stats?.totalComponents).toBe(2);
      expect((result as any)?.stats?.lastUpdated).toBeDefined();
    });
  });

  describe('GetComponentChangelogTool', () => {
    it('应该获取组件变更日志', async () => {
      const tool = tools.find((t) => t.name === 'get-component-changelog');
      expect(tool).toBeDefined();

      // Mock fs.readFile 返回 CHANGELOG 内容
      vi.mocked(fs.readFile).mockResolvedValue(`# Changelog

## 1.0.0 (2024-01-01)

### Features

- Initial release
- Added basic functionality

### Bug Fixes

- Fixed initial bugs
`);

      const result = await tool!.execute({ name: 'TestComponent' });
      expect(result).toBeDefined();
      expect((result as any)?.packageName).toBe('@aix/test-component');
      expect((result as any)?.currentVersion).toBe('1.0.0');
      expect((result as any)?.changelog).toBeDefined();
    });

    it('应该对不存在的组件返回 null', async () => {
      const tool = tools.find((t) => t.name === 'get-component-changelog');
      const result = await tool!.execute({ name: 'NonExistent' });
      expect(result).toBeNull();
    });

    it('应该处理没有 CHANGELOG 的组件', async () => {
      const tool = tools.find((t) => t.name === 'get-component-changelog');

      // Mock fs.readFile 抛出错误（文件不存在）
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await tool!.execute({ name: 'TestComponent' });
      expect(result).toBeDefined();
      expect((result as any)?.changelog).toEqual([]);
      expect((result as any)?.packageName).toBe('@aix/test-component');
    });

    it('应该按版本过滤变更日志', async () => {
      const tool = tools.find((t) => t.name === 'get-component-changelog');

      vi.mocked(fs.readFile).mockResolvedValue(`# Changelog

## 2.0.0 (2024-02-01)

### Features

- Major update

## 1.0.0 (2024-01-01)

### Features

- Initial release
`);

      const result = await tool!.execute({
        name: 'TestComponent',
        version: '1.0.0',
      });
      expect(result).toBeDefined();
      expect((result as any)?.changelog?.length).toBe(1);
      expect((result as any)?.changelog[0]?.version).toContain('1.0.0');
    });
  });

  describe('SearchIconsTool', () => {
    it('应该搜索图标', async () => {
      const tool = tools.find((t) => t.name === 'search-icons');
      expect(tool).toBeDefined();

      // Mock fs.readFile 返回图标索引
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          icons: [
            {
              name: 'home',
              packageName: '@aix/icons',
              category: 'Navigation',
              description: 'Home icon',
              tags: ['home', 'navigation'],
            },
            {
              name: 'search',
              packageName: '@aix/icons',
              category: 'Action',
              description: 'Search icon',
              tags: ['search', 'find'],
            },
          ],
        }),
      );

      const result = await tool!.execute({ query: 'home' });
      expect(Array.isArray(result)).toBe(true);
      expect((result as SearchResult[])[0]?.component?.name).toBe('home');
    });

    it('应该处理空查询', async () => {
      const tool = tools.find((t) => t.name === 'search-icons');

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          icons: [
            {
              name: 'home',
              packageName: '@aix/icons',
              category: 'Navigation',
              description: 'Home icon',
              tags: ['home'],
            },
          ],
        }),
      );

      const result = await tool!.execute({ query: '' });
      // 空查询会匹配所有图标（因为空字符串被任何字符串包含）
      // 这是合理的行为，允许用户浏览所有图标
      expect(Array.isArray(result)).toBe(true);
    });

    it('应该限制结果数量', async () => {
      const tool = tools.find((t) => t.name === 'search-icons');

      const icons = Array.from({ length: 20 }, (_, i) => ({
        name: `icon-${i}`,
        packageName: '@aix/icons',
        category: 'Test',
        description: `Icon ${i}`,
        tags: ['test'],
      }));

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ icons }));

      const result = await tool!.execute({ query: 'icon', limit: 5 });
      expect((result as SearchResult[]).length).toBeLessThanOrEqual(5);
    });

    it('应该处理图标索引加载失败', async () => {
      const tool = tools.find((t) => t.name === 'search-icons');

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await tool!.execute({ query: 'home' });
      expect(result).toHaveLength(0);
    });
  });

  describe('工具元数据', () => {
    it('所有工具应该有名称和描述', () => {
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });

    it('所有工具应该有输入 schema', () => {
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect((tool.inputSchema as { type: string }).type).toBe('object');
      }
    });

    it('应该创建正确数量的工具', () => {
      // 9 个工具: list, info, props, examples, search, search-icons, dependencies, categories, changelog
      expect(tools.length).toBe(9);
    });
  });

  describe('边界情况', () => {
    it('应该处理特殊字符的搜索查询', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: '@aix/' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('应该处理超长的搜索查询', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const longQuery = 'a'.repeat(1000);
      const result = await tool!.execute({ query: longQuery });
      expect(Array.isArray(result)).toBe(true);
    });

    it('应该处理非字符串类型的参数', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      // 传入数字类型的 category
      const result = await tool!.execute({ category: 123 as any });
      // 应该返回所有组件（因为类型不匹配被忽略）
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
