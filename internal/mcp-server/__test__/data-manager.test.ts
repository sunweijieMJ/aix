/**
 * DataManager 测试 (简化版)
 *
 * DataManager 只负责保存组件数据到文件系统。
 * 加载数据的方法已移除（由 MCP Server 直接读取 JSON 文件）。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
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

  describe('saveComponentsByPackage', () => {
    it('应该正确按包保存组件数据', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage(mockComponents);

      expect(fs.mkdir).toHaveBeenCalledWith(testDataDir, { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(testDataDir, 'packages'),
        { recursive: true },
      );
    });

    it('应该处理保存失败的情况', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

      await expect(
        dataManager.saveComponentsByPackage(mockComponents),
      ).rejects.toThrow('Permission denied');
    });

    it('应该保存主索引文件', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage(mockComponents);

      // 验证主索引文件被保存
      const indexWriteCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) =>
          call[0].toString().includes('components-index.json'),
        );

      expect(indexWriteCall).toBeDefined();
    });

    it('应该不再保存搜索索引文件（运行时内存构建）', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage(mockComponents);

      // 搜索索引已改为运行时内存构建，不再持久化
      const searchIndexWriteCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) =>
          call[0].toString().includes('search-index.json'),
        );

      expect(searchIndexWriteCall).toBeUndefined();
    });
  });

  describe('数据完整性', () => {
    it('应该验证保存的数据格式', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage(mockComponents);

      const writeCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) => call[0].toString().includes('packages'));

      expect(writeCall).toBeDefined();
      const savedData = JSON.parse(writeCall![1] as string);
      expect(savedData).toHaveProperty('packageName');
      expect(savedData).toHaveProperty('components');
      expect(savedData.components).toHaveLength(1);
    });

    it('应该保存组件的完整信息', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage(mockComponents);

      const writeCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) => call[0].toString().includes('packages'));

      expect(writeCall).toBeDefined();
      const savedData = JSON.parse(writeCall![1] as string);
      const savedComponent = savedData.components[0];

      expect(savedComponent.name).toBe('Button');
      expect(savedComponent.packageName).toBe('@aix/button');
      expect(savedComponent.description).toBe('按钮组件');
      expect(savedComponent.tags).toContain('button');
    });
  });

  describe('大数据处理', () => {
    it('应该能处理大量组件数据', async () => {
      const largeComponentList = Array.from({ length: 1000 }, (_, i) => ({
        ...mockComponents[0],
        name: `Component${i}`,
        packageName: `@aix/component-${i}`,
        version: mockComponents[0]?.version || '1.0.0',
        description: mockComponents[0]?.description || '测试组件',
        category: mockComponents[0]?.category || '测试',
        tags: mockComponents[0]?.tags || [],
        author: mockComponents[0]?.author || 'Test Author',
        license: mockComponents[0]?.license || 'MIT',
        sourcePath: mockComponents[0]?.sourcePath || '/test/path',
        dependencies: mockComponents[0]?.dependencies || [],
        peerDependencies: mockComponents[0]?.peerDependencies || [],
        props: mockComponents[0]?.props || [],
        examples: mockComponents[0]?.examples || [],
      }));

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage(largeComponentList);

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('应该为每个包创建单独的数据文件', async () => {
      const multiPackageComponents: ComponentInfo[] = [
        { ...mockComponents[0]!, name: 'Button', packageName: '@aix/button' },
        { ...mockComponents[0]!, name: 'Input', packageName: '@aix/input' },
        { ...mockComponents[0]!, name: 'Select', packageName: '@aix/select' },
      ];

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage(multiPackageComponents);

      // 验证每个包都有单独的数据文件 (跨平台路径匹配)
      const packageWriteCalls = vi
        .mocked(fs.writeFile)
        .mock.calls.filter((call) => {
          const filePath = call[0].toString();
          // 跨平台：匹配 packages/ 或 packages\
          return (
            filePath.includes('packages/') || filePath.includes('packages\\')
          );
        });

      // 应该有 3 个包文件
      expect(packageWriteCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('图标数据处理', () => {
    it('应该正确保存图标数据', async () => {
      const mockIcons = [
        {
          name: 'home',
          packageName: '@aix/icons',
          version: '1.0.0',
          description: '首页图标',
          category: '图标',
          tags: ['navigation'],
          author: 'AIX Team',
          license: 'MIT',
          sourcePath: '/packages/icons/src/home.svg',
          svgContent: '<svg>...</svg>',
          dependencies: [],
          peerDependencies: [],
        },
      ];

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage([], mockIcons as any);

      // 验证图标数据文件被保存
      const iconWriteCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) =>
          call[0].toString().includes('aix-icons.json'),
        );

      expect(iconWriteCall).toBeDefined();
    });

    it('应该单独保存SVG内容映射', async () => {
      const mockIcons = [
        {
          name: 'home',
          packageName: '@aix/icons',
          version: '1.0.0',
          description: '首页图标',
          category: '图标',
          tags: ['navigation'],
          author: 'AIX Team',
          license: 'MIT',
          sourcePath: '/packages/icons/src/home.svg',
          svgContent: '<svg>home icon</svg>',
          dependencies: [],
          peerDependencies: [],
        },
      ];

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage([], mockIcons as any);

      // 验证SVG映射文件被保存
      const svgWriteCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) =>
          call[0].toString().includes('aix-icons-svg.json'),
        );

      expect(svgWriteCall).toBeDefined();
      if (svgWriteCall) {
        const svgData = JSON.parse(svgWriteCall[1] as string);
        expect(svgData.home).toBe('<svg>home icon</svg>');
      }
    });
  });

  describe('路径处理', () => {
    it('应该正确处理相对路径', async () => {
      const relativeDataManager = new DataManager('./test-data');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await relativeDataManager.saveComponentsByPackage(mockComponents);

      expect(fs.mkdir).toHaveBeenCalledWith('./test-data', { recursive: true });
    });

    it('应该正确处理绝对路径', async () => {
      const absoluteDataManager = new DataManager('/absolute/path');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await absoluteDataManager.saveComponentsByPackage(mockComponents);

      expect(fs.mkdir).toHaveBeenCalledWith('/absolute/path', {
        recursive: true,
      });
    });

    it('应该生成安全的文件名', async () => {
      const componentWithSpecialPackage: ComponentInfo[] = [
        {
          ...mockComponents[0]!,
          packageName: '@aix/special-name',
        },
      ];

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await dataManager.saveComponentsByPackage(componentWithSpecialPackage);

      // 验证文件名被正确转换（@ 和 / 被替换）(跨平台路径匹配)
      const packageWriteCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) => {
          const filePath = call[0].toString();
          // 跨平台：匹配 packages/ 或 packages\ 且包含 special-name
          return (
            (filePath.includes('packages/') ||
              filePath.includes('packages\\')) &&
            filePath.includes('special-name')
          );
        });

      expect(packageWriteCall).toBeDefined();
      // 文件名应该是 aix-special-name.json，而不是 @aix/special-name.json
      expect(packageWriteCall![0].toString()).not.toContain('@');
    });
  });
});
