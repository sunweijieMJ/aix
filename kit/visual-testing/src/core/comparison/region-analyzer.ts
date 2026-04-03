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
 *
 * 使用网格坐标哈希表实现 O(n) 邻接查找，
 * 避免对每个格子全量遍历（原 O(n²) 在高分辨率大量差异格子时有性能风险）。
 */
function mergeAdjacentCells(
  cells: Array<{ x: number; y: number; w: number; h: number; pixels: number }>,
): DiffRegion[] {
  if (cells.length === 0) return [];

  // 构建网格坐标 → cell 索引的查找表
  const cellMap = new Map<string, number>();
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    const gx = cell.x / GRID_SIZE;
    const gy = cell.y / GRID_SIZE;
    cellMap.set(`${gx},${gy}`, i);
  }

  // 8 个邻居方向（包括对角）+ 额外 1 格间距容差（共 24 个方向）
  const neighborOffsets: Array<[number, number]> = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      neighborOffsets.push([dx, dy]);
    }
  }

  const visited = new Set<number>();
  const regions: DiffRegion[] = [];

  for (let i = 0; i < cells.length; i++) {
    if (visited.has(i)) continue;

    // BFS 合并相邻格子
    const queue = [i];
    visited.add(i);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let totalPixels = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const cell = cells[current]!;

      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x + cell.w);
      maxY = Math.max(maxY, cell.y + cell.h);
      totalPixels += cell.pixels;

      // 只查找有限方向的邻居，而非遍历全部格子
      const gx = cell.x / GRID_SIZE;
      const gy = cell.y / GRID_SIZE;
      for (const [dx, dy] of neighborOffsets) {
        const neighborIdx = cellMap.get(`${gx + dx},${gy + dy}`);
        if (neighborIdx !== undefined && !visited.has(neighborIdx)) {
          visited.add(neighborIdx);
          queue.push(neighborIdx);
        }
      }
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
