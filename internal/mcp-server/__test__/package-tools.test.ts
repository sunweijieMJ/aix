import { beforeEach, describe, expect, it } from 'vitest';
import { createTools } from '../src/mcp-tools/index';
import type {
  ComponentIndex,
  ToolPackageIndex,
  ToolPackageInfo,
} from '../src/types/index';

describe('Package MCP Tools', () => {
  let tools: ReturnType<typeof createTools>;
  let mockToolPackage: ToolPackageInfo;
  let mockToolPackageIndex: ToolPackageIndex;
  let mockComponentIndex: ComponentIndex;

  beforeEach(() => {
    mockToolPackage = {
      name: 'Tracker',
      packageName: '@kit/tracker',
      version: '1.0.0',
      description: '前端埋点数据采集工具',
      category: '工具包',
      tags: ['tracker', 'vue', '埋点'],
      author: 'AIX Team',
      license: 'MIT',
      scope: 'kit',
      sourcePath: '/kit/tracker',
      readmePath: '/kit/tracker/README.md',
      dependencies: ['vue'],
      peerDependencies: [],
      features: ['适配器模式', 'TypeScript 类型安全'],
      examples: [
        {
          title: '基础用法',
          description: '基础用法',
          code: 'app.use(createTrackerPlugin(options))',
          language: 'ts',
        },
      ],
      apiSections: [
        {
          title: 'API',
          content: '### createTrackerPlugin\n\n创建 Vue 插件。',
        },
      ],
    };

    mockToolPackageIndex = {
      packages: [
        mockToolPackage,
        {
          name: 'EslintConfig',
          packageName: '@kit/eslint-config',
          version: '1.0.0',
          description: 'ESLint 配置包',
          category: '基础设施',
          tags: ['eslint', 'config'],
          author: 'AIX Team',
          license: 'MIT',
          scope: 'internal',
          sourcePath: '/internal/eslint-config',
          dependencies: [],
          peerDependencies: [],
          features: ['统一规范'],
          examples: [],
          apiSections: [],
        },
      ],
      categories: ['工具包', '基础设施'],
      tags: ['tracker', 'vue', '埋点', 'eslint', 'config'],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    mockComponentIndex = {
      components: [],
      categories: [],
      tags: [],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    tools = createTools(mockComponentIndex, '/data', mockToolPackageIndex);
  });

  describe('list-packages', () => {
    it('应该列出所有工具包', async () => {
      const tool = tools.find((t) => t.name === 'list-packages');
      expect(tool).toBeTruthy();

      const result = (await tool!.execute({})) as any;
      expect(result.packages).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('应该按 scope 过滤', async () => {
      const tool = tools.find((t) => t.name === 'list-packages')!;
      const result = (await tool.execute({ scope: 'kit' })) as any;
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageName).toBe('@kit/tracker');
    });

    it('应该按 category 过滤', async () => {
      const tool = tools.find((t) => t.name === 'list-packages')!;
      const result = (await tool.execute({ category: '基础设施' })) as any;
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageName).toBe('@kit/eslint-config');
    });
  });

  describe('get-package-info', () => {
    it('应该通过包名获取详细信息', async () => {
      const tool = tools.find((t) => t.name === 'get-package-info')!;
      const result = (await tool.execute({
        name: '@kit/tracker',
      })) as ToolPackageInfo;
      expect(result.packageName).toBe('@kit/tracker');
      expect(result.features).toHaveLength(2);
      expect(result.apiSections).toHaveLength(1);
    });

    it('应该通过显示名获取', async () => {
      const tool = tools.find((t) => t.name === 'get-package-info')!;
      const result = (await tool.execute({
        name: 'Tracker',
      })) as ToolPackageInfo;
      expect(result.packageName).toBe('@kit/tracker');
    });

    it('找不到时应抛出错误', async () => {
      const tool = tools.find((t) => t.name === 'get-package-info')!;
      await expect(tool.execute({ name: 'nonexistent' })).rejects.toThrow();
    });
  });

  describe('search-packages', () => {
    it('应该按关键词搜索', async () => {
      const tool = tools.find((t) => t.name === 'search-packages')!;
      const result = (await tool.execute({ query: '埋点' })) as any;
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].package.packageName).toBe('@kit/tracker');
    });

    it('应该支持 limit 参数', async () => {
      const tool = tools.find((t) => t.name === 'search-packages')!;
      const result = (await tool.execute({ query: 'kit', limit: 1 })) as any;
      expect(result.results).toHaveLength(1);
    });

    it('空查询应返回空结果', async () => {
      const tool = tools.find((t) => t.name === 'search-packages')!;
      const result = (await tool.execute({ query: '' })) as any;
      expect(result.results).toHaveLength(0);
    });
  });
});
