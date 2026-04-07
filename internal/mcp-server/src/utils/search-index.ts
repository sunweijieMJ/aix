/**
 * 搜索索引 (简化版)
 *
 * 简化原因:
 * - 组件数量通常 < 100，不需要复杂的倒排索引
 * - TF-IDF 算法对小数据集意义不大
 * - Jaro-Winkler 相似度计算过于复杂
 * - 索引持久化增加不必要的复杂度
 *
 * 此简化版使用简单的关键词匹配，保持 API 兼容
 */

import type { ComponentInfo } from '../types/index';
import { log } from './logger';

/**
 * 搜索结果
 */
interface SearchResult {
  component: ComponentInfo;
  score: number;
  matchedFields: string[];
  highlights: Record<string, string[]>;
}

/**
 * 搜索配置
 */
interface SearchConfig {
  fieldWeights: Record<string, number>;
  minTermLength: number;
  maxResults: number;
  fuzzySearch: boolean;
  fuzzyThreshold: number;
}

/**
 * 默认搜索配置
 */
const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  fieldWeights: {
    name: 100,
    packageName: 80,
    description: 60,
    category: 40,
    tags: 30,
    props: 20,
  },
  minTermLength: 1,
  maxResults: 50,
  fuzzySearch: true,
  fuzzyThreshold: 0.8,
};

/**
 * 简化版搜索索引
 */
export class SearchIndex {
  private components: ComponentInfo[] = [];
  private config: SearchConfig;

  constructor(config: Partial<SearchConfig> = {}) {
    this.config = { ...DEFAULT_SEARCH_CONFIG, ...config };
  }

  /**
   * 构建索引
   */
  buildIndex(components: ComponentInfo[]): void {
    this.components = components;
    log.info(`🔍 搜索索引构建完成: ${components.length} 个组件`);
  }

  /**
   * 执行搜索
   */
  search(query: string, limit?: number): SearchResult[] {
    const maxResults = limit || this.config.maxResults;

    if (!query.trim()) {
      return [];
    }

    const keywords = this.tokenize(query.toLowerCase());
    if (keywords.length === 0) {
      return [];
    }

    const results: SearchResult[] = [];

    for (const component of this.components) {
      const { score, matchedFields } = this.calculateScore(component, keywords);

      if (score > 0) {
        results.push({
          component,
          score,
          matchedFields: [...new Set(matchedFields)],
          highlights: this.generateHighlights(component, keywords, matchedFields),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  /**
   * 计算组件与关键词的匹配分数
   */
  private calculateScore(
    component: ComponentInfo,
    keywords: string[],
  ): { score: number; matchedFields: string[] } {
    let score = 0;
    const matchedFields: string[] = [];

    // 准备搜索文本
    const searchTexts = {
      name: component.name.toLowerCase(),
      packageName: component.packageName.toLowerCase(),
      description: component.description.toLowerCase(),
      category: component.category.toLowerCase(),
      tags: component.tags.join(' ').toLowerCase(),
      props:
        component.props
          ?.map((p) => p.name)
          .join(' ')
          .toLowerCase() || '',
    };

    for (const keyword of keywords) {
      // 精确匹配
      for (const [field, text] of Object.entries(searchTexts)) {
        if (text.includes(keyword)) {
          const weight = this.config.fieldWeights[field] || 10;
          score += weight;
          matchedFields.push(field);

          // 完全匹配加分
          if (text === keyword || text.split(/\s+/).includes(keyword)) {
            score += weight * 0.5;
          }
        }
      }

      // 简单模糊匹配：前缀匹配
      if (this.config.fuzzySearch && keyword.length >= 2) {
        for (const [field, text] of Object.entries(searchTexts)) {
          const words = text.split(/\s+/);
          for (const word of words) {
            if (word.startsWith(keyword) && !text.includes(keyword)) {
              const weight = this.config.fieldWeights[field] || 10;
              score += weight * 0.5; // 前缀匹配打折
              matchedFields.push(field);
            }
          }
        }
      }
    }

    return { score, matchedFields };
  }

  /**
   * 生成搜索高亮
   */
  private generateHighlights(
    component: ComponentInfo,
    keywords: string[],
    matchedFields: string[],
  ): Record<string, string[]> {
    const highlights: Record<string, string[]> = {};

    const fieldValues: Record<string, string> = {
      name: component.name,
      packageName: component.packageName,
      description: component.description,
      category: component.category,
      tags: component.tags.join(', '),
    };

    for (const field of new Set(matchedFields)) {
      const value = fieldValues[field];
      if (!value) continue;

      for (const keyword of keywords) {
        const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
        if (regex.test(value)) {
          if (!highlights[field]) {
            highlights[field] = [];
          }
          highlights[field].push(value.replace(regex, '**$1**'));
        }
      }
    }

    return highlights;
  }

  /**
   * 分词处理
   */
  private tokenize(text: string): string[] {
    if (!text) return [];

    const tokens: string[] = [];

    // 按空格和常见分隔符分割
    const segments = text
      .replace(/[^\w\s\u4e00-\u9fff-]/g, ' ')
      .split(/\s+/)
      .filter((s) => s.length > 0);

    for (const segment of segments) {
      // 中文按字符分割，同时保留原词
      if (/[\u4e00-\u9fff]/.test(segment)) {
        tokens.push(segment);
        if (segment.length > 1) {
          for (const char of segment) {
            tokens.push(char);
          }
        }
      } else {
        tokens.push(segment);
      }
    }

    return [...new Set(tokens)];
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 获取索引统计信息
   */
  getStats() {
    // 统计所有组件的可搜索字段
    let totalTerms = 0;
    for (const component of this.components) {
      // 名称、包名、描述、分类、标签
      totalTerms += 1; // name
      totalTerms += 1; // packageName
      totalTerms += component.description ? 1 : 0;
      totalTerms += 1; // category
      totalTerms += component.tags?.length || 0;
      totalTerms += component.props?.length || 0;
    }

    const avgTerms =
      this.components.length > 0 ? Math.round(totalTerms / this.components.length) : 0;

    // 估算索引大小（基于组件数据的 JSON 字符串长度）
    let sizeBytes = 0;
    try {
      sizeBytes = JSON.stringify(this.components).length;
    } catch {
      // 忽略序列化错误
    }

    const formatSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes}B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    return {
      componentCount: this.components.length,
      termCount: totalTerms,
      totalIndexItems: totalTerms,
      averageTermsPerComponent: avgTerms,
      indexSizeEstimate: formatSize(sizeBytes),
    };
  }

  /**
   * 清空索引
   */
  clearIndex(): void {
    this.components = [];
    log.info('🗑️ 搜索索引已清空');
  }
}

/**
 * 创建搜索索引实例
 */
export function createSearchIndex(config?: Partial<SearchConfig>): SearchIndex {
  return new SearchIndex(config);
}
