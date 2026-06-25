/**
 * analyzeDiffRegions 单元测试
 *
 * 重点回归 Bug：pixelmatch 生成的 diff 图里，未变化像素被画成灰阶（浅色背景接近白色），
 * 抗锯齿像素被画成黄色 [255,255,0]。区域分析必须只把"纯红/纯绿"差异像素计入，
 * 否则浅色 UI 上整图会被误判为一个巨大差异区域。
 */

import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { analyzeDiffRegions } from '../../../src/core/comparison/region-analyzer';

type RGBA = [number, number, number, number];

/**
 * 构造一张 diff 图：先用背景色铺满，再可选地在矩形区域内填充前景色。
 */
function makeDiffPNG(
  width: number,
  height: number,
  background: RGBA,
  rect?: { x: number; y: number; w: number; h: number; color: RGBA },
): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inRect =
        rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      const [r, g, b, a] = inRect ? rect!.color : background;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return png;
}

// pixelmatch 的差异配色（与 pixel-engine 配置一致）
const RED: RGBA = [255, 0, 0, 255]; // diffColor：实际图特有
const GREEN: RGBA = [0, 255, 0, 255]; // diffColorAlt：基准图特有
const YELLOW: RGBA = [255, 255, 0, 255]; // 抗锯齿像素
const WHITE_BG: RGBA = [255, 255, 255, 255]; // 未变化的白色背景（灰阶后仍为 255）
const LIGHT_GRAY_BG: RGBA = [230, 230, 230, 255]; // 未变化的浅灰背景（灰阶后 >200）

describe('analyzeDiffRegions', () => {
  it('纯白背景（无差异像素）不产生任何区域', () => {
    const diff = makeDiffPNG(100, 100, WHITE_BG);
    expect(analyzeDiffRegions(diff)).toEqual([]);
  });

  it('[Bug 回归] 浅灰背景不得被误判为差异区域', () => {
    // 旧实现 `r>200||g>200` 会把每个像素都算成差异 → 整图变成一个巨大区域
    const diff = makeDiffPNG(100, 100, LIGHT_GRAY_BG);
    expect(analyzeDiffRegions(diff)).toEqual([]);
  });

  it('[Bug 回归] 黄色抗锯齿像素不得被计入差异区域', () => {
    // 整块黄色 AA 像素铺在白底上，不应产生区域
    const diff = makeDiffPNG(100, 100, WHITE_BG, {
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      color: YELLOW,
    });
    expect(analyzeDiffRegions(diff)).toEqual([]);
  });

  it('纯红差异块在浅灰背景上能被正确识别为一个区域', () => {
    const diff = makeDiffPNG(100, 100, LIGHT_GRAY_BG, {
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      color: RED,
    });
    const regions = analyzeDiffRegions(diff);
    expect(regions).toHaveLength(1);
    // 区域应覆盖左上角的红色块，且像素数贴近块大小
    expect(regions[0]!.bounds.x).toBe(0);
    expect(regions[0]!.bounds.y).toBe(0);
    expect(regions[0]!.pixels).toBe(50 * 50);
    // 浅灰背景不应混入像素统计（否则会接近 100*100）
    expect(regions[0]!.pixels).toBeLessThan(100 * 100);
  });

  it('纯绿差异块同样能被识别', () => {
    const diff = makeDiffPNG(100, 100, WHITE_BG, {
      x: 50,
      y: 50,
      w: 50,
      h: 50,
      color: GREEN,
    });
    const regions = analyzeDiffRegions(diff);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.pixels).toBe(50 * 50);
  });

  it('低于单元格阈值（<10%）的零星差异像素不形成区域', () => {
    // 在 50x50 单元格里只放极少量红色像素（远低于 250 像素阈值）
    const diff = makeDiffPNG(100, 100, WHITE_BG, {
      x: 0,
      y: 0,
      w: 3,
      h: 3,
      color: RED,
    });
    expect(analyzeDiffRegions(diff)).toEqual([]);
  });
});
