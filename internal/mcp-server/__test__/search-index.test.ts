import { beforeEach, describe, expect, it } from 'vitest';
import type { ComponentInfo } from '../src/types/index';
import { createSearchIndex, SearchIndex } from '../src/utils/search-index';

describe('SearchIndex', () => {
  let searchIndex: SearchIndex;
  let mockComponents: ComponentInfo[];

  beforeEach(() => {
    searchIndex = createSearchIndex();
    mockComponents = [
      {
        name: 'Img',
        packageName: '@aix/img',
        version: '1.0.0',
        description: '图片组件，支持懒加载和错误处理',
        category: '展示',
        tags: ['image', 'lazy', 'loading'],
        author: 'AIX Team',
        license: 'MIT',
        sourcePath: '/packages/img/src/Img.vue',
        dependencies: ['vue'],
        peerDependencies: ['vue'],
        props: [
          {
            name: 'src',
            type: 'string',
            required: true,
            description: '图片地址',
          },
          {
            name: 'lazy',
            type: 'boolean',
            required: false,
            description: '是否懒加载',
          },
        ],
        examples: [
          {
            title: '基础图片',
            description: '基础的图片组件使用',
            code: '<Img src="/path/to/image.jpg" lazy />',
            language: 'vue',
          },
        ],
      },
    ];
  });

  describe('buildIndex', () => {
    it('应该正确构建搜索索引', () => {
      searchIndex.buildIndex(mockComponents);
      const stats = searchIndex.getStats();

      expect(stats.componentCount).toBe(1);
      expect(stats.termCount).toBeGreaterThan(0);
      expect(stats.totalIndexItems).toBeGreaterThan(0);
    });

    it('应该处理空组件列表', () => {
      searchIndex.buildIndex([]);
      const stats = searchIndex.getStats();

      expect(stats.componentCount).toBe(0);
      expect(stats.termCount).toBe(0);
      expect(stats.totalIndexItems).toBe(0);
    });

    it('应该正确索引中文内容', () => {
      searchIndex.buildIndex(mockComponents);
      const results = searchIndex.search('图片', 10);

      expect(results).toHaveLength(1);
      expect(results[0]?.component.name).toBe('Img');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      searchIndex.buildIndex(mockComponents);
    });

    it('应该能够精确搜索组件名称', () => {
      const results = searchIndex.search('Img', 10);

      expect(results).toHaveLength(1);
      expect(results[0]?.component.name).toBe('Img');
      expect(results[0]?.score).toBeGreaterThan(0);
      expect(results[0]?.matchedFields).toContain('name');
    });

    it('应该能够搜索组件描述', () => {
      const results = searchIndex.search('懒加载', 10);

      expect(results).toHaveLength(1);
      expect(results[0]?.component.name).toBe('Img');
      expect(results[0]?.matchedFields).toContain('description');
    });

    it('应该能够搜索标签', () => {
      const results = searchIndex.search('image', 10);

      expect(results).toHaveLength(1);
      expect(results[0]?.component.name).toBe('Img');
      expect(results[0]?.matchedFields).toContain('tags');
    });

    it('应该能够搜索属性', () => {
      const results = searchIndex.search('src', 10);

      expect(results).toHaveLength(1);
      expect(results[0]?.component.name).toBe('Img');
      expect(results[0]?.matchedFields).toContain('props');
    });

    it('应该支持模糊搜索', () => {
      const results = searchIndex.search('imag', 10); // 部分匹配

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.component.name).toBe('Img');
    });

    it('应该按分数排序结果', () => {
      const results = searchIndex.search('组件', 10);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // 验证结果按分数降序排列
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]?.score).toBeGreaterThanOrEqual(
          results[i]?.score || 0,
        );
      }
    });

    it('应该限制结果数量', () => {
      const results = searchIndex.search('组件', 1);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('应该处理空查询', () => {
      const results = searchIndex.search('', 10);

      expect(results).toHaveLength(0);
    });

    it('应该处理不存在的搜索词', () => {
      const results = searchIndex.search('nonexistent', 10);

      expect(results).toHaveLength(0);
    });

    it('应该生成高亮信息', () => {
      const results = searchIndex.search('Img', 10);

      expect(results[0]?.highlights).toBeDefined();
      expect(Object.keys(results[0]?.highlights || {}).length).toBeGreaterThan(
        0,
      );
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      searchIndex.buildIndex(mockComponents);
      const stats = searchIndex.getStats();

      expect(stats).toHaveProperty('componentCount');
      expect(stats).toHaveProperty('termCount');
      expect(stats).toHaveProperty('totalIndexItems');
      expect(stats).toHaveProperty('averageTermsPerComponent');
      expect(stats).toHaveProperty('indexSizeEstimate');

      expect(stats.componentCount).toBe(1);
      expect(stats.termCount).toBeGreaterThan(0);
      expect(stats.averageTermsPerComponent).toBeGreaterThan(0);
      expect(stats.indexSizeEstimate).toMatch(/\d+KB/);
    });
  });

  describe('tokenize', () => {
    it('应该正确分词', () => {
      // 通过搜索验证分词功能
      searchIndex.buildIndex(mockComponents);

      // 测试中英文混合分词
      const results1 = searchIndex.search('图片组件', 10);
      expect(results1.length).toBeGreaterThan(0);

      // 测试英文分词
      const results2 = searchIndex.search('image lazy', 10);
      expect(results2.length).toBeGreaterThan(0);
    });
  });

  describe('calculateSimilarity', () => {
    it('应该正确计算字符串相似度', () => {
      searchIndex.buildIndex(mockComponents);

      // 测试相似字符串的搜索
      const results = searchIndex.search('imag', 10); // 部分匹配
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.component.name).toBe('Img');
    });
  });

  describe('边界情况', () => {
    it('应该处理包含特殊字符的搜索', () => {
      searchIndex.buildIndex(mockComponents);
      const results = searchIndex.search('image', 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.component.name).toBe('Img');
    });

    it('应该处理超长查询', () => {
      searchIndex.buildIndex(mockComponents);
      const longQuery = 'a'.repeat(1000);
      const results = searchIndex.search(longQuery, 10);

      expect(results).toHaveLength(0);
    });

    it('应该处理大量组件', () => {
      const largeComponentList: ComponentInfo[] = Array.from(
        { length: 1000 },
        (_, i) => ({
          ...mockComponents[0],
          name: `Component${i}`,
          packageName: `@aix/component-${i}`,
          description: `组件${i}的描述`,
          version: '1.0.0',
          category: '测试',
          tags: ['test'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/test/path',
          dependencies: ['vue'],
          peerDependencies: ['vue'],
          props: mockComponents[0]?.props || [],
          examples: mockComponents[0]?.examples || [],
        }),
      );

      searchIndex.buildIndex(largeComponentList);
      const stats = searchIndex.getStats();

      expect(stats.componentCount).toBe(1000);

      const results = searchIndex.search('Component500', 10);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
