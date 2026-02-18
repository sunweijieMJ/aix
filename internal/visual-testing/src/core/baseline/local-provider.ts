/**
 * 本地文件基准图提供器
 *
 * 从本地文件系统读取基准图，复制到工作目录并提取元数据。
 */

import path from 'node:path';

import { copyFile, ensureDir, pathExists } from '../../utils/file';
import { hashFile } from '../../utils/hash';
import { getImageDimensions } from '../../utils/image';
import { logger } from '../../utils/logger';
import type {
  BaselineProvider,
  BaselineResult,
  BaselineSource,
  FetchBaselineOptions,
} from './types';

const log = logger.child('LocalProvider');

/**
 * 将来源字符串/对象标准化为文件路径
 */
function resolveLocalPath(
  source: string | BaselineSource,
  basePath?: string,
): string {
  const filePath = typeof source === 'string' ? source : source.source;

  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.resolve(basePath ?? process.cwd(), filePath);
}

export class LocalProvider implements BaselineProvider {
  readonly name = 'local';

  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.cwd();
  }

  async fetch(options: FetchBaselineOptions): Promise<BaselineResult> {
    const { source, outputPath } = options;
    const srcPath = resolveLocalPath(source, this.basePath);

    log.debug(`Fetching baseline: ${srcPath} -> ${outputPath}`);

    try {
      const exists = await pathExists(srcPath);
      if (!exists) {
        return {
          path: outputPath,
          success: false,
          error: new Error(`Baseline file not found: ${srcPath}`),
        };
      }

      await ensureDir(path.dirname(outputPath));
      await copyFile(srcPath, outputPath);

      const [dimensions, hash] = await Promise.all([
        getImageDimensions(outputPath),
        hashFile(outputPath),
      ]);

      log.info(
        `Baseline fetched: ${path.basename(outputPath)} (${dimensions.width}x${dimensions.height})`,
      );

      return {
        path: outputPath,
        success: true,
        metadata: {
          dimensions,
          hash,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      log.error('Failed to fetch baseline', error as Error);
      return {
        path: outputPath,
        success: false,
        error: error as Error,
      };
    }
  }

  async exists(source: string | BaselineSource): Promise<boolean> {
    const srcPath = resolveLocalPath(source, this.basePath);
    return pathExists(srcPath);
  }
}
