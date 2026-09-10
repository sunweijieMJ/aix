import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ICONS_SVG_FILE } from '../constants';
import type { IconInfo } from '../extractors/icons-extractor';
import type {
  ComponentIndex,
  ComponentInfo,
  DocsIndex,
  ToolPackageIndex,
  ToolPackageInfo,
} from '../types/index';
import { log } from './logger';

/**
 * 数据落盘管理器
 */
export class DataManager {
  private outputDir: string;
  /** 累积的文档快照，saveDocsIndex 时统一落盘 */
  private docs: DocsIndex['docs'] = {};

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * 把文档正文从数据对象里摘出来，存进待落盘的快照表
   *
   * 正文不能留在主索引里：components-index.json 会被完整读进内存，
   * 而 get-component-info 又直接返回整个对象，正文留在里面等于每次
   * 查询都往上下文里灌几十 KB 的 markdown。
   */
  private stripDocs<
    T extends { packageName: string; readmeContent?: string; changelogContent?: string },
  >(item: T): T {
    const { readmeContent, changelogContent, ...rest } = item;

    if (readmeContent || changelogContent) {
      this.docs[item.packageName] = {
        ...(readmeContent ? { readme: readmeContent } : {}),
        ...(changelogContent ? { changelog: changelogContent } : {}),
      };
    }

    return rest as unknown as T;
  }

  /**
   * 保存文档快照索引
   *
   * 组件和工具包分两批提取、用的是不同的 DataManager 实例，
   * 所以这里必须与已有文件合并，否则后写的一批会把前一批冲掉。
   */
  private async saveDocsIndex(): Promise<void> {
    const count = Object.keys(this.docs).length;
    if (count === 0) return;

    const filePath = join(this.outputDir, 'docs-index.json');
    let existing: DocsIndex['docs'] = {};

    try {
      const { readFile } = await import('node:fs/promises');
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as DocsIndex;
      existing = parsed.docs ?? {};
    } catch {
      // 首次写入，无需合并
    }

    const merged = { ...existing, ...this.docs };
    const index: DocsIndex = {
      lastUpdated: new Date().toISOString(),
      docs: merged,
    };

    await this.saveJsonFile(filePath, index);
    log.info(`💾 文档快照已保存: 本批 ${count} 个包，合计 ${Object.keys(merged).length} 个`);
  }

  /**
   * 保存组件与图标数据
   */
  async saveComponents(rawComponents: ComponentInfo[], icons: IconInfo[] = []): Promise<void> {
    // 确保输出目录存在
    await this.ensureDirectoryExists(this.outputDir);

    // 摘出文档正文，主索引只留结构化数据
    const components = rawComponents.map((c) => this.stripDocs(c));

    // 保存主索引文件
    await this.saveMainIndex(components, icons);

    // 保存图标搜索索引和 SVG 源码
    if (icons.length > 0) {
      await this.saveIconsIndex(icons);
      await this.saveIconsSvg(icons);
    }

    // 保存文档快照
    await this.saveDocsIndex();

    log.info('✅ 所有数据文件已保存');
  }

  /**
   * 保存图标 SVG 源码映射
   *
   * 这是全仓唯一一份 SVG 源码，供 get-icon-svg 工具按需读取
   * （体积较大且只在内联图标时才需要，不放进任何索引）。
   */
  private async saveIconsSvg(icons: IconInfo[]): Promise<void> {
    const svgMap: Record<string, string> = {};
    for (const icon of icons) {
      if (icon.svgContent) {
        svgMap[icon.name] = icon.svgContent;
      }
    }

    await this.saveJsonFile(join(this.outputDir, ICONS_SVG_FILE), svgMap);
    log.info(`💾 图标 SVG 源码已保存: ${Object.keys(svgMap).length} 个`);
  }

  /**
   * 获取图标分类统计
   */
  private getIconCategories(icons: IconInfo[]): Record<string, number> {
    const categories: Record<string, number> = {};
    for (const icon of icons) {
      const category = icon.iconCategory || 'Unknown';
      categories[category] = (categories[category] || 0) + 1;
    }
    return categories;
  }

  /**
   * 保存主索引文件
   *
   * 保存完整的 ComponentInfo[]（文档正文已被 stripDocs 摘走），
   * 服务启动时一次性读进内存。
   */
  private async saveMainIndex(components: ComponentInfo[], icons: IconInfo[]): Promise<void> {
    const allCategories = new Set<string>();
    const allTags = new Set<string>();

    // 收集所有分类和标签
    for (const component of components) {
      allCategories.add(component.category);
      component.tags.forEach((tag) => allTags.add(tag));
    }

    for (const icon of icons) {
      allCategories.add(icon.category);
      icon.tags.forEach((tag) => allTags.add(tag));
    }

    const index: ComponentIndex = {
      components, // 保存完整的组件数据，确保工具可获取 props/examples 等
      categories: Array.from(allCategories).sort(),
      tags: Array.from(allTags).sort(),
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    await this.saveJsonFile(join(this.outputDir, 'components-index.json'), index);
    log.info('💾 主索引文件已保存');
  }

  /**
   * 保存图标搜索索引
   */
  private async saveIconsIndex(icons: IconInfo[]): Promise<void> {
    const iconsIndex = {
      lastUpdated: new Date().toISOString(),
      totalIcons: icons.length,
      categories: this.getIconCategories(icons),
      icons: icons.map((icon) => ({
        name: icon.name,
        packageName: icon.packageName,
        description: icon.description,
        category: icon.category,
        iconCategory: icon.iconCategory,
        tags: icon.tags,
        keywords: icon.keywords || [],
      })),
    };

    await this.saveJsonFile(join(this.outputDir, 'icons-index.json'), iconsIndex);
    log.info(`💾 图标搜索索引已保存: ${icons.length} 个图标`);
  }

  /**
   * 保存工具包数据
   */
  async saveToolPackages(rawPackages: ToolPackageInfo[]): Promise<void> {
    await this.ensureDirectoryExists(this.outputDir);

    const packages = rawPackages.map((p) => this.stripDocs(p));

    const allCategories = new Set<string>();
    const allTags = new Set<string>();
    for (const pkg of packages) {
      allCategories.add(pkg.category);
      pkg.tags.forEach((tag) => allTags.add(tag));
    }

    const index: ToolPackageIndex = {
      packages,
      categories: Array.from(allCategories).sort(),
      tags: Array.from(allTags).sort(),
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    await this.saveJsonFile(join(this.outputDir, 'packages-index.json'), index);
    log.info(`💾 工具包索引已保存: ${packages.length} 个工具包`);

    // 工具包的文档快照与组件分两次落盘，这里做增量合并
    await this.saveDocsIndex();
  }

  /**
   * 保存JSON文件
   */
  private async saveJsonFile(filePath: string, data: any): Promise<void> {
    await this.ensureDirectoryExists(dirname(filePath));
    const jsonContent = JSON.stringify(data, null, 2);
    await writeFile(filePath, jsonContent, 'utf8');
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      log.warn(`Failed to create directory ${dirPath}:`, error);
    }
  }
}
