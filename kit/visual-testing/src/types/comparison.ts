/**
 * 比对引擎相关类型定义
 */

export interface ComparisonEngine {
  readonly name: string;
  compare(options: CompareOptions): Promise<CompareResult>;
}

export interface CompareOptions {
  /** 基准图路径 */
  baselinePath: string;
  /** 实际图路径 */
  actualPath: string;
  /** 差异图输出路径 */
  diffPath: string;
  /** pixelmatch 颜色容差 (0-1)，值越大越宽容。默认 0.1 */
  colorThreshold?: number;
  /** 差异百分比阈值 (0-1)，低于此值视为匹配。如 0.01 = 1%。默认 0.01 */
  threshold?: number;
  /** 忽略抗锯齿 */
  antialiasing?: boolean;
}

export interface CompareResult {
  /** 是否匹配 */
  match: boolean;
  /** 差异百分比 */
  mismatchPercentage: number;
  /** 差异像素数 */
  mismatchPixels: number;
  /** 总像素数 */
  totalPixels: number;
  /** 差异图路径 */
  diffPath: string | null;
  /** 尺寸差异 */
  sizeDiff: SizeDiff | null;
  /** 差异区域 */
  diffRegions: DiffRegion[];
}

export interface SizeDiff {
  baseline: { width: number; height: number };
  actual: { width: number; height: number };
}

export interface DiffRegion {
  /** 区域边界 */
  bounds: { x: number; y: number; width: number; height: number };
  /** 区域差异像素数 */
  pixels: number;
  /** 差异类型推测 */
  type: 'color' | 'position' | 'missing' | 'extra' | 'unknown';
}
