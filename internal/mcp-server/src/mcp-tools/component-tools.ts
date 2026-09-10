/**
 * 组件相关的 MCP 工具
 */

import { join } from 'node:path';
import { z } from 'zod';
import { COMPONENT_LIBRARY_CONFIG, MCP_TOOLS } from '../constants';
import type {
  ComponentExample,
  ComponentIndex,
  ComponentInfo,
  ComponentSummary,
  DocsIndex,
  EmitDefinition,
  PropDefinition,
  SearchResultSummary,
  SlotDefinition,
  ToolArguments,
} from '../types/index';
import { toComponentSummary } from '../types/index';
import { findComponentByName, log } from '../utils';
import { createSearchIndex } from '../utils/search-index';
import { BaseTool, clampLimit, requireString } from './base';

/**
 * 列出所有组件
 */
export class ListComponentsTool extends BaseTool {
  name = MCP_TOOLS.LIST_COMPONENTS;
  description = `列出所有可用的 ${COMPONENT_LIBRARY_CONFIG.displayName} 组件（仅摘要，Props 和示例请用 get-component-info / get-component-props / get-component-examples 获取）`;
  inputSchema = {
    category: z.string().optional().describe('按分类过滤组件'),
    tag: z.string().optional().describe('按标签过滤组件'),
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(args: ToolArguments): Promise<ComponentSummary[]> {
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

    return components.map(toComponentSummary);
  }
}

/**
 * 获取单个组件信息
 */
export class GetComponentInfoTool extends BaseTool {
  name = MCP_TOOLS.GET_COMPONENT_INFO;
  description = '获取指定组件的详细信息';
  inputSchema = {
    name: z.string().describe('组件名称或包名（也接受同包内的子组件名）'),
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
  description = '获取指定组件的 Props / Emits / Slots 定义';
  inputSchema = {
    name: z.string().describe('组件名称或包名（也接受同包内的子组件名）'),
  };

  constructor(private componentIndex: ComponentIndex) {
    super();
  }

  async execute(args: ToolArguments): Promise<{
    props: PropDefinition[];
    emits: EmitDefinition[];
    slots: SlotDefinition[];
  } | null> {
    const name = args.name as string;
    const component = findComponentByName(this.componentIndex.components, name);
    if (!component) return null;

    return {
      props: component.props ?? [],
      emits: component.emits ?? [],
      slots: component.slots ?? [],
    };
  }
}

/**
 * 获取组件示例
 */
export class GetComponentExamplesTool extends BaseTool {
  name = MCP_TOOLS.GET_COMPONENT_EXAMPLES;
  description = '获取指定组件的使用示例';
  inputSchema = {
    name: z.string().describe('组件名称或包名'),
    language: z.enum(['tsx', 'jsx', 'ts', 'js', 'vue']).optional().describe('示例代码语言'),
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
  description =
    '按关键词搜索组件（支持模糊搜索和智能排序，返回摘要，详情请用 get-component-info 获取）';
  inputSchema = {
    query: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('返回结果数量限制（1-100，默认 10）'),
  };

  private searchIndex = createSearchIndex();
  private indexBuilt = false;

  constructor(private componentIndex: ComponentIndex) {
    super();
    // 直接构建内存索引
    this.buildSearchIndex();
  }

  async execute(args: ToolArguments): Promise<SearchResultSummary[]> {
    const query = requireString(args, 'query');
    const limit = clampLimit(args.limit);

    if (!query) return [];

    // 确保索引已构建
    if (!this.indexBuilt) {
      this.buildSearchIndex();
    }

    try {
      // 使用内存索引搜索
      const indexedResults = this.searchIndex.search(query, limit);

      // 压成摘要返回
      const results: SearchResultSummary[] = indexedResults.map((result) => ({
        component: toComponentSummary(result.component),
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
  private fallbackSimpleSearch(query: string, limit: number): SearchResultSummary[] {
    const results: SearchResultSummary[] = [];
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
        results.push({ component: toComponentSummary(component), score, matchedFields });
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
    name: z.string().describe('组件名称或包名（也接受同包内的子组件名）'),
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
  inputSchema = {};

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
    name: z.string().describe('组件名称或包名'),
    version: z.string().optional().describe('只返回指定版本'),
  };

  /**
   * @param componentIndex - 组件索引
   * @param dataDir - 数据目录，用于加载文档快照
   * @param repoRoot - workspace 根；null 表示脱离仓库运行，只能读快照
   */
  constructor(
    private componentIndex: ComponentIndex,
    private dataDir = '',
    private repoRoot: string | null = null,
  ) {
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

    const empty = {
      changelog: [],
      packageName: component.packageName,
      currentVersion: component.version,
    };

    try {
      const raw = await this.readChangelog(component);
      if (!raw) return empty;

      return {
        changelog: this.parseChangelog(raw, version),
        packageName: component.packageName,
        currentVersion: component.version,
      };
    } catch (error) {
      log.error(`Error getting changelog for ${component.name}:`, error);
      return empty;
    }
  }

  /**
   * 读取 CHANGELOG 原文
   *
   * 有仓库时读磁盘（拿得到最新内容），否则退回 extract 时打进 data/ 的快照。
   * 发布到 npm 的包里没有 packages/ 源码，快照是那种场景下唯一的数据来源。
   */
  private async readChangelog(component: ComponentInfo): Promise<string | null> {
    const { readFile } = await import('node:fs/promises');

    if (this.repoRoot) {
      try {
        return await readFile(join(this.repoRoot, component.sourcePath, 'CHANGELOG.md'), 'utf8');
      } catch {
        // 仓库里没有就继续找快照
      }
    }

    try {
      const content = await readFile(join(this.dataDir, 'docs-index.json'), 'utf8');
      const docs = JSON.parse(content) as DocsIndex;
      return docs.docs?.[component.packageName]?.changelog ?? null;
    } catch {
      return null;
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
