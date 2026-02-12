import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ComponentExample, ComponentInfo } from '../types/index';
import { readPackageJson } from '../utils/index';
import { log } from '../utils/logger';

/**
 * 图标信息接口
 */
export interface IconInfo extends Omit<ComponentInfo, 'props'> {
  /** 图标分类 */
  iconCategory: string;
  /** SVG 内容 */
  svgContent?: string;
  /** 图标尺寸 */
  size?: string;
  /** 图标关键词 */
  keywords: string[];
}

/**
 * Icons 包专用提取器
 */
export class IconsExtractor {
  /**
   * 从 Icons 包中提取所有图标信息
   */
  async extractIconsFromPackage(packagePath: string): Promise<IconInfo[]> {
    const packageInfo = await readPackageJson(packagePath);
    if (!packageInfo) {
      return [];
    }

    const icons: IconInfo[] = [];

    // 读取 index.tsx 获取所有图标导出
    const indexPath = join(packagePath, 'src', 'index.ts');
    const iconExports = await this.parseIconExports(indexPath);

    if (iconExports.length === 0) {
      log.warn('No icon exports found in index.ts');
      return [];
    }

    log.info(`Found ${iconExports.length} icon exports`);

    // 为每个图标创建单独的组件信息
    for (const iconExport of iconExports) {
      try {
        const iconInfo = await this.createIconInfo(
          packageInfo,
          iconExport,
          packagePath,
        );
        if (iconInfo) {
          icons.push(iconInfo);
        }
      } catch (error) {
        log.warn(`Failed to process icon ${iconExport.name}:`, error);
      }
    }

    log.info(`Successfully extracted ${icons.length} icons`);
    return icons;
  }

  /**
   * 解析 index.tsx 中的图标导出
   */
  private async parseIconExports(indexPath: string): Promise<
    Array<{
      name: string;
      path: string;
      category: string;
    }>
  > {
    try {
      const content = await readFile(indexPath, 'utf8');
      const exports: Array<{ name: string; path: string; category: string }> =
        [];

      // 匹配 export { default as IconName } from './Category/IconName';
      const exportRegex =
        /export\s+\{\s*default\s+as\s+(\w+)\s*\}\s+from\s+['"]\.\/([^/]+)\/([^'"]+)['"];/g;
      let match;

      while ((match = exportRegex.exec(content)) !== null) {
        const [, iconName, category, fileName] = match;
        if (iconName && category && fileName) {
          exports.push({
            name: iconName,
            path: `${category}/${fileName}`,
            category: category,
          });
        }
      }

      return exports;
    } catch (error) {
      log.error(`Failed to parse icon exports from ${indexPath}:`, error);
      return [];
    }
  }

  /**
   * 创建单个图标的组件信息
   */
  private async createIconInfo(
    packageInfo: any,
    iconExport: { name: string; path: string; category: string },
    packagePath: string,
  ): Promise<IconInfo | null> {
    const iconFilePath = join(packagePath, 'src', iconExport.path);

    // 读取 SVG 内容
    const svgContent = await this.extractSvgContent(iconFilePath);

    // 生成使用示例
    const examples = this.generateIconExamples(iconExport.name);

    // 提取关键词
    const keywords = this.extractKeywords(iconExport.name, iconExport.category);

    const iconInfo: IconInfo = {
      name: iconExport.name,
      packageName: `@aix/icons/${iconExport.name}`,
      version: packageInfo.version,
      description: `${iconExport.name} 图标组件，属于 ${this.getCategoryDisplayName(iconExport.category)} 分类`,
      category: '图标',
      iconCategory: iconExport.category,
      tags: ['icon', 'svg', iconExport.category.toLowerCase(), ...keywords],
      author: packageInfo.author || '',
      license: packageInfo.license || 'MIT',

      sourcePath: iconFilePath,

      dependencies: [],
      peerDependencies: Object.keys(packageInfo.peerDependencies || {}),

      examples,
      svgContent,
      keywords,
    };

    return iconInfo;
  }

