/**
 * 高性能搜索索引系统
 * 使用倒排索引和TF-IDF算法优化搜索性能
 */

import type { ComponentInfo } from '../types/index';
import { log } from './logger';

/**
 * 搜索索引项
 */
interface IndexItem {
  componentId: string;
  field: string;
  score: number;
  positions: number[];
}

/**
 * 倒排索引
 */
interface InvertedIndex {
  [term: string]: IndexItem[];
}

/**
 * 搜索结果（内部使用）
 */
interface IndexedSearchResult {
  component: ComponentInfo;
  score: number;
  matchedFields: string[];
  highlights: Record<string, string[]>;
}

/**
 * 搜索配置
 */
interface SearchConfig {
  // 字段权重配置
  fieldWeights: Record<string, number>;
  // 最小词长度
  minTermLength: number;
  // 最大结果数
  maxResults: number;
  // 是否启用模糊搜索
  fuzzySearch: boolean;
  // 模糊搜索阈值
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
  minTermLength: 1, // 改为1以支持中文单字符搜索
  maxResults: 50,
  fuzzySearch: true,
  fuzzyThreshold: 0.8,
};

/**
 * 高性能搜索索引
 */
export class SearchIndex {
  private index: InvertedIndex = {};
  private components: Map<string, ComponentInfo> = new Map();
  private config: SearchConfig;
  private termFrequency: Map<string, number> = new Map();
  private documentCount = 0;

  constructor(config: Partial<SearchConfig> = {}) {
    this.config = { ...DEFAULT_SEARCH_CONFIG, ...config };
  }

  /**
   * 构建索引
   */
  buildIndex(components: ComponentInfo[]): void {
    // 清空现有索引
    this.index = {};
    this.components.clear();
    this.termFrequency.clear();
    this.documentCount = components.length;

    // 为每个组件建立索引
    for (const component of components) {
      this.indexComponent(component);
    }

    // 计算IDF权重
    this.calculateIDF();

    const termCount = Object.keys(this.index).length;
    log.info(
      `🔍 搜索索引构建完成: ${components.length} 个组件, ${termCount} 个词项`,
    );
  }

  /**
   * 为单个组件建立索引
   */
  private indexComponent(component: ComponentInfo): void {
    const componentId = component.packageName;
    this.components.set(componentId, component);

    // 索引各个字段
    this.indexField(componentId, 'name', component.name);
    this.indexField(componentId, 'packageName', component.packageName);
    this.indexField(componentId, 'description', component.description);
    this.indexField(componentId, 'category', component.category);

    // 索引标签
    if (component.tags) {
      this.indexField(componentId, 'tags', component.tags.join(' '));
    }

    // 索引Props
    if (component.props) {
      const propsText = component.props
        .map((prop) => `${prop.name} ${prop.description || ''}`)
        .join(' ');
      this.indexField(componentId, 'props', propsText);
    }
  }

  /**
   * 索引字段内容
   */
  private indexField(
    componentId: string,
    field: string,
    content: string,
  ): void {
    const terms = this.tokenize(content);
    const termPositions: Map<string, number[]> = new Map();

    // 记录词项位置
    terms.forEach((term, position) => {
      if (term.length >= this.config.minTermLength) {
        if (!termPositions.has(term)) {
          termPositions.set(term, []);
        }
        termPositions.get(term)!.push(position);
      }
    });

    // 建立倒排索引
    for (const [term, positions] of termPositions) {
      if (!this.index[term]) {
        this.index[term] = [];
      }

      // 计算TF (词频)
      const tf = positions.length / terms.length;
      const score = tf * (this.config.fieldWeights[field] || 1);

      this.index[term].push({
        componentId,
        field,
        score,
        positions,
      });

      // 更新全局词频
      this.termFrequency.set(term, (this.termFrequency.get(term) || 0) + 1);
    }
  }

  /**
   * 计算IDF权重
   */
  private calculateIDF(): void {
    for (const term in this.index) {
      const df = this.termFrequency.get(term) || 1;
      // 使用平滑的IDF计算，避免分数为0
      const idf = Math.log(this.documentCount / df) + 1;

      // 更新每个索引项的分数
      const indexItems = this.index[term];
      if (indexItems) {
        for (const item of indexItems) {
          item.score *= idf;
        }
      }
    }
  }

