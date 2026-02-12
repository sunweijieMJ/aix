import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { COMPONENT_LIBRARY_CONFIG } from '../constants';
import type { IconInfo } from '../extractors/icons-extractor';
import type { ComponentIndex, ComponentInfo } from '../types/index';
import { log } from './logger';

/**
 * 图标包名称（基于组件库配置）
 */
const ICONS_PACKAGE_NAME = `${COMPONENT_LIBRARY_CONFIG.packageScope}/icons`;

/**
 * 分类数据管理器
 */
export class DataManager {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * 按包保存组件数据
   */
  async saveComponentsByPackage(
    components: ComponentInfo[],
    icons: IconInfo[] = [],
  ): Promise<void> {
    // 确保输出目录存在
    await this.ensureDirectoryExists(this.outputDir);
    await this.ensureDirectoryExists(join(this.outputDir, 'packages'));

    // 按包分组组件
    const packageGroups = this.groupComponentsByPackage(components);

    // 保存各包数据
    const savePromises = Object.entries(packageGroups).map(
      ([packageName, packageComponents]) =>
        this.savePackageData(packageName, packageComponents),
    );

    // 特殊处理Icons包
    if (icons.length > 0) {
      savePromises.push(this.saveIconsPackageData(icons));
    }

    await Promise.all(savePromises);

    // 保存主索引文件
    await this.saveMainIndex(components, icons);

    // 保存图标搜索索引
    if (icons.length > 0) {
      await this.saveIconsIndex(icons);
    }

    log.info('✅ 所有数据文件已保存');
  }

  /**
   * 按包分组组件
   */
  private groupComponentsByPackage(
    components: ComponentInfo[],
  ): Record<string, ComponentInfo[]> {
    const packageGroups: Record<string, ComponentInfo[]> = {};

    for (const component of components) {
      const packageName = component.packageName;
      if (!packageGroups[packageName]) {
        packageGroups[packageName] = [];
      }
      packageGroups[packageName].push(component);
    }

    return packageGroups;
  }

  /**
   * 保存单个包的数据
   */
  private async savePackageData(
    packageName: string,
    components: ComponentInfo[],
  ): Promise<void> {
    const packageData = {
      packageName,
      totalCount: components.length,
      lastUpdated: new Date().toISOString(),
      components: components,
    };

    // 生成安全的文件名（移除特殊字符）
    const safeFileName = this.getSafeFileName(packageName);
    const filePath = join(this.outputDir, 'packages', `${safeFileName}.json`);

    await this.saveJsonFile(filePath, packageData);
    log.info(`💾 ${packageName} 包数据已保存: ${components.length} 个组件`);
  }

  /**
   * 保存Icons包数据
   */
  private async saveIconsPackageData(icons: IconInfo[]): Promise<void> {
    const iconsData = {
      packageName: ICONS_PACKAGE_NAME,
      category: '图标',
      totalCount: icons.length,
      lastUpdated: new Date().toISOString(),
      categories: this.getIconCategories(icons),
      icons: icons.map((icon) => ({
        ...icon,
        // 移除大的SVG内容以减小文件大小，只在详情时加载
        svgContent: undefined,
      })),
    };

    const iconsFileName = this.getSafeFileName(ICONS_PACKAGE_NAME);
    await this.saveJsonFile(
      join(this.outputDir, 'packages', `${iconsFileName}.json`),
      iconsData,
    );

    // 单独保存SVG内容映射
    const svgMap: Record<string, string> = {};
    for (const icon of icons) {
      if (icon.svgContent) {
        svgMap[icon.name] = icon.svgContent;
      }
    }
    await this.saveJsonFile(
      join(this.outputDir, 'packages', `${iconsFileName}-svg.json`),
      svgMap,
    );

    log.info(`💾 Icons包数据已保存: ${icons.length} 个图标`);
  }

  /**
   * 生成安全的文件名
   */
  private getSafeFileName(packageName: string): string {
    return packageName
      .replace(/[@/]/g, '-') // 替换 @ 和 / 为 -
      .replace(/^-+|-+$/g, '') // 移除开头和结尾的 -
      .toLowerCase();
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
   * 保存完整的 ComponentInfo[] 到主索引，确保服务器加载后
   * props/examples/version/dependencies 等字段可用。
   * 各包的详细数据同时保存到 packages/ 子目录供按需加载。
   */
  private async saveMainIndex(
    components: ComponentInfo[],
    icons: IconInfo[],
  ): Promise<void> {
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

    await this.saveJsonFile(
      join(this.outputDir, 'components-index.json'),
      index,
    );
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
        dataFile: 'packages/aix-icons.json',
      })),
    };

    await this.saveJsonFile(
      join(this.outputDir, 'icons-index.json'),
      iconsIndex,
    );
    log.info(`💾 图标搜索索引已保存: ${icons.length} 个图标`);
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
