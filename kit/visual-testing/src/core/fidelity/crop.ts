/**
 * 按差异区域裁图，并把区域与设计节点关联
 */

import path from 'node:path';
import { PNG } from 'pngjs';

import { ensureDir } from '../../utils/file';
import { readPNG, writePNG } from '../../utils/image';
import type { DiffRegion } from '../../types/comparison';
import { walkDesign } from './figma-spec-extractor';
import type { Bounds, DesignNode, FidelityRegion } from './types';

export interface CropOptions {
  designImagePath: string;
  renderImagePath: string;
  outputDir: string;
  padding: number;
  /** 图片像素 / CSS 像素 */
  scale: number;
}

/**
 * 为每个差异区域生成设计图与实现图的裁片，并反查相交的设计节点
 */
export async function cropRegions(
  regions: DiffRegion[],
  design: DesignNode,
  options: CropOptions,
): Promise<FidelityRegion[]> {
  if (regions.length === 0) return [];

  await ensureDir(options.outputDir);
  const [designPng, renderPng] = await Promise.all([
    readPNG(options.designImagePath),
    readPNG(options.renderImagePath),
  ]);

  const out: FidelityRegion[] = [];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]!;
    // DiffRegion 的 bounds 是图片像素；转成 CSS 像素供关联与报告
    const cssBounds: Bounds = {
      x: region.bounds.x / options.scale,
      y: region.bounds.y / options.scale,
      width: region.bounds.width / options.scale,
      height: region.bounds.height / options.scale,
    };

    const padded = pad(region.bounds, options.padding * options.scale);
    const cropDesign = path.join(options.outputDir, `region-${i + 1}-design.png`);
    const cropRender = path.join(options.outputDir, `region-${i + 1}-render.png`);

    await Promise.all([
      writePNG(cropPng(designPng, padded), cropDesign),
      writePNG(cropPng(renderPng, padded), cropRender),
    ]);

    out.push({
      bounds: roundBounds(cssBounds),
      pixels: region.pixels,
      cropDesign,
      cropRender,
      relatedNodeIds: findRelatedNodes(design, cssBounds),
    });
  }
  return out;
}

/**
 * 区域是否「无法用结构化差异解释」：
 * 没有相关节点，或相关节点全部已匹配且 diffs 为空
 */
export function isUnexplainedRegion(
  region: FidelityRegion,
  matches: Array<{ design: { id: string }; render: unknown | null; diffs: unknown[] }>,
): boolean {
  if (region.relatedNodeIds.length === 0) return true;
  return region.relatedNodeIds.every((id) => {
    const m = matches.find((x) => x.design.id === id);
    return m !== undefined && m.render !== null && m.diffs.length === 0;
  });
}

/**
 * 找到与区域相交面积占节点自身 ≥ 30% 的叶子优先节点
 */
export function findRelatedNodes(design: DesignNode, region: Bounds, maxNodes = 5): string[] {
  const hits: { id: string; ratio: number; area: number }[] = [];
  walkDesign(design, (n) => {
    if (n === design) return;
    const inter = intersectArea(n.bounds, region);
    const area = n.bounds.width * n.bounds.height;
    if (area <= 0 || inter <= 0) return;
    const ratio = inter / area;
    if (ratio >= 0.3) hits.push({ id: n.id, ratio, area });
  });
  // 小节点（更具体）优先
  hits.sort((a, b) => a.area - b.area);
  return hits.slice(0, maxNodes).map((h) => h.id);
}

function intersectArea(a: Bounds, b: Bounds): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function pad(b: Bounds, p: number): Bounds {
  return { x: b.x - p, y: b.y - p, width: b.width + p * 2, height: b.height + p * 2 };
}

function roundBounds(b: Bounds): Bounds {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height) };
}

/**
 * 从 PNG 裁出区域（越界部分填透明）
 */
export function cropPng(src: PNG, region: Bounds): PNG {
  const x0 = Math.floor(region.x);
  const y0 = Math.floor(region.y);
  const w = Math.max(1, Math.ceil(region.width));
  const h = Math.max(1, Math.ceil(region.height));
  const dst = new PNG({ width: w, height: h });
  dst.data.fill(0);

  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= src.width) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
  return dst;
}
