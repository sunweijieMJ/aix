/**
 * 像素比对引擎
 *
 * 基于 pixelmatch 进行逐像素比对，输出差异图和差异统计。
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import path from 'node:path';
import { readPNG, writePNG, alignImages } from '../../utils/image';
import { ensureDir } from '../../utils/file';
import { logger } from '../../utils/logger';
import type {
  ComparisonEngine,
  CompareOptions,
  CompareResult,
  SizeDiff,
} from '../../types/comparison';
import { analyzeDiffRegions } from './region-analyzer';

const log = logger.child('PixelEngine');

export class PixelComparisonEngine implements ComparisonEngine {
  readonly name = 'pixel';

  async compare(options: CompareOptions): Promise<CompareResult> {
    const {
      baselinePath,
      actualPath,
      diffPath,
      colorThreshold = 0.1,
      threshold = 0.01,
      antialiasing = true,
    } = options;

    log.debug(`Comparing: ${baselinePath} vs ${actualPath}`);

    // 1. 读取图片
    const baseline = await readPNG(baselinePath);
    const actual = await readPNG(actualPath);

    // 2. 检查尺寸差异
    const sizeDiff = this.checkSizeDiff(baseline, actual);

    // 3. 对齐尺寸
    const { aligned1, aligned2, width, height } = alignImages(baseline, actual);

    // 4. 创建差异图
    const diff = new PNG({ width, height });

    // 5. 执行比对
    const mismatchPixels = pixelmatch(
      aligned1.data,
      aligned2.data,
      diff.data,
      width,
      height,
      {
        threshold: colorThreshold,
        includeAA: !antialiasing,
        diffColor: [255, 0, 0],
        diffColorAlt: [0, 255, 0],
        alpha: 0.3,
      },
    );

    const totalPixels = width * height;
    const mismatchPercentage = (mismatchPixels / totalPixels) * 100;
    const match = mismatchPercentage <= threshold * 100;

    // 6. 保存差异图（仅在有差异时）
    let savedDiffPath: string | null = null;
    if (!match) {
      await ensureDir(path.dirname(diffPath));
      await writePNG(diff, diffPath);
      savedDiffPath = diffPath;
    }

    // 7. 分析差异区域
    const diffRegions = match ? [] : analyzeDiffRegions(diff);

    log.debug(
      `Compare result: ${mismatchPercentage.toFixed(2)}% mismatch (${mismatchPixels}/${totalPixels} pixels)`,
    );

    return {
      match,
      mismatchPercentage,
      mismatchPixels,
      totalPixels,
      diffPath: savedDiffPath,
      sizeDiff,
      diffRegions,
    };
  }

  private checkSizeDiff(baseline: PNG, actual: PNG): SizeDiff | null {
    if (baseline.width !== actual.width || baseline.height !== actual.height) {
      return {
        baseline: { width: baseline.width, height: baseline.height },
        actual: { width: actual.width, height: actual.height },
      };
    }
    return null;
  }
}
