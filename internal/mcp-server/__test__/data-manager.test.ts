/**
 * DataManager 测试 (简化版)
 *
 * DataManager 只负责保存组件数据到文件系统。
 * 加载数据的方法已移除（由 MCP Server 直接读取 JSON 文件）。
 */
import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentInfo } from '../src/types/index';
import { DataManager } from '../src/utils/data-manager';

// Mock fs模块
vi.mock('node:fs/promises');

describe('DataManager', () => {
  let dataManager: DataManager;
  const testDataDir = '/test/data';
  let mockComponents: ComponentInfo[];

  beforeEach(() => {
    vi.clearAllMocks();
    dataManager = new DataManager(testDataDir);
    mockComponents = [
      {
        name: 'Button',
        packageName: '@aix/button',
        version: '1.0.0',
        description: '按钮组件',
        category: '通用',
        tags: ['button', 'action'],
        author: 'AIX Team',
        license: 'MIT',
        sourcePath: '/packages/button/src/Button.tsx',
        dependencies: ['vue'],
        peerDependencies: ['vue'],
        props: [
          {
            name: 'type',
            type: 'string',
            required: false,
            description: '按钮类型',
          },
        ],
        examples: [
          {
            title: '基础按钮',
            description: '基础按钮示例',
            code: '<Button>点击</Button>',
            language: 'tsx',
          },
        ],
      },
    ];
  });

  /** 取出写入某个文件的内容 */
  const writtenTo = (fileName: string): string | undefined => {
    const call = vi.mocked(fs.writeFile).mock.calls.find((c) => c[0].toString().endsWith(fileName));
    return call?.[1] as string | undefined;
  };

  describe('saveComponents', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('应该保存主索引文件', async () => {
      await dataManager.saveComponents(mockComponents);

      const index = writtenTo('components-index.json');
      expect(index).toBeDefined();

      const parsed = JSON.parse(index!);
      expect(parsed.components).toHaveLength(1);
      expect(parsed.components[0].name).toBe('Button');
      expect(parsed.components[0].packageName).toBe('@aix/button');
    });

    it('不应该再写逐包切片文件', async () => {
      const multiPackage: ComponentInfo[] = [
        { ...mockComponents[0]!, name: 'Button', packageName: '@aix/button' },
        { ...mockComponents[0]!, name: 'Input', packageName: '@aix/input' },
      ];

      await dataManager.saveComponents(multiPackage);

      // 逐包文件内容与主索引 100% 重复，且没有任何消费方
      const packageFileWrites = vi
        .mocked(fs.writeFile)
        .mock.calls.filter((c) => /packages[/\\]/.test(c[0].toString()));

      expect(packageFileWrites).toHaveLength(0);
    });

    it('不应该保存搜索索引文件（运行时内存构建）', async () => {
      await dataManager.saveComponents(mockComponents);
      expect(writtenTo('search-index.json')).toBeUndefined();
    });

    it('应该把文档正文摘到 docs-index.json，不留在主索引里', async () => {
      await dataManager.saveComponents([
        { ...mockComponents[0]!, readmeContent: '# Button', changelogContent: '## 1.0.0' },
      ]);

      const index = JSON.parse(writtenTo('components-index.json')!);
      expect(index.components[0].readmeContent).toBeUndefined();
      expect(index.components[0].changelogContent).toBeUndefined();

      const docs = JSON.parse(writtenTo('docs-index.json')!);
      expect(docs.docs['@aix/button']).toEqual({ readme: '# Button', changelog: '## 1.0.0' });
    });

    it('应该处理保存失败的情况', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

      await expect(dataManager.saveComponents(mockComponents)).rejects.toThrow('Permission denied');
    });

    it('应该能处理大量组件数据', async () => {
      const many = Array.from({ length: 1000 }, (_, i) => ({
        ...mockComponents[0]!,
        name: `Component${i}`,
        packageName: `@aix/component-${i}`,
      }));

      await dataManager.saveComponents(many);

      expect(JSON.parse(writtenTo('components-index.json')!).components).toHaveLength(1000);
    });
  });

  describe('图标数据处理', () => {
    const mockIcons = [
      {
        name: 'home',
        packageName: '@aix/icons',
        version: '1.0.0',
        description: '首页图标',
        category: '图标',
        iconCategory: 'Navigation',
        tags: ['navigation'],
        keywords: ['首页', 'home'],
        author: 'AIX Team',
        license: 'MIT',
        sourcePath: 'packages/icons/src/Navigation/Home.vue',
        svgContent: '<svg>home icon</svg>',
        dependencies: [],
        peerDependencies: [],
        examples: [],
      },
    ];

    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('应该保存图标检索索引，且不含 SVG 正文', async () => {
      await dataManager.saveComponents([], mockIcons as any);

      const index = JSON.parse(writtenTo('icons-index.json')!);
      expect(index.totalIcons).toBe(1);
      expect(index.icons[0].name).toBe('home');
      expect(index.icons[0].keywords).toContain('首页');
      expect(index.icons[0].svgContent).toBeUndefined();
    });

    it('应该把 SVG 源码单独存成映射', async () => {
      await dataManager.saveComponents([], mockIcons as any);

      const svg = JSON.parse(writtenTo('icons-svg.json')!);
      expect(svg).toEqual({ home: '<svg>home icon</svg>' });
    });
  });

  describe('路径处理', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('应该正确处理相对路径', async () => {
      await new DataManager('./test-data').saveComponents(mockComponents);

      expect(fs.mkdir).toHaveBeenCalledWith('./test-data', { recursive: true });
    });

    it('应该正确处理绝对路径', async () => {
      await new DataManager('/absolute/path').saveComponents(mockComponents);

      expect(fs.mkdir).toHaveBeenCalledWith('/absolute/path', { recursive: true });
    });
  });
});
