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
  });

  describe('loadCategoryData', () => {
    it('应该正确加载分类数据文件', async () => {
      const category = 'components';
      const mockData = { components: mockComponents };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));

      const result = await dataManager.loadCategoryData(category);

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(testDataDir, 'components/others.json'),
        'utf8',
      );
      expect(result).toEqual(mockData);
    });

    it('应该在文件不存在时返回null', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await dataManager.loadCategoryData('components');

      expect(result).toBeNull();
    });

    it('应该处理无效JSON文件', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      const result = await dataManager.loadCategoryData('components');

      expect(result).toBeNull(); // 数据管理器捕获错误并返回null
    });
  });

  describe('loadIconSvg', () => {
    it('应该正确加载图标SVG', async () => {
      const iconName = 'home';
      const mockSvgMap = {
        home: '<svg>home icon</svg>',
        user: '<svg>user icon</svg>',
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSvgMap));

      const result = await dataManager.loadIconSvg(iconName);

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(testDataDir, 'components', 'icons-svg.json'),
        'utf8',
      );
      expect(result).toBe('<svg>home icon</svg>');
    });

    it('应该在图标不存在时返回null', async () => {
      const mockSvgMap = {
        user: '<svg>user icon</svg>',
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSvgMap));

      const result = await dataManager.loadIconSvg('nonexistent');

      expect(result).toBeNull();
    });

    it('应该在文件读取失败时返回null', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const result = await dataManager.loadIconSvg('home');

      expect(result).toBeNull();
    });
  });

  describe('并发操作', () => {
    it('应该正确处理并发读写', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ test: 'data' }),
      );

      const savePromise = dataManager.saveComponentsByPackage(mockComponents);
      const loadPromise = dataManager.loadCategoryData('components');

      await Promise.all([savePromise, loadPromise]);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.readFile).toHaveBeenCalled();
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

    it('应该处理损坏的数据文件', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{"incomplete": json');

      const result = await dataManager.loadCategoryData('components');

      expect(result).toBeNull(); // 数据管理器捕获错误并返回null
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
  });

  describe('路径处理', () => {
    it('应该正确处理相对路径', async () => {
      const relativeDataManager = new DataManager('./test-data');
      vi.mocked(fs.readFile).mockResolvedValue('{"test": "data"}');

      await relativeDataManager.loadCategoryData('components');

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join('./test-data', 'components/others.json'),
        'utf8',
      );
    });

    it('应该正确处理绝对路径', async () => {
      const absoluteDataManager = new DataManager('/absolute/path');
      vi.mocked(fs.readFile).mockResolvedValue('{"test": "data"}');

      await absoluteDataManager.loadCategoryData('components');

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join('/absolute/path', 'components/others.json'),
        'utf8',
      );
    });
  });
});
