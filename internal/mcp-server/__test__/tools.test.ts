import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { createTools } from '../src/mcp-tools/index';
import type {
  ComponentExample,
  ComponentIndex,
  ComponentInfo,
  ComponentSummary,
  IconSearchResult,
  SearchResultSummary,
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

    // 传 repoRoot，让 changelog 走「读仓库真实文件」这条路径
    tools = createTools(mockIndex, '/test/data', undefined, '/repo');
  });

  describe('ListComponentsTool', () => {
    it('应该列出所有组件', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      expect(tool).toBeDefined();

      const result = await tool!.execute({});
      expect(result).toHaveLength(2);
      expect((result as ComponentSummary[])?.[0]?.name).toBe('TestComponent');
    });

    it('应该按分类过滤组件', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      const result = await tool!.execute({ category: '测试' });
      expect(result).toHaveLength(1);
      expect((result as ComponentSummary[])?.[0]?.name).toBe('TestComponent');

      const noResult = await tool!.execute({ category: '不存在' });
      expect(noResult).toHaveLength(0);
    });

    it('应该按标签过滤组件', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      const result = await tool!.execute({ tag: 'test' });
      expect(result).toHaveLength(1);
      expect((result as ComponentSummary[])?.[0]?.name).toBe('TestComponent');
    });

    it('应该支持分类和标签同时过滤', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      const result = await tool!.execute({ category: '测试', tag: 'demo' });
      expect(result).toHaveLength(1);
    });

    it('应该只返回摘要，不带 props 和 examples 正文', async () => {
      const tool = tools.find((t) => t.name === 'list-components');
      const result = (await tool!.execute({})) as ComponentSummary[];

      expect(result[0]).toMatchObject({
        name: 'TestComponent',
        packageName: '@aix/test-component',
        propsCount: 2,
        examplesCount: 2,
      });
      expect(result[0]).not.toHaveProperty('props');
      expect(result[0]).not.toHaveProperty('examples');
      expect(result[0]).not.toHaveProperty('sourcePath');
    });
  });

  describe('子组件寻址', () => {
    it('按子组件名也应该能找到所属包', async () => {
      const withSubs: ComponentIndex = {
        ...mockIndex,
        components: [{ ...mockComponent, subComponents: ['TestComponent', 'InnerWidget'] }],
      };
      const subTools = createTools(withSubs, '/test/data');

      const info = (await subTools
        .find((t) => t.name === 'get-component-info')!
        .execute({ name: 'InnerWidget' })) as ComponentInfo;

      // 返回所属包，各条 API 上的 group 字段用于区分归属
      expect(info?.packageName).toBe('@aix/test-component');
    });

    it('搜索子组件名应该命中所属包', async () => {
      const withSubs: ComponentIndex = {
        ...mockIndex,
        components: [{ ...mockComponent, subComponents: ['TestComponent', 'InnerWidget'] }],
      };
      const subTools = createTools(withSubs, '/test/data');

      const results = (await subTools
        .find((t) => t.name === 'search-components')!
        .execute({ query: 'InnerWidget' })) as SearchResultSummary[];

      expect(results[0]?.component.name).toBe('TestComponent');
      expect(results[0]?.matchedFields).toContain('subComponents');
      expect(results[0]?.component.subComponents).toEqual(['TestComponent', 'InnerWidget']);
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
      expect((result as ComponentInfo)?.packageName).toBe('@aix/test-component');
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

      const result = (await tool!.execute({ name: 'TestComponent' })) as {
        props: ComponentInfo['props'];
        emits: unknown[];
        slots: unknown[];
      };
      expect(result.props).toHaveLength(2);
      expect(result.props[0]?.name).toBe('title');
      expect(result.props[0]?.type).toBe('string');
      expect(result.props[0]?.required).toBe(true);
      // 同一个调用里一并给出 Emits / Slots，省一轮往返
      expect(result.emits).toEqual([]);
      expect(result.slots).toEqual([]);
    });

    it('应该对不存在的组件返回 null', async () => {
      const tool = tools.find((t) => t.name === 'get-component-props');
      const result = await tool!.execute({ name: 'NonExistent' });
      expect(result).toBeNull();
    });

    it('应该返回没有 Props 的组件的空集合', async () => {
      const tool = tools.find((t) => t.name === 'get-component-props');
      const result = await tool!.execute({ name: 'AnotherComponent' });
      expect(result).toEqual({ props: [], emits: [], slots: [] });
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
      expect((result as SearchResultSummary[])?.[0]?.component?.name).toBe('TestComponent');
      expect((result as SearchResultSummary[])?.[0]?.score).toBeGreaterThan(0);
    });

    it('应该限制搜索结果数量', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: 'component', limit: 1 });
      expect((result as SearchResultSummary[]).length).toBeLessThanOrEqual(1);
    });

    it('应该对空查询返回空数组', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: '' });
      expect(result).toHaveLength(0);
    });

    it('应该把越界的 limit 归一到 [1, 100]', async () => {
      const tool = tools.find((t) => t.name === 'search-components');

      // 0 和负数都归到下限 1，不会再走到 slice(0, -5) 那种截尾行为
      expect(await tool!.execute({ query: 'component', limit: 0 })).toHaveLength(1);
      expect(await tool!.execute({ query: 'component', limit: -5 })).toHaveLength(1);
    });

    it('参数类型不对时应该给出可读错误', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      await expect(tool!.execute({})).rejects.toThrow('缺少必填参数: query');
    });

    it('应该返回匹配字段信息', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = await tool!.execute({ query: 'TestComponent' });
      expect((result as SearchResultSummary[])?.[0]?.matchedFields).toBeDefined();
    });

    it('命中项应该是摘要而非完整组件', async () => {
      const tool = tools.find((t) => t.name === 'search-components');
      const result = (await tool!.execute({ query: 'TestComponent' })) as SearchResultSummary[];

      expect(result[0]?.component).toMatchObject({ propsCount: 2, examplesCount: 2 });
      expect(result[0]?.component).not.toHaveProperty('props');
      expect(result[0]?.component).not.toHaveProperty('examples');
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

    it('脱离仓库时应该回退到文档快照', async () => {
      // repoRoot 为 null：npx 安装的场景，磁盘上没有 packages/ 源码
      const detachedTools = createTools(mockIndex, '/test/data', undefined, null);
      const tool = detachedTools.find((t) => t.name === 'get-component-changelog');

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          lastUpdated: '2026-01-01T00:00:00.000Z',
          docs: {
            '@aix/test-component': {
              changelog:
                '# Changelog\n\n## 1.0.0 (2024-01-01)\n\n### Features\n\n- Initial release\n',
            },
          },
        }),
      );

      const result = (await tool!.execute({ name: 'TestComponent' })) as any;

      expect(result.changelog).toHaveLength(1);
      expect(result.changelog[0].changes).toContain('Initial release');
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

      const result = (await tool!.execute({ query: 'home' })) as {
        results: IconSearchResult[];
        total: number;
      };
      expect(result.total).toBe(1);
      expect(result.results[0]?.name).toBe('home');
      // 图标不再伪装成组件，改为直接给出可用的导入语句
      expect(result.results[0]?.importStatement).toBe("import { home } from '@aix/icons';");
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

      // 空查询过去会命中全部图标（空串被任何字符串包含），
      // 等于把整个图标库倒进上下文，现在直接返回空
      const result = (await tool!.execute({ query: '' })) as { results: unknown[]; total: number };
      expect(result).toEqual({ results: [], total: 0 });
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

      const result = (await tool!.execute({ query: 'icon', limit: 5 })) as {
        results: unknown[];
        total: number;
      };
      expect(result.results).toHaveLength(5);
      // total 反映命中总数，便于调用方判断是否需要缩小范围
      expect(result.total).toBe(20);
    });

    it('应该处理图标索引加载失败', async () => {
      const tool = tools.find((t) => t.name === 'search-icons');

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await tool!.execute({ query: 'home' });
      expect(result).toEqual({ results: [], total: 0 });
    });
  });

  describe('GetIconSvgTool', () => {
    const svgMap = JSON.stringify({ IconSearch: '<svg>search</svg>' });

    it('应该返回图标的 SVG 源码', async () => {
      const tool = tools.find((t) => t.name === 'get-icon-svg');
      expect(tool).toBeDefined();

      vi.mocked(fs.readFile).mockResolvedValue(svgMap);

      expect(await tool!.execute({ name: 'IconSearch' })).toEqual({
        name: 'IconSearch',
        svg: '<svg>search</svg>',
      });
    });

    it('图标不存在时应该提示先用 search-icons 确认', async () => {
      const tool = tools.find((t) => t.name === 'get-icon-svg');
      vi.mocked(fs.readFile).mockResolvedValue(svgMap);

      await expect(tool!.execute({ name: 'NotExist' })).rejects.toThrow('未找到图标: NotExist');
    });

    it('数据缺失时应该提示运行 extract', async () => {
      const tool = tools.find((t) => t.name === 'get-icon-svg');
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      await expect(tool!.execute({ name: 'IconSearch' })).rejects.toThrow('请先运行 extract');
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

    it('所有工具的入参 schema 应该是可交给 SDK 校验的 zod shape', () => {
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        // 每个字段都得是 zod 类型，SDK 才能据此校验入参并生成 JSON Schema
        for (const [field, schema] of Object.entries(tool.inputSchema)) {
          expect(schema, `${tool.name}.${field}`).toHaveProperty('safeParse');
        }
      }
    });

    it('必填参数应该被 schema 标记为必填', () => {
      const required = (name: string) =>
        Object.entries(tools.find((t) => t.name === name)!.inputSchema)
          .filter(([, schema]) => !(schema as z.ZodType).safeParse(undefined).success)
          .map(([field]) => field);

      expect(required('get-component-info')).toEqual(['name']);
      expect(required('search-components')).toEqual(['query']);
      expect(required('get-icon-svg')).toEqual(['name']);
      expect(required('list-components')).toEqual([]);
    });

    it('未提供工具包索引时只创建组件和图标工具', () => {
      expect(tools.map((t) => t.name)).toEqual([
        'list-components',
        'get-component-info',
        'get-component-props',
        'get-component-examples',
        'search-components',
        'search-icons',
        'get-icon-svg',
        'get-component-dependencies',
        'get-categories-and-tags',
        'get-component-changelog',
      ]);
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
