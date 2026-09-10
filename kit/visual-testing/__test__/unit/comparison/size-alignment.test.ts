/**
 * 尺寸不一致时 pad / crop 两种对齐方式的行为差异
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { PixelComparisonEngine } from '../../../src/core/comparison/pixel-engine';
import { cropToIntersection } from '../../../src/utils/image';

let dir: string;

function white(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return PNG.sync.write(png);
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-align-'));
  await fs.writeFile(path.join(dir, 'a.png'), white(200, 100));
  await fs.writeFile(path.join(dir, 'b.png'), white(200, 104)); // 高 4px，其余完全相同
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('cropToIntersection', () => {
  it('crops both images to the min size', () => {
    const a = PNG.sync.read(white(200, 100));
    const b = PNG.sync.read(white(200, 104));
    const out = cropToIntersection(a, b);
    expect([out.width, out.height]).toEqual([200, 100]);
    expect([out.aligned2.width, out.aligned2.height]).toEqual([200, 100]);
    expect(out.aligned1).toBe(a); // 无需裁剪时返回原对象
  });
});

describe('PixelComparisonEngine sizeAlignment', () => {
  const engine = new PixelComparisonEngine();

  it('pad: the extra strip counts as mismatch and yields an edge region', async () => {
    const r = await engine.compare({
      baselinePath: path.join(dir, 'a.png'),
      actualPath: path.join(dir, 'b.png'),
      diffPath: path.join(dir, 'diff-pad.png'),
      threshold: 0,
    });
    expect(r.sizeDiff).not.toBeNull();
    expect(r.mismatchPixels).toBe(200 * 4);
    expect(r.match).toBe(false);
    expect(r.diffRegions.length).toBeGreaterThan(0);
    expect(r.diffRegions[0]!.bounds.y).toBeGreaterThanOrEqual(100);
  });

  it('crop: identical content within the intersection produces no regions', async () => {
    const r = await engine.compare({
      baselinePath: path.join(dir, 'a.png'),
      actualPath: path.join(dir, 'b.png'),
      diffPath: path.join(dir, 'diff-crop.png'),
      threshold: 0,
      sizeAlignment: 'crop',
    });
    expect(r.sizeDiff).not.toBeNull(); // 仍然报告尺寸差，供上层提示
    expect(r.mismatchPixels).toBe(0);
    expect(r.totalPixels).toBe(200 * 100);
    expect(r.match).toBe(true);
    expect(r.diffRegions).toEqual([]);
  });
});
