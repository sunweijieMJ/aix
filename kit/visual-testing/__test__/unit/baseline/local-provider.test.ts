/**
 * LocalProvider 单元测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { LocalProvider } from '../../../src/core/baseline/local-provider';

const FIXTURES = path.resolve(__dirname, '../../fixtures');
const TMP = path.resolve(__dirname, '../../tmp/baseline');

describe('LocalProvider', () => {
  const provider = new LocalProvider(FIXTURES);

  beforeAll(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  describe('fetch', () => {
    it('should copy baseline to output path', async () => {
      const outputPath = path.join(TMP, 'fetched-baseline.png');

      const result = await provider.fetch({
        source: 'baseline.png',
        outputPath,
      });

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should extract metadata (dimensions and hash)', async () => {
      const outputPath = path.join(TMP, 'meta-baseline.png');

      const result = await provider.fetch({
        source: 'baseline.png',
        outputPath,
      });

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.dimensions).toEqual({ width: 100, height: 100 });
      expect(result.metadata!.hash).toBeDefined();
      expect(result.metadata!.hash!.length).toBeGreaterThan(0);
      expect(result.metadata!.fetchedAt).toBeDefined();
    });

    it('should return error for non-existent file', async () => {
      const result = await provider.fetch({
        source: 'non-existent.png',
        outputPath: path.join(TMP, 'out.png'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('not found');
    });

    it('should handle absolute paths', async () => {
      const absoluteSrc = path.join(FIXTURES, 'baseline.png');
      const outputPath = path.join(TMP, 'abs-baseline.png');

      const result = await provider.fetch({
        source: absoluteSrc,
        outputPath,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const exists = await provider.exists('baseline.png');
      expect(exists).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const exists = await provider.exists('nonexistent.png');
      expect(exists).toBe(false);
    });
  });
});
