/**
 * 图标相关的 MCP 工具
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MCP_TOOLS } from '../constants';
import type { IconsIndex, SearchResult, ToolArguments } from '../types/index';
import { log } from '../utils';
import {
  calculateIconSearchScore,
  getIconMatchedFields,
} from '../utils/search-scoring';
import { BaseTool } from './base';

/**
 * 搜索图标工具
 */
/** 加载失败后重试间隔（60秒） */
const RETRY_INTERVAL = 60000;

export class SearchIconsTool extends BaseTool {
  name = MCP_TOOLS.SEARCH_ICONS;
  description = '按关键词搜索图标';
  inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      limit: {
        type: 'number',
        description: '返回结果数量限制',
        default: 10,
      },
    },
    required: ['query'],
  };

  private iconsIndex: IconsIndex | null = null;
  /** 上次加载尝试时间（支持失败后重试） */
  private lastLoadAttempt = 0;

  constructor(private dataDir: string) {
    super();
  }

  async execute(args: ToolArguments): Promise<SearchResult[]> {
    // 懒加载图标索引（支持失败后定时重试）
    const now = Date.now();
    if (!this.iconsIndex && now - this.lastLoadAttempt > RETRY_INTERVAL) {
      this.lastLoadAttempt = now;
      this.iconsIndex = await this.loadIconsIndex();
    }

    if (!this.iconsIndex?.icons) {
      return [];
    }

    const query = (args.query as string).toLowerCase();
    const limit = (args.limit as number) || 10;

    const results: SearchResult[] = [];

    for (const icon of this.iconsIndex.icons) {
      const score = calculateIconSearchScore(icon, query);
      if (score > 0) {
        const matchedFields = getIconMatchedFields(icon, query);

        results.push({
          component: {
            name: icon.name,
            packageName: icon.packageName,
            category: icon.category,
            description: icon.description,
            tags: icon.tags,
            props: [],
            examples: [],
            version: '1.0.0',
            author: '',
            license: '',
            sourcePath: '',
            dependencies: [],
            peerDependencies: [],
          },
          score,
          matchedFields,
        });
      }
    }

    // 按分数排序并限制结果数量
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
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
