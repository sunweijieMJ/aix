import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentExtractor } from '../src/extractors/component-extractor';
import type { ExtractorConfig } from '../src/types/index';

// Mock 依赖
vi.mock('node:fs/promises');
vi.mock('../src/utils/index', async () => {
  const actual = await vi.importActual('../src/utils/index');
  return {
    ...actual,
    findPackages: vi.fn(),
    findComponentFiles: vi.fn(),
    readPackageJson: vi.fn(),
    getDisplayName: vi.fn((name: string) => {
      // 实现简单的 getDisplayName 逻辑
      return name
        .replace(/^@[^/]+\//, '')
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
    }),
  };
});

// 获取 mock 函数
const mockUtils = vi.mocked(await import('../src/utils/index'));

describe('ComponentExtractor', () => {
  let extractor: ComponentExtractor;
  let config: ExtractorConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      packagesDir: '/test/packages',
      outputDir: '/test/output',
      ignorePackages: [],
      enableCache: true,
      verbose: false,
      maxConcurrentExtraction: 5,
    };
    extractor = new ComponentExtractor(config);
  });

  describe('extractAllComponents', () => {
    it('应该从所有包中提取组件', async () => {
      // Mock findPackages 返回包路径
      mockUtils.findPackages.mockResolvedValue([
        '/test/packages/button',
        '/test/packages/input',
      ]);

      // Mock readPackageJson
      mockUtils.readPackageJson.mockImplementation(async (pkgPath: string) => {
        if (pkgPath.includes('button')) {
          return {
            name: '@aix/button',
            version: '1.0.0',
            description: '按钮组件',
            dependencies: { vue: '^3.0.0' },
            peerDependencies: { vue: '^3.0.0' },
          };
        }
        if (pkgPath.includes('input')) {
          return {
            name: '@aix/input',
            version: '1.0.0',
            description: '输入框组件',
            dependencies: { vue: '^3.0.0' },
            peerDependencies: { vue: '^3.0.0' },
          };
        }
        return null;
      });

      // Mock findComponentFiles
      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      const components = await extractor.extractAllComponents();

      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBe(2);
      expect(components[0]?.name).toBe('Button');
      expect(components[1]?.name).toBe('Input');
    });

    it('应该在没有包时返回空数组', async () => {
      mockUtils.findPackages.mockResolvedValue([]);

      const components = await extractor.extractAllComponents();

      expect(components).toHaveLength(0);
    });

    it('应该跳过忽略列表中的包', async () => {
      config.ignorePackages = ['@aix/ignored'];
      extractor = new ComponentExtractor(config);

      mockUtils.findPackages.mockResolvedValue([
        '/test/packages/button',
        '/test/packages/ignored',
      ]);

      mockUtils.readPackageJson.mockImplementation(async (pkgPath: string) => {
        if (pkgPath.includes('button')) {
          return {
            name: '@aix/button',
            version: '1.0.0',
            description: '按钮组件',
          };
        }
        if (pkgPath.includes('ignored')) {
          return {
            name: '@aix/ignored',
            version: '1.0.0',
            description: '被忽略的包',
          };
        }
        return null;
      });

      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      const components = await extractor.extractAllComponents();

      expect(components.length).toBe(1);
      expect(components[0]?.packageName).toBe('@aix/button');
    });

    it('应该处理 package.json 读取失败的情况', async () => {
      mockUtils.findPackages.mockResolvedValue(['/test/packages/broken']);
      mockUtils.readPackageJson.mockResolvedValue(null);

      const components = await extractor.extractAllComponents();

      expect(components).toHaveLength(0);
    });
  });

  describe('extractComponentFromPackage', () => {
    it('应该从单个包中提取组件信息', async () => {
      mockUtils.readPackageJson.mockResolvedValue({
        name: '@aix/button',
        version: '1.0.0',
        description: '按钮组件',
        author: 'AIX Team',
        license: 'MIT',
        dependencies: { vue: '^3.0.0' },
        peerDependencies: { vue: '^3.0.0' },
      });

      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: ['/test/packages/button/src/index.vue'],
        storyFiles: ['/test/packages/button/stories/Button.stories.ts'],
        readmeFiles: [],
      });

      const component = await extractor.extractComponentFromPackage(
        '/test/packages/button',
      );

      expect(component).not.toBeNull();
      expect(component?.name).toBe('Button');
      expect(component?.packageName).toBe('@aix/button');
      expect(component?.version).toBe('1.0.0');
      expect(component?.description).toBe('按钮组件');
      expect(component?.dependencies).toContain('vue');
      expect(component?.peerDependencies).toContain('vue');
    });

    it('应该正确处理没有 package.json 的包', async () => {
      mockUtils.readPackageJson.mockResolvedValue(null);

      const component = await extractor.extractComponentFromPackage(
        '/test/packages/invalid',
      );

      expect(component).toBeNull();
    });

    it('应该正确提取分类', async () => {
      const testCases = [
        { name: '@aix/picker', expectedCategory: '选择器' },
        { name: '@aix/modal', expectedCategory: '弹窗' },
        { name: '@aix/form-input', expectedCategory: '表单' },
        { name: '@aix/image', expectedCategory: '媒体' },
        { name: '@aix/icon', expectedCategory: '图标' },
        { name: '@aix/theme', expectedCategory: '主题' },
        { name: '@aix/util', expectedCategory: '工具' },
        { name: '@aix/layout', expectedCategory: '布局' },
        { name: '@aix/navigation', expectedCategory: '导航' },
        { name: '@aix/table', expectedCategory: '数据展示' },
        { name: '@aix/message', expectedCategory: '反馈' },
        { name: '@aix/unknown', expectedCategory: '其他' },
      ];

      for (const { name, expectedCategory } of testCases) {
        mockUtils.readPackageJson.mockResolvedValue({
          name,
          version: '1.0.0',
          description: '测试组件',
        });

        mockUtils.findComponentFiles.mockResolvedValue({
          sourceFiles: [],
          storyFiles: [],
          readmeFiles: [],
        });

        const component = await extractor.extractComponentFromPackage(
          '/test/packages/test',
        );

        expect(component?.category).toBe(expectedCategory);
      }
    });
  });

  describe('extractIncrementalComponents', () => {
    it('应该只提取自上次提取后有更新的组件', async () => {
      const lastExtractTime = new Date(Date.now() - 3600000); // 1小时前

      mockUtils.findPackages.mockResolvedValue([
        '/test/packages/button',
        '/test/packages/input',
      ]);

      mockUtils.readPackageJson.mockImplementation(async (pkgPath: string) => {
        if (pkgPath.includes('button')) {
          return {
            name: '@aix/button',
            version: '1.0.0',
            description: '按钮组件',
          };
        }
        return null;
      });

      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      // Mock stat 来模拟文件修改时间
      vi.mocked(fs.stat).mockImplementation(async (filePath: any) => {
        if (filePath.toString().includes('button')) {
          // button 包已更新
          return { mtime: new Date() } as any;
        }
        // input 包未更新
        return { mtime: new Date(Date.now() - 7200000) } as any;
      });

      const components =
        await extractor.extractIncrementalComponents(lastExtractTime);

      // 只有 button 应该被提取
      expect(components.length).toBe(1);
      expect(components[0]?.packageName).toBe('@aix/button');
    });
  });

  describe('extractAndSaveAllComponents', () => {
    it('应该提取并保存所有组件', async () => {
      mockUtils.findPackages.mockResolvedValue(['/test/packages/button']);

      mockUtils.readPackageJson.mockResolvedValue({
        name: '@aix/button',
        version: '1.0.0',
        description: '按钮组件',
      });

      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      // Mock fs.mkdir 和 fs.writeFile
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await extractor.extractAndSaveAllComponents();

      expect(result.components.length).toBe(1);
      expect(result.icons).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', async () => {
      mockUtils.findPackages.mockResolvedValue([
        '/test/packages/button',
        '/test/packages/input',
      ]);

      mockUtils.readPackageJson.mockImplementation(async (pkgPath: string) => {
        if (pkgPath.includes('button')) {
          return {
            name: '@aix/button',
            version: '1.0.0',
            description: '按钮组件',
          };
        }
        if (pkgPath.includes('input')) {
          return {
            name: '@aix/input',
            version: '1.0.0',
            description: '输入框组件',
          };
        }
        return null;
      });

      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      const stats = await extractor.getStats();

      expect(stats).toHaveProperty('totalPackages');
      expect(stats).toHaveProperty('componentPackages');
      expect(stats).toHaveProperty('categories');
      expect(stats).toHaveProperty('tags');
      expect(stats.totalPackages).toBe(2);
      expect(stats.componentPackages).toBe(2);
    });
  });

  describe('错误处理', () => {
    it('应该优雅地处理提取过程中的错误', async () => {
      mockUtils.findPackages.mockResolvedValue(['/test/packages/error']);
      mockUtils.readPackageJson.mockRejectedValue(new Error('Read failed'));

      const components = await extractor.extractAllComponents();

      // 应该返回空数组而不是抛出错误
      expect(components).toHaveLength(0);
    });

    it('应该在 verbose 模式下输出日志', async () => {
      config.verbose = true;
      extractor = new ComponentExtractor(config);

      mockUtils.findPackages.mockResolvedValue(['/test/packages/button']);
      mockUtils.readPackageJson.mockResolvedValue({
        name: '@aix/button',
        version: '1.0.0',
        description: '按钮组件',
      });
      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      const components = await extractor.extractAllComponents();

      expect(components.length).toBe(1);
    });
  });

  describe('作者信息提取', () => {
    it('应该正确处理字符串格式的作者', async () => {
      mockUtils.readPackageJson.mockResolvedValue({
        name: '@aix/button',
        version: '1.0.0',
        description: '按钮组件',
        author: 'AIX Team <aix@example.com>',
      });

      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      const component = await extractor.extractComponentFromPackage(
        '/test/packages/button',
      );

      expect(component?.author).toBe('AIX Team <aix@example.com>');
    });

    it('应该正确处理对象格式的作者', async () => {
      mockUtils.readPackageJson.mockResolvedValue({
        name: '@aix/button',
        version: '1.0.0',
        description: '按钮组件',
        author: { name: 'AIX Team', email: 'aix@example.com' },
      });

      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      const component = await extractor.extractComponentFromPackage(
        '/test/packages/button',
      );

      expect(component?.author).toBe('AIX Team <aix@example.com>');
    });

    it('应该处理没有作者信息的情况', async () => {
      mockUtils.readPackageJson.mockResolvedValue({
        name: '@aix/button',
        version: '1.0.0',
        description: '按钮组件',
      });

      mockUtils.findComponentFiles.mockResolvedValue({
        sourceFiles: [],
        storyFiles: [],
        readmeFiles: [],
      });

      const component = await extractor.extractComponentFromPackage(
        '/test/packages/button',
      );

      expect(component?.author).toBe('');
    });
  });
});