  /**
   * 执行搜索
   */
  search(query: string, limit?: number): IndexedSearchResult[] {
    const maxResults = limit || this.config.maxResults;
    const terms = this.tokenize(query.toLowerCase());

    if (terms.length === 0) {
      return [];
    }

    const scoreMap: Map<
      string,
      {
        score: number;
        matchedFields: Set<string>;
        termMatches: Map<string, IndexItem[]>;
      }
    > = new Map();

    // 处理每个查询词
    for (const term of terms) {
      const matches = this.findMatches(term);

      for (const match of matches) {
        const existing = scoreMap.get(match.componentId) || {
          score: 0,
          matchedFields: new Set(),
          termMatches: new Map(),
        };

        existing.score += match.score;
        existing.matchedFields.add(match.field);

        if (!existing.termMatches.has(term)) {
          existing.termMatches.set(term, []);
        }
        existing.termMatches.get(term)!.push(match);

        scoreMap.set(match.componentId, existing);
      }
    }

    // 转换为结果格式并排序
    const results: IndexedSearchResult[] = [];
    for (const [componentId, data] of scoreMap) {
      const component = this.components.get(componentId);
      if (!component) continue;

      // 生成高亮信息
      const highlights = this.generateHighlights(component, data.termMatches);

      results.push({
        component,
        score: data.score,
        matchedFields: Array.from(data.matchedFields),
        highlights,
      });
    }

    // 按分数排序并限制结果数量
    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  /**
   * 查找匹配项
   */
  private findMatches(term: string): IndexItem[] {
    const matches: IndexItem[] = [];

    // 精确匹配
    if (this.index[term]) {
      matches.push(...this.index[term]);
    }

    // 模糊匹配
    if (this.config.fuzzySearch && term.length >= 3) {
      for (const indexTerm in this.index) {
        if (indexTerm !== term && this.isFuzzyMatch(term, indexTerm)) {
          // 模糊匹配的分数打折
          const indexItems = this.index[indexTerm];
          if (indexItems) {
            const fuzzyMatches = indexItems.map((item) => ({
              ...item,
              score: item.score * 0.7, // 模糊匹配分数折扣
            }));
            matches.push(...fuzzyMatches);
          }
        }
      }
    }

    return matches;
  }

  /**
   * 模糊匹配判断
   */
  private isFuzzyMatch(term1: string, term2: string): boolean {
    const similarity = this.calculateSimilarity(term1, term2);
    return similarity >= this.config.fuzzyThreshold;
  }

  /**
   * 计算字符串相似度
   */
  private calculateSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    if (matchWindow < 0) return 0.0;

    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // 查找匹配字符
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, s2.length);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    // 计算转置
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    const distance =
      (matches / s1.length +
        matches / s2.length +
        (matches - transpositions / 2) / matches) /
      3;

