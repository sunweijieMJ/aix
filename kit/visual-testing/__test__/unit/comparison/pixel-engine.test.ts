/**
 * PixelComparisonEngine 单元测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { PixelComparisonEngine } from '../../../src/core/comparison/pixel-engine';

const FIXTURES = path.resolve(__dirname, '../../fixtures');
const TMP = path.resolve(__dirname, '../../tmp/comparison');

describe('PixelComparisonEngine', () => {
  const engine = new PixelComparisonEngine();

  beforeAll(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('should return match=true for identical images', async () => {
    const result = await engine.compare({
      baselinePath: path.join(FIXTURES, 'baseline.png'),
      actualPath: path.join(FIXTURES, 'actual-match.png'),
      diffPath: path.join(TMP, 'identical-diff.png'),
      threshold: 0.01,
    });

    expect(result.match).toBe(true);
    expect(result.mismatchPercentage).toBe(0);
    expect(result.mismatchPixels).toBe(0);
    expect(result.diffPath).toBeNull();
    expect(result.sizeDiff).toBeNull();
    expect(result.diffRegions).toEqual([]);
  });

  it('should detect differences between different images', async () => {
    const result = await engine.compare({
      baselinePath: path.join(FIXTURES, 'baseline.png'),
      actualPath: path.join(FIXTURES, 'actual-diff.png'),
      diffPath: path.join(TMP, 'diff-output.png'),
      threshold: 0.01,
    });

    expect(result.match).toBe(false);
    expect(result.mismatchPercentage).toBeGreaterThan(0);
    expect(result.mismatchPixels).toBeGreaterThan(0);
    expect(result.totalPixels).toBe(100 * 100);
    expect(result.diffPath).toBe(path.join(TMP, 'diff-output.png'));
    expect(fs.existsSync(result.diffPath!)).toBe(true);
  });

  it('should handle size differences by aligning images', async () => {
    const result = await engine.compare({
      baselinePath: path.join(FIXTURES, 'baseline.png'),
      actualPath: path.join(FIXTURES, 'small.png'),
      diffPath: path.join(TMP, 'size-diff.png'),
      threshold: 0.01,
    });

    // 50x50 vs 100x100 → aligned to 100x100 → half the pixels differ
    expect(result.match).toBe(false);
    expect(result.sizeDiff).not.toBeNull();
    expect(result.sizeDiff!.baseline).toEqual({ width: 100, height: 100 });
    expect(result.sizeDiff!.actual).toEqual({ width: 50, height: 50 });
    expect(result.mismatchPercentage).toBeGreaterThan(0);
  });

  it('should detect diff regions for non-matching images', async () => {
    const result = await engine.compare({
      baselinePath: path.join(FIXTURES, 'baseline.png'),
      actualPath: path.join(FIXTURES, 'actual-diff.png'),
      diffPath: path.join(TMP, 'regions-diff.png'),
      threshold: 0.01,
    });

    expect(result.diffRegions.length).toBeGreaterThan(0);
    for (const region of result.diffRegions) {
      expect(region.bounds).toHaveProperty('x');
      expect(region.bounds).toHaveProperty('y');
      expect(region.bounds).toHaveProperty('width');
      expect(region.bounds).toHaveProperty('height');
      expect(region.pixels).toBeGreaterThan(0);
    }
  });

  it('should respect antialiasing option', async () => {
    const withAA = await engine.compare({
      baselinePath: path.join(FIXTURES, 'baseline.png'),
      actualPath: path.join(FIXTURES, 'actual-diff.png'),
      diffPath: path.join(TMP, 'aa-on.png'),
      threshold: 0.01,
      antialiasing: true,
    });

    const withoutAA = await engine.compare({
      baselinePath: path.join(FIXTURES, 'baseline.png'),
      actualPath: path.join(FIXTURES, 'actual-diff.png'),
      diffPath: path.join(TMP, 'aa-off.png'),
      threshold: 0.01,
      antialiasing: false,
    });

    // Both should detect differences (these fixtures have solid color regions)
    expect(withAA.match).toBe(false);
    expect(withoutAA.match).toBe(false);
  });
});
