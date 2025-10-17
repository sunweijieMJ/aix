/**
 * 图标相关的 MCP 工具
 */

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

  constructor(private iconsIndex: IconsIndex | null = null) {
    super();
  }

  async execute(args: ToolArguments): Promise<SearchResult[]> {
    // 加载图标索引
    const iconsIndex = await this.getIconsIndex();
    if (!iconsIndex || !iconsIndex.icons) {
      return [];
    }

    const query = (args.query as string).toLowerCase();
    const limit = (args.limit as number) || 10;

    const results: SearchResult[] = [];
    let foundCount = 0;

    // 优化：预缓存查询字符串
    const queryLower = query;

    for (const icon of iconsIndex.icons) {
      // 早期退出：如果已找到足够的高分结果，可以提前结束
      if (foundCount >= limit * 3) {
        // 搜索3倍数量以确保质量
        break;
      }

      const score = calculateIconSearchScore(icon, queryLower);
      if (score > 0) {
        const matchedFields = getIconMatchedFields(icon, queryLower);

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
        foundCount++;
      }
    }

    // 按分数排序并限制结果数量
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * 获取图标索引
   */
  private async getIconsIndex(): Promise<IconsIndex | null> {
    // 如果有实例索引，直接使用
    if (this.iconsIndex) {
      return this.iconsIndex;
    }

    // 从文件加载
    try {
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      const indexPath = join(process.cwd(), 'data', 'icons-index.json');
      const indexContent = await readFile(indexPath, 'utf8');
      const iconsIndex = JSON.parse(indexContent) as IconsIndex;

      return iconsIndex;
    } catch (error) {
      log.error('无法加载图标索引:', error);
      return null;
    }
  }
}
