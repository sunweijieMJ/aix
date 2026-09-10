/**
 * Figma REST API 基准图提供器（推荐）
 *
 * 通过 /v1/images 渲染并下载节点位图。与 MCP 方案相比：
 * - 单次 HTTP 调用，无子进程、无 stdio 传输
 * - token 可传、错误可归类（401/403/404/429）
 * - 按 (fileKey, nodeId, scale, version) 缓存，文件未改动时不重复下载
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { copyFile, ensureDir, pathExists } from '../../utils/file';
import { hashFile } from '../../utils/hash';
import { getImageDimensions } from '../../utils/image';
import { logger } from '../../utils/logger';
import { FigmaClient, resolveFigmaToken } from '../figma/client';
import { parseFigmaRef } from '../figma/url';
import type {
  BaselineMetadata,
  BaselineProvider,
  BaselineResult,
  BaselineSource,
  FetchBaselineOptions,
} from './types';

const log = logger.child('FigmaApiProvider');

const DEFAULT_SCALE = 1;

export interface FigmaApiProviderOptions {
  fileKey?: string;
  accessToken?: string;
  /** 缓存目录；不传则不缓存 */
  cacheDir?: string;
  /** 忽略缓存强制重新下载 */
  refresh?: boolean;
  /** 便于测试注入 */
  client?: FigmaClient;
}

interface CacheEntry {
  version: string;
  lastModified: string;
  fetchedAt: string;
}

export class FigmaApiProvider implements BaselineProvider {
  readonly name = 'figma-api';

  private readonly defaultFileKey?: string;
  private readonly cacheDir?: string;
  private readonly refresh: boolean;
  private readonly accessToken?: string;
  private client: FigmaClient | null;
  /** 同一次运行内 fileKey → version，避免每个节点都请求 /meta */
  private versionCache = new Map<string, Promise<{ version: string; lastModified: string }>>();

  constructor(options: FigmaApiProviderOptions = {}) {
    this.defaultFileKey = options.fileKey;
    this.cacheDir = options.cacheDir;
    this.refresh = options.refresh ?? false;
    this.accessToken = options.accessToken;
    this.client = options.client ?? null;
  }

  async fetch(options: FetchBaselineOptions): Promise<BaselineResult> {
    const { source, outputPath, scale = DEFAULT_SCALE } = options;

    let fileKey: string;
    let nodeId: string;
    try {
      const ref = this.resolveRef(source);
      fileKey = ref.fileKey;
      nodeId = ref.nodeId;
    } catch (error) {
      return { path: outputPath, success: false, error: error as Error };
    }

    try {
      const client = this.getClient();
      const { version, lastModified } = await this.getVersion(client, fileKey);

      const cachePath = this.getCachePath(fileKey, nodeId, scale);
      const useCache = cachePath && !this.refresh;
      let fromCache = false;

      if (useCache && (await this.isCacheValid(cachePath, version))) {
        await copyFile(cachePath, outputPath);
        fromCache = true;
        log.debug(`Figma baseline from cache: ${nodeId} (v${version})`);
      } else {
        await client.downloadNodeImage(fileKey, nodeId, outputPath, { scale });
        if (cachePath) {
          await this.writeCache(cachePath, outputPath, { version, lastModified });
        }
      }

      const [dimensions, hash] = await Promise.all([
        getImageDimensions(outputPath),
        hashFile(outputPath),
      ]);

      const metadata: BaselineMetadata = {
        dimensions,
        hash,
        fetchedAt: new Date().toISOString(),
        figmaInfo: { fileKey, nodeId, version, lastModified },
      };

      log.info(
        `Figma baseline ${fromCache ? 'cached' : 'fetched'}: ${path.basename(outputPath)} ` +
          `(${dimensions.width}x${dimensions.height} @${scale}x)`,
      );

      return { path: outputPath, success: true, metadata };
    } catch (error) {
      log.error('Failed to fetch Figma baseline', error as Error);
      return { path: outputPath, success: false, error: error as Error };
    }
  }

  async exists(source: string | BaselineSource): Promise<boolean> {
    try {
      const { fileKey, nodeId } = this.resolveRef(source);
      await this.getClient().getNode(fileKey, nodeId);
      return true;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    this.versionCache.clear();
  }

  // ---- 内部 ----

  private getClient(): FigmaClient {
    if (!this.client) {
      this.client = new FigmaClient({ accessToken: resolveFigmaToken(this.accessToken) });
    }
    return this.client;
  }

  private resolveRef(source: string | BaselineSource): { fileKey: string; nodeId: string } {
    if (typeof source === 'string') {
      return parseFigmaRef(source, this.defaultFileKey);
    }
    return parseFigmaRef(source.source, source.fileKey ?? this.defaultFileKey);
  }

  private getVersion(
    client: FigmaClient,
    fileKey: string,
  ): Promise<{ version: string; lastModified: string }> {
    let pending = this.versionCache.get(fileKey);
    if (!pending) {
      pending = client
        .getFileMeta(fileKey)
        .then((meta) => ({ version: meta.version, lastModified: meta.lastModified }))
        .catch((error: unknown) => {
          // /meta 需要 file_metadata:read；拿不到版本时退化为不缓存，而不是整体失败
          log.warn(
            `Cannot read Figma file version (${(error as Error).message}); caching disabled for ${fileKey}`,
          );
          return { version: '', lastModified: '' };
        });
      this.versionCache.set(fileKey, pending);
    }
    return pending;
  }

  private getCachePath(fileKey: string, nodeId: string, scale: number): string | null {
    if (!this.cacheDir) return null;
    const safeNode = nodeId.replace(/[^0-9A-Za-z_-]/g, '-');
    return path.join(this.cacheDir, fileKey, `${safeNode}@${scale}x.png`);
  }

  private async isCacheValid(cachePath: string, version: string): Promise<boolean> {
    if (!version) return false;
    if (!(await pathExists(cachePath))) return false;
    try {
      const raw = await fs.readFile(`${cachePath}.json`, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry;
      return entry.version === version;
    } catch {
      return false;
    }
  }

  private async writeCache(
    cachePath: string,
    sourcePath: string,
    info: { version: string; lastModified: string },
  ): Promise<void> {
    if (!info.version) return;
    try {
      await ensureDir(path.dirname(cachePath));
      await copyFile(sourcePath, cachePath);
      const entry: CacheEntry = { ...info, fetchedAt: new Date().toISOString() };
      await fs.writeFile(`${cachePath}.json`, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error) {
      log.warn('Failed to write Figma cache', error as Error);
    }
  }
}
