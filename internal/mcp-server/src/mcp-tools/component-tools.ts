/**
 * 组件相关的 MCP 工具
 */

import { COMPONENT_LIBRARY_CONFIG, MCP_TOOLS } from '../constants';
import type {
  ComponentIndex,
  ComponentInfo,
  SearchResult,
  ToolArguments,
} from '../types/index';
import { findComponentByName, log } from '../utils';
import { createSearchIndex } from '../utils/search-index';
import {
  calculateComponentSearchScore,
  getComponentMatchedFields,
} from '../utils/search-scoring';
import { BaseTool } from './base';

/**
 * 列出所有组件
 */
export class ListComponentsTool extends BaseTool {
  name = MCP_TOOLS.LIST_COMPONENTS;
  description = `列出所有可用的 ${COMPONENT_LIBRARY_CONFIG.displayName} 组件`;
  inputSchema = {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: '按分类过滤组件',
      },
      tag: {
        type: 'string',
        description: '按标签过滤组件',
      },
    },
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(args: ToolArguments): Promise<ComponentInfo[]> {
    let components = this.componentIndex.components;

    // 按分类过滤
    if (args.category && typeof args.category === 'string') {
      components = components.filter((c) =>
        c.category
          .toLowerCase()
          .includes((args.category as string).toLowerCase()),
      );
    }

    // 按标签过滤
    if (args.tag && typeof args.tag === 'string') {
      components = components.filter(
        (c) =>
          c.tags &&
          c.tags.some((tag) =>
            tag.toLowerCase().includes((args.tag as string).toLowerCase()),
          ),
      );
    }

    return components;
  }
}

/**
 * 获取单个组件信息
 */
export class GetComponentInfoTool extends BaseTool {
  name = MCP_TOOLS.GET_COMPONENT_INFO;
  description = '获取指定组件的详细信息';
  inputSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '组件名称或包名',
      },
    },
    required: ['name'],
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(args: ToolArguments): Promise<ComponentInfo | null> {
    const name = args.name as string;
    return findComponentByName(this.componentIndex.components, name);
  }
}

/**
 * 获取组件 Props
 */
export class GetComponentPropsTool extends BaseTool {
  name = MCP_TOOLS.GET_COMPONENT_PROPS;
  description = '获取指定组件的 Props 类型定义';
  inputSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '组件名称或包名',
      },
    },
    required: ['name'],
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(args: ToolArguments): Promise<ComponentInfo['props'] | null> {
    const name = args.name as string;
    const component = findComponentByName(this.componentIndex.components, name);
    return component?.props || null;
  }
}

/**
 * 获取组件示例
 */
export class GetComponentExamplesTool extends BaseTool {
  name = MCP_TOOLS.GET_COMPONENT_EXAMPLES;
  description = '获取指定组件的使用示例';
  inputSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '组件名称或包名',
      },
      language: {
        type: 'string',
        enum: ['tsx', 'jsx', 'ts', 'js', 'vue'],
        description: '示例代码语言',
      },
    },
    required: ['name'],
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(
    args: ToolArguments,
  ): Promise<ComponentInfo['examples'] | null> {
    const name = args.name as string;
    const language = args.language as string;

    const component = findComponentByName(this.componentIndex.components, name);
    if (!component) return null;

    let examples = component.examples || [];

    // 按语言过滤
    if (language && examples.length > 0) {
      examples = examples.filter((ex: any) => ex.language === language);
    }

    return examples;
  }
}

/**
 * 搜索组件 - 使用高性能索引
 */