  /**
   * 从图标文件中提取 SVG 内容
   */
  private async extractSvgContent(
    filePath: string,
  ): Promise<string | undefined> {
    try {
      const content = await readFile(filePath, 'utf8');

      // 提取 SVG 元素
      const svgMatch = content.match(/<svg[^>]*>[\s\S]*?<\/svg>/);
      return svgMatch?.[0];
    } catch (error) {
      log.warn(`Failed to extract SVG content from ${filePath}:`, error);
      return undefined;
    }
  }

  /**
   * 生成图标使用示例
   */
  private generateIconExamples(iconName: string): ComponentExample[] {
    return [
      {
        title: '基础使用',
        description: `${iconName} 图标的基本使用方法`,
        code: `import { ${iconName} } from '@aix/icons';

function MyComponent() {
  return (
    <div>
      <${iconName} />
    </div>
  );
}`,
        language: 'tsx',
      },
      {
        title: '自定义样式',
        description: '设置图标颜色和大小',
        code: `import { ${iconName} } from '@aix/icons';

function MyComponent() {
  return (
    <div>
      <${iconName}
        style={{
          color: 'red',
          fontSize: '24px'
        }}
      />
    </div>
  );
}`,
        language: 'tsx',
      },
      {
        title: '配合 AIX',
        description: '与 AIX 的 Icon 组件一起使用',
        code: `import { ${iconName} } from '@aix/icons';
import Icon from '@ant-design/icons';

function MyComponent() {
  return (
    <div>
      <Icon
        component={${iconName}}
        style={{ fontSize: '20px', color: '#1890ff' }}
      />
    </div>
  );
}`,
        language: 'tsx',
      },
    ];
  }

  /**
   * 从图标名称和分类中提取关键词
   */
  private extractKeywords(iconName: string, category: string): string[] {
    const keywords: string[] = [];

    // 从图标名称中提取关键词（按驼峰命名拆分）
    const nameWords = iconName
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .split(' ');
    keywords.push(...nameWords);

    // 添加分类相关关键词
    keywords.push(category.toLowerCase());

    // 根据分类添加特定关键词
    const categoryKeywords = this.getCategoryKeywords(category);
    keywords.push(...categoryKeywords);

    // 去重并过滤短词
    return [...new Set(keywords)].filter((word) => word.length > 1);
  }

  /**
   * 获取分类相关关键词
   */
  private getCategoryKeywords(category: string): string[] {
    const keywordMap: Record<string, string[]> = {
      Apps: ['应用', '程序', 'application', 'app'],
      Device: ['设备', '硬件', 'hardware', 'device'],
      Editor: ['编辑', '编辑器', 'edit', 'editor'],
      File: ['文件', '文档', 'file', 'document'],
      General: ['通用', '常用', 'general', 'common'],
      Image: ['图片', '图像', 'image', 'picture'],
      Map: ['地图', '位置', 'map', 'location'],
      Notification: ['通知', '提醒', 'notification', 'alert'],
      Video: ['视频', '播放', 'video', 'play'],
    };

    return keywordMap[category] || [];
  }

  /**
   * 获取分类显示名称
   */
  private getCategoryDisplayName(category: string): string {
    const displayNames: Record<string, string> = {
      Apps: '应用程序',
      Device: '设备硬件',
      Editor: '编辑工具',
      File: '文件文档',
      General: '通用图标',
      Image: '图片图像',
      Map: '地图位置',
      Notification: '通知提醒',
      Video: '视频播放',
    };

    return displayNames[category] || category;
  }

  /**
   * 获取图标统计信息
   */
  async getIconsStats(packagePath: string): Promise<{
    totalIcons: number;
    categoriesCount: Record<string, number>;
    keywordsCount: Record<string, number>;
  }> {
    const icons = await this.extractIconsFromPackage(packagePath);

    const categoriesCount: Record<string, number> = {};
    const keywordsCount: Record<string, number> = {};

    for (const icon of icons) {
      // 统计分类
      categoriesCount[icon.iconCategory] =
        (categoriesCount[icon.iconCategory] || 0) + 1;

      // 统计关键词
      for (const keyword of icon.keywords) {
        keywordsCount[keyword] = (keywordsCount[keyword] || 0) + 1;
      }
    }

    return {
      totalIcons: icons.length,
      categoriesCount,
      keywordsCount,
    };
  }
}
