/**
 * 工具包相关的 MCP 工具
 */

import { z } from 'zod';
import { MCP_TOOLS } from '../constants';
import type { ToolArguments, ToolPackageIndex, ToolPackageInfo } from '../types/index';
import { BaseTool, clampLimit, requireString } from './base';

/**
 * 工具包摘要
 *
 * 列表/搜索场景专用。完整的 ToolPackageInfo 带着 apiSections 的 markdown 原文，
 * 单次 search-packages 可达 40KB+，因此这两类工具只返回摘要。
 */
function toPackageSummary(pkg: ToolPackageInfo) {
  return {
    name: pkg.name,
    packageName: pkg.packageName,
    version: pkg.version,
    description: pkg.description,
    category: pkg.category,
    scope: pkg.scope,
    tags: pkg.tags,
    featuresCount: pkg.features.length,
    apiSectionTitles: pkg.apiSections.map((s) => s.title),
  };
}

/**
 * 列出所有工具包
 */
export class ListPackagesTool extends BaseTool {
  name = MCP_TOOLS.LIST_PACKAGES;
  description = '列出所有可用的工具包（kit/ 和 internal/ 下的非组件包）';
  inputSchema = {
    category: z.string().optional().describe('按分类过滤（工具包 | 基础设施 | 开发工具）'),
    scope: z.enum(['kit', 'internal']).optional().describe('按来源过滤'),
  };

  constructor(private packageIndex: ToolPackageIndex) {
    super();
  }

  async execute(args: ToolArguments) {
    let packages = this.packageIndex.packages;
    const category = typeof args.category === 'string' ? args.category : null;
    const scope = typeof args.scope === 'string' ? args.scope : null;

    if (category) {
      packages = packages.filter((p) => p.category === category);
    }
    if (scope) {
      packages = packages.filter((p) => p.scope === scope);
    }

    return {
      packages: packages.map((p) => ({
        name: p.name,
        packageName: p.packageName,
        version: p.version,
        description: p.description,
        category: p.category,
        scope: p.scope,
        tags: p.tags,
      })),
      total: packages.length,
    };
  }
}

/**
 * 获取工具包详细信息
 */
export class GetPackageInfoTool extends BaseTool {
  name = MCP_TOOLS.GET_PACKAGE_INFO;
  description =
    '获取指定工具包的详细信息（特性、API 文档目录、代码示例目录）。API 文档和代码示例默认都只返回标题目录，传 section / example 才展开对应正文';
  inputSchema = {
    name: z.string().describe('工具包名称或包名（如 "tracker" 或 "@kit/tracker"）'),
    section: z
      .string()
      .optional()
      .describe('API 文档章节标题（支持部分匹配）。省略则只返回章节目录，不返回正文'),
    example: z
      .string()
      .optional()
      .describe('代码示例标题（支持部分匹配）。省略则只返回示例目录，不返回代码'),
  };

  constructor(private packageIndex: ToolPackageIndex) {
    super();
  }

  async execute(args: ToolArguments) {
    const name = requireString(args, 'name');
    const section = typeof args.section === 'string' ? args.section.toLowerCase() : null;
    const example = typeof args.example === 'string' ? args.example.toLowerCase() : null;
    const pkg = this.findPackage(name);

    if (!pkg) {
      throw new Error(`未找到工具包: ${name}`);
    }

    // API 文档正文动辄数万字符，默认只给目录，按需展开单个章节
    const apiSections = section
      ? pkg.apiSections.filter((s) => s.title.toLowerCase().includes(section))
      : pkg.apiSections.map((s) => ({ title: s.title, chars: s.content.length }));

    // 代码示例同理：i18n-tools 的 16 条示例占了默认响应的一大半
    const examples = example
      ? pkg.examples.filter((e) => e.title.toLowerCase().includes(example))
      : pkg.examples.map((e) => ({ title: e.title, language: e.language, chars: e.code.length }));

    return { ...pkg, apiSections, examples };
  }

  private findPackage(name: string): ToolPackageInfo | null {
    const normalized = name.toLowerCase();
    return (
      this.packageIndex.packages.find(
        (p) =>
          p.name.toLowerCase() === normalized ||
          p.packageName.toLowerCase() === normalized ||
          p.packageName.toLowerCase().endsWith(`/${normalized}`),
      ) || null
    );
  }
}

/**
 * 搜索工具包
 */
export class SearchPackagesTool extends BaseTool {
  name = MCP_TOOLS.SEARCH_PACKAGES;
  description =
    '按关键词搜索工具包（匹配名称、描述、标签、特性；返回摘要，详情请用 get-package-info 获取）';
  inputSchema = {
    query: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('返回结果数量限制（1-100，默认 10）'),
  };

  constructor(private packageIndex: ToolPackageIndex) {
    super();
  }

  async execute(args: ToolArguments) {
    const query = requireString(args, 'query');
    const limit = clampLimit(args.limit);

    if (!query) {
      return { results: [], total: 0 };
    }

    const queryLower = query.toLowerCase();
    const allMatched = this.packageIndex.packages
      .map((pkg) => ({
        package: toPackageSummary(pkg),
        score: this.calculateScore(pkg, queryLower),
        matchedFields: this.getMatchedFields(pkg, queryLower),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    return { results: allMatched.slice(0, limit), total: allMatched.length };
  }

  private calculateScore(pkg: ToolPackageInfo, query: string): number {
    let score = 0;

    if (pkg.name.toLowerCase() === query) score += 100;
    else if (pkg.name.toLowerCase().includes(query)) score += 50;
    if (pkg.packageName.toLowerCase().includes(query)) score += 40;

    if (pkg.description.toLowerCase().includes(query)) score += 30;

    for (const tag of pkg.tags) {
      if (tag.toLowerCase().includes(query)) score += 20;
    }

    for (const feature of pkg.features) {
      if (feature.toLowerCase().includes(query)) score += 15;
    }

    return score;
  }

  private getMatchedFields(pkg: ToolPackageInfo, query: string): string[] {
    const fields: string[] = [];
    if (pkg.name.toLowerCase().includes(query)) fields.push('name');
    if (pkg.packageName.toLowerCase().includes(query)) fields.push('packageName');
    if (pkg.description.toLowerCase().includes(query)) fields.push('description');
    if (pkg.tags.some((t) => t.toLowerCase().includes(query))) fields.push('tags');
    if (pkg.features.some((f) => f.toLowerCase().includes(query))) fields.push('features');
    return fields;
  }
}
