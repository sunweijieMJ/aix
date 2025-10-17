import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentExtractor } from '../src/extractors/component-extractor';
import type { ExtractorConfig } from '../src/types/index';

// Mock 依赖
vi.mock('node:fs/promises');
vi.mock('../src/utils/index');

describe('ComponentExtractor', () => {
  let extractor: ComponentExtractor;
  let config: ExtractorConfig;

  beforeEach(() => {
    config = {
      packagesDir: '/test/packages',
      outputDir: '/test/output',
      ignorePackages: [],
      enableCache: true,
      verbose: false,
    };
    extractor = new ComponentExtractor(config);
  });

  describe('extractAllComponents', () => {
    it('should extract components from all packages', async () => {
      // Mock 实现将在实际开发中完善
      const components = await extractor.extractAllComponents();
      expect(Array.isArray(components)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return statistics about components', async () => {
      const stats = await extractor.getStats();
      expect(stats).toHaveProperty('totalPackages');
      expect(stats).toHaveProperty('componentPackages');
      expect(stats).toHaveProperty('categories');
      expect(stats).toHaveProperty('tags');
    });
  });
});