    // 前缀加权
    let prefix = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return distance + 0.1 * prefix * (1 - distance);
  }

  /**
   * 生成搜索高亮
   */
  private generateHighlights(
    component: ComponentInfo,
    termMatches: Map<string, IndexItem[]>,
  ): Record<string, string[]> {
    const highlights: Record<string, string[]> = {};

    for (const [term, matches] of termMatches) {
      for (const match of matches) {
        if (!highlights[match.field]) {
          highlights[match.field] = [];
        }

        const fieldContent = this.getFieldContent(component, match.field);
        const highlighted = this.highlightTerm(fieldContent, term);
        if (highlighted !== fieldContent) {
          highlights[match.field]?.push(highlighted);
        }
      }
    }

    return highlights;
  }

  /**
   * 获取字段内容
   */
  private getFieldContent(component: ComponentInfo, field: string): string {
    switch (field) {
      case 'name':
        return component.name;
      case 'packageName':
        return component.packageName;
      case 'description':
        return component.description;
      case 'category':
        return component.category;
      case 'tags':
        return component.tags?.join(', ') || '';
      case 'props':
        return component.props?.map((p) => p.name).join(', ') || '';
      default:
        return '';
    }
  }

  /**
   * 高亮显示匹配词
   */
  private highlightTerm(content: string, term: string): string {
    const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
    return content.replace(regex, '**$1**');
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 分词处理
   */
  private tokenize(text: string): string[] {
    if (!text) return [];

    // 处理中文和英文混合文本
    const tokens: string[] = [];

    // 先按空格分割，保留一些常见的编程符号
    const segments = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff()=>\-|]/g, ' ') // 保留 ()=>-| 等编程符号
      .split(/\s+/)
      .filter((segment) => segment.length > 0);

    for (const segment of segments) {
      // 如果是纯中文，按字符分割
      if (/^[\u4e00-\u9fff]+$/.test(segment)) {
        // 中文按字符分割，但保留原词
        tokens.push(segment); // 保留完整词
        if (segment.length > 1) {
          // 同时添加单个字符用于搜索
          for (const char of segment) {
            tokens.push(char); // 中文字符直接添加，不检查长度
          }
        }
      } else {
        // 英文或数字，直接添加（不检查长度限制）
        tokens.push(segment);
      }
    }

    return [...new Set(tokens)]; // 去重
  }

  /**
   * 获取索引统计信息
   */
  getStats() {
    const termCount = Object.keys(this.index).length;
    const totalIndexItems = Object.values(this.index).reduce(
      (sum, items) => sum + items.length,
      0,
    );

    return {
      componentCount: this.components.size,
      termCount,
      totalIndexItems,
      averageTermsPerComponent:
        this.components.size > 0 ? termCount / this.components.size : 0,
      indexSizeEstimate: `${Math.round(JSON.stringify(this.index).length / 1024)}KB`,
    };
  }

  /**
   * 重建索引
   */
  rebuildIndex(components: ComponentInfo[]): void {
    log.info('🔄 重建搜索索引...');
    this.buildIndex(components);
  }

  /**
   * 清空索引
   */
  clearIndex(): void {
    this.index = {};
    this.components.clear();
    this.termFrequency.clear();
    this.documentCount = 0;
    log.info('🗑️ 搜索索引已清空');
  }

  /**
   * 保存索引到文件
   */
  async save(filePath: string): Promise<void> {
    try {
      const { writeFile, mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');

      // 确保目录存在
      await mkdir(dirname(filePath), { recursive: true });

      // 序列化索引数据
      const indexData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        config: this.config,
        index: this.index,
        components: Array.from(this.components.entries()),
        termFrequency: Array.from(this.termFrequency.entries()),
        documentCount: this.documentCount,
      };

      await writeFile(filePath, JSON.stringify(indexData), 'utf8');
      log.info(`💾 搜索索引已保存到: ${filePath}`);
    } catch (error) {
      log.error('保存搜索索引失败:', error);
      throw error;
    }
  }

  /**
   * 从文件加载索引
   */
  async load(filePath: string): Promise<boolean> {
    try {
      const { readFile } = await import('node:fs/promises');
      const { existsSync } = await import('node:fs');

      // 检查文件是否存在
      if (!existsSync(filePath)) {
        log.warn(`搜索索引文件不存在: ${filePath}`);
        return false;
      }

      const content = await readFile(filePath, 'utf8');
      const indexData = JSON.parse(content);

      // 验证版本
      if (indexData.version !== '1.0.0') {
        log.warn('搜索索引版本不匹配，需要重新构建');
        return false;
      }

      // 恢复索引数据
      this.config = { ...this.config, ...indexData.config };
      this.index = indexData.index;
      this.components = new Map(indexData.components);
      this.termFrequency = new Map(indexData.termFrequency);
      this.documentCount = indexData.documentCount;

      log.info(
        `📂 搜索索引已从文件加载: ${this.components.size} 个组件, ${Object.keys(this.index).length} 个词项`,
      );
      return true;
    } catch (error) {
      log.error('加载搜索索引失败:', error);
      return false;
    }
  }

  /**
   * 检查索引是否需要重建
   */
  async needsRebuild(
    filePath: string,
    components: ComponentInfo[],
  ): Promise<boolean> {
    try {
      const { stat } = await import('node:fs/promises');
      const { existsSync } = await import('node:fs');

      // 文件不存在，需要构建
      if (!existsSync(filePath)) {
        return true;
      }

      // 检查文件修改时间
      const stats = await stat(filePath);
      const fileAge = Date.now() - stats.mtimeMs;
      const maxAge = 24 * 60 * 60 * 1000; // 24小时

      // 索引文件超过24小时，需要重建
      if (fileAge > maxAge) {
        log.info('搜索索引已过期，需要重建');
        return true;
      }

      // 检查组件数量是否匹配
      if (this.components.size !== components.length) {
        log.info('组件数量变化，需要重建索引');
        return true;
      }

      return false;
    } catch (error) {
      log.warn('检查索引状态失败:', error);
      return true;
    }
  }
}

/**
 * 创建搜索索引实例
 */
export function createSearchIndex(config?: Partial<SearchConfig>): SearchIndex {
  return new SearchIndex(config);
}
