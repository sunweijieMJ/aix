/**
 * 测试 fixture 生成脚本
 *
 * 生成用于单元测试的 PNG 图片：
 * - baseline.png: 纯蓝色矩形
 * - actual-match.png: 与 baseline 相同
 * - actual-diff.png: 包含红色区域的差异图
 * - small.png: 较小尺寸的图片（测试尺寸差异）
 *
 * 运行: npx tsx __test__/fixtures/create-fixtures.ts
 */

import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES_DIR = path.dirname(new URL(import.meta.url).pathname);

function createSolidPNG(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return png;
}

function createPNGWithRegion(
  width: number,
  height: number,
  bgR: number,
  bgG: number,
  bgB: number,
  region: {
    x: number;
    y: number;
    w: number;
    h: number;
    r: number;
    g: number;
    b: number;
  },
): PNG {
  const png = createSolidPNG(width, height, bgR, bgG, bgB);
  for (let y = region.y; y < region.y + region.h && y < height; y++) {
    for (let x = region.x; x < region.x + region.w && x < width; x++) {
      const idx = (y * width + x) << 2;
      png.data[idx] = region.r;
      png.data[idx + 1] = region.g;
      png.data[idx + 2] = region.b;
      png.data[idx + 3] = 255;
    }
  }
  return png;
}

function writePNG(png: PNG, filename: string): void {
  const filePath = path.join(FIXTURES_DIR, filename);
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(filePath, buffer);
  console.log(`Created: ${filePath}`);
}

// 100x100 纯蓝色（基准图）
writePNG(createSolidPNG(100, 100, 0, 0, 255), 'baseline.png');

// 100x100 纯蓝色（完全匹配）
writePNG(createSolidPNG(100, 100, 0, 0, 255), 'actual-match.png');

// 100x100 蓝色底+红色区域（有差异）
writePNG(
  createPNGWithRegion(100, 100, 0, 0, 255, {
    x: 20,
    y: 20,
    w: 30,
    h: 30,
    r: 255,
    g: 0,
    b: 0,
  }),
  'actual-diff.png',
);

// 50x50 纯蓝色（尺寸不同）
writePNG(createSolidPNG(50, 50, 0, 0, 255), 'small.png');

console.log('All fixtures created.');
