/**
 * 差异区域分析器
 *
 * 分析差异图中的像素位置，识别差异区域（网格聚类），
 * 提取区域边界框。
 */

import type { PNG } from 'pngjs';
import type { DiffRegion } from '../../types/comparison';

/** 网格单元大小（像素） */
const GRID_SIZE = 50;

/** 单元格差异像素占比阈值 */
const CELL_THRESHOLD = 0.1;

/**
 * 分析差异图，提取差异区域
 *
 * 将差异图划分为固定大小的网格，统计每个格子中的差异像素数量，
 * 超过阈值的格子标记为差异区域，然后合并相邻区域。
 */
export function analyzeDiffRegions(diff: PNG): DiffRegion[] {
  const gridWidth = Math.ceil(diff.width / GRID_SIZE);
  const gridHeight = Math.ceil(diff.height / GRID_SIZE);

  // 1. 扫描网格
  const cells: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    pixels: number;
  }> = [];

  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const x = gx * GRID_SIZE;
      const y = gy * GRID_SIZE;
      const w = Math.min(GRID_SIZE, diff.width - x);
      const h = Math.min(GRID_SIZE, diff.height - y);

      let diffPixels = 0;

      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          const idx = (py * diff.width + px) * 4;
          // 差异像素：红色通道 > 200（实际图特有）或绿色通道 > 200（基准图特有）
          const r = diff.data[idx]!;
          const g = diff.data[idx + 1]!;
          if (r > 200 || g > 200) {
            diffPixels++;
          }
        }
      }

      if (diffPixels > w * h * CELL_THRESHOLD) {
        cells.push({ x, y, w, h, pixels: diffPixels });
      }
    }
  }

  // 2. 合并相邻单元格为区域
  return mergeAdjacentCells(cells);
}

/**
 * 合并相邻的差异单元格为更大的区域
 */
function mergeAdjacentCells(
  cells: Array<{ x: number; y: number; w: number; h: number; pixels: number }>,
): DiffRegion[] {
  if (cells.length === 0) return [];

  const visited = new Set<number>();
  const regions: DiffRegion[] = [];

  for (let i = 0; i < cells.length; i++) {
    if (visited.has(i)) continue;

    // BFS 合并相邻格子
    const group: number[] = [];
    const queue = [i];
    visited.add(i);

    while (queue.length > 0) {
      const current = queue.shift()!;
      group.push(current);

      for (let j = 0; j < cells.length; j++) {
        if (visited.has(j)) continue;
        if (areCellsAdjacent(cells[current]!, cells[j]!)) {
          visited.add(j);
          queue.push(j);
        }
      }
    }

    // 计算合并后的边界框
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let totalPixels = 0;

    for (const idx of group) {
      const cell = cells[idx]!;
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x + cell.w);
      maxY = Math.max(maxY, cell.y + cell.h);
      totalPixels += cell.pixels;
    }

    regions.push({
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      pixels: totalPixels,
      type: 'unknown',
    });
  }

  return regions;
}

/**
 * 判断两个格子是否相邻（包括对角相邻）
 */
function areCellsAdjacent(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  // 允许 1 个格子间距的容差
  const tolerance = GRID_SIZE;
  const xOverlap = a.x < b.x + b.w + tolerance && b.x < a.x + a.w + tolerance;
  const yOverlap = a.y < b.y + b.h + tolerance && b.y < a.y + a.h + tolerance;
  return xOverlap && yOverlap;
}