export class SearchComponentsTool extends BaseTool {
  name = MCP_TOOLS.SEARCH_COMPONENTS;
  description = '按关键词搜索组件（支持模糊搜索和智能排序）';
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
        maximum: 100,
      },
      fuzzy: {
        type: 'boolean',
        description: '是否启用模糊搜索',
        default: true,
      },
    },
    required: ['query'],
  };

  private searchIndex = createSearchIndex();
  private indexBuilt = false;
  private indexFilePath: string;

  constructor(private componentIndex: ComponentIndex) {
    super();
    this.indexFilePath = this.getIndexFilePath();
    this.initializeSearchIndex();
  }

  /**
   * 获取索引文件路径
   */
  private getIndexFilePath(): string {
    return `${process.cwd()}/data/search-index.json`;
  }

  async execute(args: ToolArguments): Promise<SearchResult[]> {
    const query = args.query as string;
    const limit = Math.min(
      typeof args.limit === 'number' ? args.limit : 10,
      100,
    );

    if (!query.trim() || limit === 0) return [];

    // 确保索引已构建
    if (!this.indexBuilt) {
      this.buildSearchIndex();
    }

    try {
      // 使用高性能索引搜索
      const indexedResults = this.searchIndex.search(query, limit);

      // 转换为兼容格式
      const results: SearchResult[] = indexedResults.map((result) => ({
        component: result.component,
        score: result.score,
        matchedFields: result.matchedFields,
      }));

      // 记录搜索统计
      if (results.length > 0) {
        log.debug(`🔍 搜索 "${query}" 找到 ${results.length} 个结果`);
      }

      return results;
    } catch (error) {
      log.error('搜索执行失败:', error);
      // 降级到使用 Fuse.js
      return await this.fallbackSearchWithFuse(query, limit);
    }
  }

  /**
   * 初始化搜索索引（尝试从文件加载，失败则构建）
   */
  private async initializeSearchIndex(): Promise<void> {
    try {
      // 尝试从文件加载索引
      const loaded = await this.searchIndex.load(this.indexFilePath);

      if (loaded) {
        // 检查是否需要重建
        const needsRebuild = await this.searchIndex.needsRebuild(
          this.indexFilePath,
          this.componentIndex.components,
        );

        if (!needsRebuild) {
          this.indexBuilt = true;
          log.info('✅ 搜索索引从缓存加载成功');
          return;
        }
      }

      // 加载失败或需要重建，构建新索引
      await this.buildSearchIndex();
    } catch (error) {
      log.error('初始化搜索索引失败:', error);
      // 降级到不使用持久化
      await this.buildSearchIndex();
    }
  }

  /**
   * 构建搜索索引
   */
  private async buildSearchIndex(): Promise<void> {
    try {
      this.searchIndex.buildIndex(this.componentIndex.components);
      this.indexBuilt = true;

      const stats = this.searchIndex.getStats();
      log.info(
        `🔍 搜索索引构建完成: ${stats.componentCount} 个组件, ${stats.termCount} 个词项`,
      );

      // 保存索引到文件
      try {
        await this.searchIndex.save(this.indexFilePath);
      } catch (saveError) {
        log.warn('保存搜索索引失败，将在下次启动时重新构建:', saveError);
      }
    } catch (error) {
      log.error('搜索索引构建失败:', error);
      this.indexBuilt = false;
    }
  }

  /**
   * 使用 Fuse.js 的降级搜索方法
   */
  private async fallbackSearchWithFuse(
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    log.warn('使用 Fuse.js 降级搜索方法');

    try {
      // 动态导入 Fuse.js
      const { default: Fuse } = await import('fuse.js');

      const fuse = new Fuse(this.componentIndex.components, {
        keys: [
          { name: 'name', weight: 0.3 },
          { name: 'packageName', weight: 0.25 },
          { name: 'description', weight: 0.2 },
          { name: 'category', weight: 0.15 },
          { name: 'tags', weight: 0.1 },
        ],
        threshold: 0.4,
        includeScore: true,
      });

      const fuseResults = fuse.search(query, { limit });

      return fuseResults.map((result: any) => ({
        component: result.item,
        score: 100 * (1 - (result.score || 0)), // 转换分数到 0-100
        matchedFields: this.getMatchedFieldsSimple(result.item, query),
      }));
    } catch (error) {
      log.error('Fuse.js 降级搜索也失败:', error);
      // 最后的降级：简单的字符串匹配
      return this.simpleStringSearch(query, limit);
    }
  }

  /**
   * 最简单的字符串匹配降级方法
   */
  private simpleStringSearch(query: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const component of this.componentIndex.components) {
      const score = calculateComponentSearchScore(component, queryLower);
      if (score > 0) {
        const matchedFields = getComponentMatchedFields(component, queryLower);
        results.push({
          component,
          score,
          matchedFields,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * 简单获取匹配字段
   */
  private getMatchedFieldsSimple(
    component: ComponentInfo,
    query: string,
  ): string[] {
    return getComponentMatchedFields(component, query.toLowerCase());
  }
}

/**
 * 获取组件依赖
 */
export class GetComponentDependenciesTool extends BaseTool {
  name = MCP_TOOLS.GET_COMPONENT_DEPENDENCIES;
  description = '获取指定组件的依赖关系';
  inputSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '组件名称或包名',
      },
    },
    required: ['name'],
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(args: ToolArguments): Promise<{
    dependencies: string[];
    peerDependencies: string[];
  } | null> {
    const name = args.name as string;
    const component = findComponentByName(this.componentIndex.components, name);
    if (!component) return null;

    return {
      dependencies: component.dependencies,
      peerDependencies: component.peerDependencies,
    };
  }
}

/**
 * 获取组件分类和标签
 */
export class GetCategoriesAndTagsTool extends BaseTool {
  name = MCP_TOOLS.GET_CATEGORIES_AND_TAGS;
  description = '获取所有可用的组件分类和标签';
  inputSchema = {
    type: 'object',
    properties: {},
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(): Promise<{
    categories: string[];
    tags: string[];
    stats: {
      totalComponents: number;
      lastUpdated: string;
    };
  }> {
    return {
      categories: this.componentIndex.categories,
      tags: this.componentIndex.tags,
      stats: {
        totalComponents: this.componentIndex.components.length,
        lastUpdated: this.componentIndex.lastUpdated,
      },
    };
  }
}

/**
 * 获取组件变更日志
 */
export class GetComponentChangelogTool extends BaseTool {
  name = MCP_TOOLS.GET_COMPONENT_CHANGELOG;
  description = '获取指定组件的变更日志';
  inputSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '组件名称或包名',
      },
      version: {
        type: 'string',
        description: '指定版本（可选）',
      },
    },
    required: ['name'],
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(args: ToolArguments): Promise<{
    changelog: Array<{ version: string; changes: string[] }>;
    packageName: string;
    currentVersion: string;
  } | null> {
    const name = args.name as string;
    const version = args.version as string | undefined;

    const component = findComponentByName(this.componentIndex.components, name);
    if (!component) return null;

    try {
      // 从组件源路径读取 CHANGELOG.md
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');

      const changelogPath = join(component.sourcePath, 'CHANGELOG.md');
      let changelogContent;

      try {
        changelogContent = await readFile(changelogPath, 'utf8');
      } catch {
        // 如果没有 CHANGELOG.md，返回空的变更日志
        return {
          changelog: [],
          packageName: component.packageName,
          currentVersion: component.version,
        };
      }

      // 解析变更日志
      const changelog = this.parseChangelog(changelogContent, version);

      return {
        changelog,
        packageName: component.packageName,
        currentVersion: component.version,
      };
    } catch (error) {
      log.error(`Error getting changelog for ${component.name}:`, error);
      return {
        changelog: [],
        packageName: component.packageName,
        currentVersion: component.version,
      };
    }
  }

  /**
   * 解析变更日志内容
   */
  private parseChangelog(
    content: string,
    filterVersion?: string,
  ): Array<{ version: string; changes: string[] }> {
    const result: Array<{ version: string; changes: string[] }> = [];

    // 匹配版本块：## 1.0.0 (2023-01-01) 或 ## [1.0.0] - 2023-01-01
    const versionBlocks = content.split(
      /^## (?:\[?)([\d.]+)(?:\]?)(?:[ -]+(.+))?$/m,
    );

    for (let i = 1; i < versionBlocks.length; i += 3) {
      const version = versionBlocks[i];
      const date = versionBlocks[i + 1]?.trim() || '';
      const blockContent = versionBlocks[i + 2] || '';

      // 如果指定了版本且不匹配，则跳过
      if (filterVersion && version !== filterVersion) continue;

      // 提取变更内容
      const changes: string[] = [];
      const changeTypes = blockContent.split(/^### (.+)$/m);

      for (let j = 1; j < changeTypes.length; j += 2) {
        const type = changeTypes[j]?.trim() || 'Changes';
        const typeChanges = changeTypes[j + 1] || '';

        // 提取每个变更点
        const items = typeChanges
          .split('\n')
          .filter(
            (line) =>
              line.trim().startsWith('-') || line.trim().startsWith('*'),
          )
          .map((line) => line.replace(/^[-*]\s*/, '').trim())
          .filter(Boolean);

        if (items.length > 0) {
          changes.push(`${type}:`);
          changes.push(...items);
        }
      }

      result.push({
        version: `${version}${date ? ` (${date})` : ''}`,
        changes: changes.length > 0 ? changes : ['无详细变更记录'],
      });

      // 如果找到了指定版本，可以提前结束
      if (filterVersion && version === filterVersion) break;
    }

    return result;
  }
}
