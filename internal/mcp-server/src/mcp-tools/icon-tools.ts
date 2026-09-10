/**
 * 图标相关的 MCP 工具
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ICONS_SVG_FILE, MCP_TOOLS } from '../constants';
import type { IconSearchResult, IconsIndex, ToolArguments } from '../types/index';
import { log } from '../utils';
import { calculateIconSearchScore, getIconMatchedFields } from '../utils/search-scoring';
import { BaseTool, clampLimit, requireString } from './base';

/**
 * 搜索图标工具
 */
/** 加载失败后重试间隔（60秒） */
const RETRY_INTERVAL = 60000;

export class SearchIconsTool extends BaseTool {
  name = MCP_TOOLS.SEARCH_ICONS;
  description = '按关键词搜索图标';
  inputSchema = {
    query: z.string().describe('搜索关键词，支持中英文'),
    limit: z.number().optional().describe('返回结果数量限制（1-100，默认 10）'),
  };

  private iconsIndex: IconsIndex | null = null;
  /** 上次加载尝试时间（支持失败后重试） */
  private lastLoadAttempt = 0;

  constructor(private dataDir: string) {
    super();
  }

  async execute(args: ToolArguments): Promise<{ results: IconSearchResult[]; total: number }> {
    const query = requireString(args, 'query').toLowerCase();
    const limit = clampLimit(args.limit);

    if (!query) {
      return { results: [], total: 0 };
    }

    // 懒加载图标索引（支持失败后定时重试）
    const now = Date.now();
    if (!this.iconsIndex && now - this.lastLoadAttempt > RETRY_INTERVAL) {
      this.lastLoadAttempt = now;
      this.iconsIndex = await this.loadIconsIndex();
    }

    if (!this.iconsIndex?.icons) {
      return { results: [], total: 0 };
    }

    const matched: IconSearchResult[] = [];

    for (const icon of this.iconsIndex.icons) {
      const score = calculateIconSearchScore(icon, query);
      if (score > 0) {
        matched.push({
          name: icon.name,
          packageName: icon.packageName,
          category: icon.iconCategory,
          description: icon.description,
          // 直接给出可用的导入语句，省得调用方去猜子路径
          importStatement: `import { ${icon.name} } from '${icon.packageName}';`,
          score,
          matchedFields: getIconMatchedFields(icon, query),
        });
      }
    }

    matched.sort((a, b) => b.score - a.score);

    return { results: matched.slice(0, limit), total: matched.length };
  }

  /**
   * 加载图标索引
   */
  private async loadIconsIndex(): Promise<IconsIndex | null> {
    try {
      const indexPath = join(this.dataDir, 'icons-index.json');
      const indexContent = await readFile(indexPath, 'utf8');
      return JSON.parse(indexContent) as IconsIndex;
    } catch (error) {
      log.warn('无法加载图标索引:', error);
      return null;
    }
  }
}

/**
 * 获取图标 SVG 源码
 *
 * 用于「不装 @aix/icons 直接内联图标」的场景，比如生成独立 demo、
 * 静态页面或邮件模板。SVG 源码体积大且只在这种场景需要，
 * 因此不进任何索引，单独存一份按需读取。
 */
export class GetIconSvgTool extends BaseTool {
  name = MCP_TOOLS.GET_ICON_SVG;
  description =
    '获取指定图标的 SVG 源码，用于不依赖 @aix/icons 直接内联图标的场景。常规使用请优先用 search-icons 返回的 importStatement';
  inputSchema = {
    name: z.string().describe('图标组件名（search-icons 返回的 name，如 "IconSearch"）'),
  };

  private svgMap: Record<string, string> | null = null;
  /** 上次加载尝试时间（支持失败后重试） */
  private lastLoadAttempt = 0;

  constructor(private dataDir: string) {
    super();
  }

  async execute(args: ToolArguments): Promise<{ name: string; svg: string }> {
    const name = requireString(args, 'name');

    const now = Date.now();
    if (!this.svgMap && now - this.lastLoadAttempt > RETRY_INTERVAL) {
      this.lastLoadAttempt = now;
      this.svgMap = await this.loadSvgMap();
    }

    if (!this.svgMap) {
      throw new Error(
        `无法加载图标 SVG 数据（${join(this.dataDir, ICONS_SVG_FILE)}），请先运行 extract`,
      );
    }

    const svg = this.svgMap[name];
    if (!svg) {
      throw new Error(`未找到图标: ${name}。请先用 search-icons 确认图标名`);
    }

    return { name, svg };
  }

  private async loadSvgMap(): Promise<Record<string, string> | null> {
    try {
      const content = await readFile(join(this.dataDir, ICONS_SVG_FILE), 'utf8');
      return JSON.parse(content) as Record<string, string>;
    } catch (error) {
      log.warn('无法加载图标 SVG 数据:', error);
      return null;
    }
  }
}
