/**
 * Image 工具函数单元测试
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { PNG } from 'pngjs';
import { getImageDimensions, alignImages } from '../../../src/utils/image';

const FIXTURES = path.resolve(__dirname, '../../fixtures');

describe('Image Utils', () => {
  describe('getImageDimensions', () => {
    it('should return correct dimensions for 100x100 image', async () => {
      const dims = await getImageDimensions(
        path.join(FIXTURES, 'baseline.png'),
      );
      expect(dims.width).toBe(100);
      expect(dims.height).toBe(100);
    });

    it('should return correct dimensions for 50x50 image', async () => {
      const dims = await getImageDimensions(path.join(FIXTURES, 'small.png'));
      expect(dims.width).toBe(50);
      expect(dims.height).toBe(50);
    });
  });

  describe('alignImages', () => {
    it('should align two same-sized images without changes', () => {
      const img1 = new PNG({ width: 100, height: 100 });
      const img2 = new PNG({ width: 100, height: 100 });
      img1.data.fill(0);
      img2.data.fill(0);

      const result = alignImages(img1, img2);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
      expect(result.aligned1.width).toBe(100);
      expect(result.aligned2.width).toBe(100);
    });

    it('should align different-sized images to the larger size', () => {
      const img1 = new PNG({ width: 100, height: 80 });
      const img2 = new PNG({ width: 60, height: 100 });
      img1.data.fill(0);
      img2.data.fill(0);

      const result = alignImages(img1, img2);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
      expect(result.aligned1.width).toBe(100);
      expect(result.aligned1.height).toBe(100);
      expect(result.aligned2.width).toBe(100);
      expect(result.aligned2.height).toBe(100);
    });
  });
});
