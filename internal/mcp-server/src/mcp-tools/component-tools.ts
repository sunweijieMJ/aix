/**
 * 组件相关的 MCP 工具
 */

import { join } from 'node:path';
import { COMPONENT_LIBRARY_CONFIG, MCP_TOOLS } from '../constants';
import type {
  ComponentExample,
  ComponentIndex,
  ComponentInfo,
  SearchResult,
  ToolArguments,
} from '../types/index';
import { findComponentByName, log } from '../utils';
import { createSearchIndex } from '../utils/search-index';
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
    const category = typeof args.category === 'string' ? args.category : null;
    const tag = typeof args.tag === 'string' ? args.tag : null;

    // 按分类过滤
    if (category) {
      const categoryLower = category.toLowerCase();
      components = components.filter((c) => c.category.toLowerCase().includes(categoryLower));
    }

    // 按标签过滤
    if (tag) {
      const tagLower = tag.toLowerCase();
      components = components.filter(
        (c) => c.tags && c.tags.some((t) => t.toLowerCase().includes(tagLower)),
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

  async execute(args: ToolArguments): Promise<ComponentInfo['examples'] | null> {
    const name = args.name as string;
    const language = args.language as string;

    const component = findComponentByName(this.componentIndex.components, name);
    if (!component) return null;

    let examples: ComponentExample[] = component.examples || [];

    // 按语言过滤
    if (language && examples.length > 0) {
      examples = examples.filter((ex) => ex.language === language);
    }

    return examples;
  }
}

/**
 * 搜索组件 - 使用内存索引
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

  constructor(private componentIndex: ComponentIndex) {
    super();
    // 直接构建内存索引
    this.buildSearchIndex();
  }

  async execute(args: ToolArguments): Promise<SearchResult[]> {
    const query = args.query as string;
    const limit = Math.min(typeof args.limit === 'number' ? args.limit : 10, 100);

    if (!query.trim() || limit === 0) return [];

    // 确保索引已构建
    if (!this.indexBuilt) {
      this.buildSearchIndex();
    }

    try {
      // 使用内存索引搜索
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
      log.error('搜索执行失败，使用降级搜索:', error);
      // 降级到简单的字符串匹配
      return this.fallbackSimpleSearch(query, limit);
    }
  }

  /**
   * 构建搜索索引
   */
  private buildSearchIndex(): void {
    try {
      this.searchIndex.buildIndex(this.componentIndex.components);
      this.indexBuilt = true;
    } catch (error) {
      log.error('搜索索引构建失败:', error);
      this.indexBuilt = false;
    }
  }

  /**
   * 降级搜索方法：简单的字符串匹配
   * 组件数量通常 <100，简单匹配已足够
   */
  private fallbackSimpleSearch(query: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const component of this.componentIndex.components) {
      let score = 0;
      const matchedFields: string[] = [];

      const fields: Record<string, string> = {
        name: component.name.toLowerCase(),
        packageName: component.packageName.toLowerCase(),
        description: component.description.toLowerCase(),
        category: component.category.toLowerCase(),
        tags: (component.tags || []).join(' ').toLowerCase(),
      };

      for (const [field, text] of Object.entries(fields)) {
        if (text.includes(queryLower)) {
          score += field === 'name' ? 100 : field === 'packageName' ? 80 : 40;
          matchedFields.push(field);
        }
      }

      if (score > 0) {
        results.push({ component, score, matchedFields });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
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

    // 匹配版本块，支持完整的 semver 格式：
    // - ## 1.0.0 (2023-01-01)
    // - ## [1.0.0] - 2023-01-01
    // - ## 1.0.0-alpha.1
    // - ## 1.0.0-rc.0+build.123
    const versionBlocks = content.split(
      /^## (?:\[?)(\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?)(?:\]?)(?:[ -]+(.+))?$/m,
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
          .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*'))
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
