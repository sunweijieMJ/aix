import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IconInfo } from '../extractors/icons-extractor';
import type { ComponentIndex, ComponentInfo } from '../types/index';
import { log } from './logger';

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

    // 保存组件搜索索引
    await this.saveSearchIndex(components);

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
      packageName: '@aix/icons',
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

    await this.saveJsonFile(
      join(this.outputDir, 'packages', 'aix-icons.json'),
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
      join(this.outputDir, 'packages', 'aix-icons-svg.json'),
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
      const category = (icon as any).iconCategory || 'Unknown';
      categories[category] = (categories[category] || 0) + 1;
    }
    return categories;
  }

  /**
   * 保存主索引文件
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
      components: [], // 主索引不包含完整组件数据，只包含引用
      categories: Array.from(allCategories).sort(),
      tags: Array.from(allTags).sort(),
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    // 添加组件引用信息
    const componentRefs = components.map((comp) => ({
      name: comp.name,
      packageName: comp.packageName,
      category: comp.category,
      description: comp.description,
      tags: comp.tags,
      dataFile: this.getDataFileForPackage(comp.packageName),
    }));

    // 图标现在单独存储在 icons-index.json 中，不再包含在组件索引中

    const indexWithRefs = {
      ...index,
      components: componentRefs, // 只包含组件，不包含图标
      totalComponents: components.length,
      totalIcons: icons.length,
    };

    await this.saveJsonFile(
      join(this.outputDir, 'components-index.json'),
      indexWithRefs,
    );
    log.info('💾 主索引文件已保存');
  }

  /**
   * 根据包名获取数据文件路径
   */
  private getDataFileForPackage(packageName: string): string {
    if (packageName === '@aix/icons') {
      return 'packages/aix-icons.json';
    }
    const safeFileName = this.getSafeFileName(packageName);
    return `packages/${safeFileName}.json`;
  }

  /**
   * 根据分类获取数据文件路径（保留作为备用）
   */
  private getDataFileForCategory(category: string): string {
    const fileMap: Record<string, string> = {
      表单: 'components/forms.json',
      选择器: 'components/pickers.json',
      弹窗: 'components/modals.json',
      媒体: 'components/media.json',
      主题: 'components/theme.json',
      图标: 'components/icons.json',
    };

    return fileMap[category] || 'components/others.json';
  }

  /**
   * 保存组件搜索索引
   */
  private async saveSearchIndex(components: ComponentInfo[]): Promise<void> {
    const searchIndex = {
      lastUpdated: new Date().toISOString(),
      totalComponents: components.length,
      components: components.map((comp) => ({
        name: comp.name,
        packageName: comp.packageName,
        description: comp.description,
        category: comp.category,
        tags: comp.tags,
        keywords: this.extractSearchKeywords(comp),
        dataFile: this.getDataFileForPackage(comp.packageName),
      })),
    };

    await this.saveJsonFile(
      join(this.outputDir, 'search-index.json'),
      searchIndex,
    );
    log.info(`💾 组件搜索索引已保存: ${components.length} 个组件`);
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
        iconCategory: (icon as any).iconCategory,
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
   * 提取搜索关键词
   */
  private extractSearchKeywords(component: ComponentInfo): string[] {
    const keywords = new Set<string>();

    // 从名称中提取
    const nameWords = component.name
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .split(' ');
    nameWords.forEach((word) => keywords.add(word));

    // 从包名中提取
    const packageWords = component.packageName
      .replace(/[@/-]/g, ' ')
      .split(' ');
    packageWords.forEach((word) => {
      if (word.length > 1) keywords.add(word.toLowerCase());
    });

    // 添加标签
    component.tags.forEach((tag) => keywords.add(tag.toLowerCase()));

    return Array.from(keywords).filter((word) => word.length > 1);
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

  /**
   * 读取分类数据
   */
  async loadCategoryData(category: string): Promise<any> {
    const filePath = join(
      this.outputDir,
      this.getDataFileForCategory(category),
    );
    try {
      const content = await readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      log.warn(`Failed to load category data for ${category}:`, error);
      return null;
    }
  }

  /**
   * 读取图标SVG内容
   */
  async loadIconSvg(iconName: string): Promise<string | null> {
    const filePath = join(this.outputDir, 'components', 'icons-svg.json');
    try {
      const content = await readFile(filePath, 'utf8');
      const svgMap = JSON.parse(content);
      return svgMap[iconName] || null;
    } catch (error) {
      log.warn(`Failed to load SVG for icon ${iconName}:`, error);
      return null;
    }
  }
}
