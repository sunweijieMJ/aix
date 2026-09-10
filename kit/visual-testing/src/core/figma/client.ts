/**
 * Figma REST API 客户端
 *
 * 与 baseline 的 FigmaApiProvider 和 fidelity 的 FigmaSpecExtractor 共用。
 * 职责：鉴权、错误归类（含 scope 提示）、429 退避重试、位图下载。
 * 不做缓存，缓存由调用方按 (fileKey, nodeId, version) 处理。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { ensureDir } from '../../utils/file';
import { logger } from '../../utils/logger';
import type { FigmaFileMeta, FigmaImagesResponse, FigmaNode, FigmaNodesResponse } from './types';

const log = logger.child('FigmaClient');

const DEFAULT_BASE_URL = 'https://api.figma.com';
const DEFAULT_MAX_RETRIES = 3;

export class FigmaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = 'FigmaApiError';
  }
}

export interface FigmaClientOptions {
  accessToken: string;
  baseUrl?: string;
  /** 便于测试注入 */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

function safePath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

/**
 * 从配置与环境变量解析 Figma token；缺失时抛出带获取路径的错误
 */
export function resolveFigmaToken(configured?: string): string {
  const token = configured ?? process.env.FIGMA_TOKEN ?? process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'Figma access token is missing. Set FIGMA_TOKEN (or baseline.figma.accessToken). ' +
        'Create one at Figma → Settings → Security → Personal access tokens, ' +
        'with scopes "file_content:read" and "file_metadata:read".',
    );
  }
  return token;
}

export class FigmaClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(options: FigmaClientOptions) {
    this.token = options.accessToken;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * 文件元信息（轻量，用于缓存键）
   */
  async getFileMeta(fileKey: string): Promise<FigmaFileMeta> {
    const data = await this.request<Record<string, unknown>>(`/v1/files/${fileKey}/meta`);
    // /meta 返回 { file: {...} }；兼容直接平铺的形态
    const file = (data.file as Record<string, unknown> | undefined) ?? data;
    return {
      name: String(file.name ?? ''),
      version: String(file.version ?? ''),
      lastModified: String(file.last_touched_at ?? file.lastModified ?? ''),
    };
  }

  /**
   * 获取指定节点的子树
   */
  async getNodes(fileKey: string, nodeIds: string[]): Promise<FigmaNodesResponse> {
    const ids = nodeIds.map((id) => encodeURIComponent(id)).join(',');
    const data = await this.request<FigmaNodesResponse>(`/v1/files/${fileKey}/nodes?ids=${ids}`);

    for (const id of nodeIds) {
      if (!data.nodes?.[id]) {
        throw new FigmaApiError(
          `Node "${id}" not found in file "${fileKey}". Check the node-id in the Figma URL.`,
          404,
          `/v1/files/${fileKey}/nodes`,
        );
      }
    }
    return data;
  }

  /**
   * 获取单个节点
   */
  async getNode(
    fileKey: string,
    nodeId: string,
  ): Promise<{ node: FigmaNode; version: string; lastModified: string }> {
    const data = await this.getNodes(fileKey, [nodeId]);
    return {
      node: data.nodes[nodeId]!.document,
      version: data.version,
      lastModified: data.lastModified,
    };
  }

  /**
   * 请求位图渲染，返回 nodeId → 临时下载 URL
   */
  async getImageUrls(
    fileKey: string,
    nodeIds: string[],
    options: { scale?: number; format?: 'png' | 'jpg' | 'svg' } = {},
  ): Promise<Record<string, string | null>> {
    const { scale = 1, format = 'png' } = options;
    const ids = nodeIds.map((id) => encodeURIComponent(id)).join(',');
    const data = await this.request<FigmaImagesResponse>(
      `/v1/images/${fileKey}?ids=${ids}&format=${format}&scale=${scale}`,
    );
    if (data.err) {
      throw new FigmaApiError(
        `Figma image render failed: ${data.err}`,
        500,
        `/v1/images/${fileKey}`,
      );
    }
    return data.images ?? {};
  }

  /**
   * 渲染并下载单个节点位图到 outputPath
   */
  async downloadNodeImage(
    fileKey: string,
    nodeId: string,
    outputPath: string,
    options: { scale?: number } = {},
  ): Promise<void> {
    const urls = await this.getImageUrls(fileKey, [nodeId], {
      scale: options.scale,
      format: 'png',
    });
    const url = urls[nodeId];
    if (!url) {
      throw new FigmaApiError(
        `Figma did not return an image for node "${nodeId}" (node may be empty or invisible).`,
        404,
        `/v1/images/${fileKey}`,
      );
    }
    await this.downloadFile(url, outputPath);
  }

  /**
   * 下载任意 URL 到本地（位图 URL 为 S3 临时链接，不需要鉴权）
   */
  async downloadFile(url: string, outputPath: string): Promise<void> {
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      // 只记录路径，不把带签名的 S3 预签名 URL 存进错误对象
      throw new FigmaApiError(
        `Failed to download image: ${response.status} ${response.statusText}`,
        response.status,
        safePath(url),
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, buffer);
    log.debug(`Downloaded ${buffer.length} bytes → ${outputPath}`);
  }

  // ---- 内部 ----

  private async request<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { 'X-Figma-Token': this.token },
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          await this.sleep(500 * 2 ** attempt);
          continue;
        }
        throw new FigmaApiError(
          `Network error calling Figma API: ${lastError.message}`,
          0,
          endpoint,
        );
      }

      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after')) || 2 ** attempt;
        log.warn(
          `Figma API rate limited, retrying in ${retryAfter}s (${attempt + 1}/${this.maxRetries})`,
        );
        await this.sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new FigmaApiError(
          await this.describeError(response, endpoint),
          response.status,
          endpoint,
        );
      }

      return (await response.json()) as T;
    }

    throw lastError ?? new FigmaApiError('Figma API request failed', 0, endpoint);
  }

  private async describeError(response: Response, endpoint: string): Promise<string> {
    let detail = '';
    try {
      const body = (await response.json()) as { err?: string; message?: string };
      detail = body.err ?? body.message ?? '';
    } catch {
      /* ignore */
    }

    const base = `Figma API ${response.status} on ${endpoint}${detail ? `: ${detail}` : ''}`;
    switch (response.status) {
      case 401:
        return `${base}. The access token is invalid or expired.`;
      case 403:
        return (
          `${base}. The token lacks permission. Personal access tokens need scope ` +
          `"file_content:read" for nodes/images and "file_metadata:read" for /meta, ` +
          'and the token owner must have access to the file.'
        );
      case 404:
        return `${base}. Check the fileKey in the Figma URL.`;
      case 429:
        return `${base}. Rate limit exceeded; try again later or reduce concurrency.`;
      default:
        return base;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
