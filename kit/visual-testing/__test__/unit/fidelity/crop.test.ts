import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  cropRegions,
  cropPng,
  findRelatedNodes,
  isUnexplainedRegion,
} from '../../../src/core/fidelity/crop';
import { readPNG } from '../../../src/utils/image';
import type { DesignNode } from '../../../src/core/fidelity/types';

let dir: string;

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

const node = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  children: DesignNode[] = [],
): DesignNode => ({
  id,
  name: id,
  type: 'FRAME',
  visible: true,
  bounds: { x, y, width: w, height: h },
  opacity: 1,
  fills: [],
  fillKind: 'none',
  strokes: [],
  cornerRadius: [0, 0, 0, 0],
  effects: [],
  isLeaf: false,
  children,
});

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-crop-'));
  // 2x 图：CSS 100x50 → 像素 200x100
  await fs.writeFile(path.join(dir, 'design.png'), solidPng(200, 100, [255, 255, 255]));
  await fs.writeFile(path.join(dir, 'render.png'), solidPng(200, 100, [0, 0, 0]));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('cropPng', () => {
  it('crops with transparent padding outside the source', () => {
    const src = PNG.sync.read(solidPng(10, 10, [255, 0, 0]));
    const out = cropPng(src, { x: -2, y: -2, width: 6, height: 6 });
    expect(out.width).toBe(6);
    expect(out.height).toBe(6);
    expect(out.data[3]).toBe(0); // (0,0) 越界 → 透明
    const inIdx = (3 * 6 + 3) * 4; // (3,3) 对应源 (1,1)
    expect(out.data[inIdx]).toBe(255);
    expect(out.data[inIdx + 3]).toBe(255);
  });
});

describe('cropRegions @2x', () => {
  it('converts image-pixel regions to CSS px and pads crops in image pixels', async () => {
    const design = node('root', 0, 0, 100, 50, [
      node('a', 10, 10, 20, 10),
      node('b', 60, 20, 30, 20),
    ]);
    // 像素区域 (20,20) 40x20 → CSS (10,10) 20x10，正好覆盖节点 a
    const regions = await cropRegions(
      [{ bounds: { x: 20, y: 20, width: 40, height: 20 }, pixels: 100, type: 'unknown' }],
      design,
      {
        designImagePath: path.join(dir, 'design.png'),
        renderImagePath: path.join(dir, 'render.png'),
        outputDir: path.join(dir, 'crops'),
        padding: 4,
        scale: 2,
      },
    );

    expect(regions).toHaveLength(1);
    const r = regions[0]!;
    expect(r.bounds).toEqual({ x: 10, y: 10, width: 20, height: 10 });
    expect(r.relatedNodeIds).toEqual(['a']);

    // 裁片尺寸 = 像素区域 + 两侧 padding×scale
    const crop = await readPNG(r.cropDesign!);
    expect(crop.width).toBe(40 + 4 * 2 * 2);
    expect(crop.height).toBe(20 + 4 * 2 * 2);
  });
});

describe('findRelatedNodes / isUnexplainedRegion', () => {
  const design = node('root', 0, 0, 100, 100, [
    node('big', 0, 0, 100, 100, [node('small', 10, 10, 10, 10)]),
  ]);

  it('prefers smaller nodes and requires ≥30% overlap of the node itself', () => {
    expect(findRelatedNodes(design, { x: 8, y: 8, width: 14, height: 14 })).toEqual(['small']);
    expect(findRelatedNodes(design, { x: 0, y: 0, width: 100, height: 100 })).toEqual([
      'small',
      'big',
    ]);
    expect(findRelatedNodes(design, { x: 90, y: 90, width: 5, height: 5 })).toEqual([]);
  });

  it('marks regions unexplained when no related node has diffs', () => {
    const region = {
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      pixels: 1,
      relatedNodeIds: ['small'],
    };
    const matched = [{ design: { id: 'small' }, render: {}, diffs: [] }];
    const missing = [{ design: { id: 'small' }, render: null, diffs: [] }];
    const withDiff = [{ design: { id: 'small' }, render: {}, diffs: [{}] }];
    expect(isUnexplainedRegion(region, matched)).toBe(true);
    expect(isUnexplainedRegion(region, missing)).toBe(false);
    expect(isUnexplainedRegion(region, withDiff)).toBe(false);
    expect(isUnexplainedRegion({ ...region, relatedNodeIds: [] }, matched)).toBe(true);
  });
});
