import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COMPONENT_LIBRARY_CONFIG } from '../constants';
import type { ComponentExample, ComponentInfo } from '../types/index';
import { readPackageJson } from '../utils/index';
import { log } from '../utils/logger';
import { findRepoRoot, toRepoRelative } from '../utils/repo-root';

/** 图标包名 */
const ICONS_PACKAGE_NAME = `${COMPONENT_LIBRARY_CONFIG.packageScope}/icons`;

/**
 * 图标名英文词 -> 中文别名
 *
 * 图标名是英文驼峰，而使用者基本用中文提问，不建这层映射的话
 * "用户""设置""删除""搜索" 这类查询命中数一律为 0。
 *
 * 注意：本图标集里还有相当数量的拼音全称命名（如 BaoKongRenYuanJianKong），
 * 这类只能用拼音或英文检索，中文检索覆盖不到。
 */
const ICON_WORD_ALIASES: Record<string, string[]> = {
  account: ['账号', '账户', '用户', 'user'],
  add: ['添加', '新增', '加号'],
  alarm: ['闹钟', '警报'],
  alert: ['警告', '提醒'],
  arrow: ['箭头'],
  back: ['返回', '后退'],
  calendar: ['日历', '日期'],
  camera: ['相机', '摄像头', '拍照'],
  cancel: ['取消'],
  chart: ['图表'],
  check: ['勾选', '对勾', '完成'],
  circle: ['圆形', '圆圈'],
  clock: ['时钟', '时间'],
  close: ['关闭', '叉号'],
  cloud: ['云', '云端'],
  copy: ['复制'],
  delete: ['删除', '移除', 'remove'],
  document: ['文档'],
  down: ['向下', '下'],
  download: ['下载'],
  edit: ['编辑', '修改'],
  error: ['错误', '异常'],
  favorite: ['收藏', '喜欢'],
  file: ['文件'],
  filter: ['筛选', '过滤'],
  folder: ['文件夹', '目录'],
  forward: ['前进', '转发'],
  help: ['帮助'],
  home: ['首页', '主页', 'home'],
  image: ['图片', '图像', 'photo', 'picture'],
  info: ['信息', '详情'],
  left: ['向左', '左'],
  link: ['链接'],
  list: ['列表'],
  local: ['本地'],
  location: ['位置', '定位', '地点'],
  lock: ['锁', '锁定'],
  mail: ['邮件', '邮箱'],
  map: ['地图'],
  menu: ['菜单'],
  message: ['消息'],
  more: ['更多'],
  notification: ['通知', '提醒'],
  off: ['关闭', '关'],
  on: ['开启', '开'],
  pause: ['暂停'],
  person: ['人员', '用户', '人', 'user', 'account'],
  phone: ['电话', '手机'],
  photo: ['照片', '图片', 'image', 'picture'],
  play: ['播放'],
  print: ['打印'],
  refresh: ['刷新'],
  remove: ['移除', '删除', 'delete'],
  right: ['向右', '右'],
  save: ['保存'],
  search: ['搜索', '查找', '查询'],
  send: ['发送'],
  setting: ['设置', '配置', 'config'],
  settings: ['设置', '配置', 'config'],
  share: ['分享', '共享'],
  sort: ['排序'],
  star: ['星标', '收藏'],
  statistic: ['统计'],
  time: ['时间'],
  up: ['向上', '上'],
  upload: ['上传'],
  user: ['用户', '人员'],
  vehicle: ['车辆', '车'],
  video: ['视频'],
  view: ['查看', '预览'],
  warning: ['警告'],
};

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
        const iconInfo = await this.createIconInfo(packageInfo, iconExport, packagePath);
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
      const exports: Array<{ name: string; path: string; category: string }> = [];

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

    // 落盘的路径必须是仓库相对路径，绝对路径会把提取者本机的目录结构带进产物
    const repoRoot = findRepoRoot(packagePath);
    const sourcePath = repoRoot ? toRepoRelative(iconFilePath, repoRoot) : iconFilePath;

    // 读取 SVG 内容
    const svgContent = await this.extractSvgContent(iconFilePath);

    // 生成使用示例
    const examples = this.generateIconExamples(iconExport.name);

    // 提取关键词
    const keywords = this.extractKeywords(iconExport.name, iconExport.category);

    const iconInfo: IconInfo = {
      name: iconExport.name,
      // 必须是真实可解析的包名。早先这里拼的是 `@aix/icons/AccountCircle`，
      // 而 exports 映射是 `./*` -> `./es/*.vue.js`，图标实际在 es/<分类>/ 下，
      // 这个 specifier 根本 resolve 不到，LLM 照抄就是一个 import 错误
      packageName: ICONS_PACKAGE_NAME,
      version: packageInfo.version,
      description: `${iconExport.name} 图标组件，属于 ${this.getCategoryDisplayName(iconExport.category)} 分类`,
      category: '图标',
      iconCategory: iconExport.category,
      tags: ['icon', 'svg', iconExport.category.toLowerCase(), ...keywords],
      author: packageInfo.author || '',
      license: packageInfo.license || 'MIT',

      sourcePath,

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
   *
   * 图标是 Vue SFC，模板里的 `:width="width"`、`v-bind="$attrs"` 等绑定
   * 在 Vue 之外是无效属性，直接内联进 HTML 会得到一个没有尺寸的图标。
   * 这里把它们还原成静态属性，产出可独立使用的标准 SVG。
   */
  private async extractSvgContent(filePath: string): Promise<string | undefined> {
    try {
      const content = await readFile(filePath, 'utf8');

      const svgMatch = content.match(/<svg[^>]*>[\s\S]*?<\/svg>/);
      if (!svgMatch) return undefined;

      // 先剥离 Vue 绑定再切分开始标签：绑定值里可能含 `>`（如 v-if="a > b"），
      // 先按 indexOf('>') 切会切在属性中间
      const stripped = svgMatch[0]
        // 尺寸绑定 -> 固定值，与组件默认值一致
        .replace(/\s:width="[^"]*"/g, ' width="24"')
        .replace(/\s:height="[^"]*"/g, ' height="24"')
        // 其余 Vue 指令和动态绑定在纯 SVG 里没有意义
        // （颜色由 fill="currentColor" 继承，不需要 :style）
        .replace(/\sv-[\w:.-]+="[^"]*"/g, '')
        .replace(/\s:[\w.-]+="[^"]*"/g, '');

      const openTagEnd = stripped.indexOf('>');
      const openTag = stripped.slice(0, openTagEnd).replace(/\s+/g, ' ').trim();

      return `${openTag}>${stripped.slice(openTagEnd + 1)}`.replace(/\n\s+/g, '\n  ').trim();
    } catch (error) {
      log.warn(`Failed to extract SVG content from ${filePath}:`, error);
      return undefined;
    }
  }

  /**
   * 生成图标使用示例
   *
   * 图标是 Vue SFC，示例必须是 Vue 写法——早先这里生成的是 React JSX
   * （`function MyComponent() { return (<div>…` 、`style={{}}`），
   * 还 import 了 `@ant-design/icons`，直接喂给 LLM 会产出跑不起来的代码。
   */
  private generateIconExamples(iconName: string): ComponentExample[] {
    return [
      {
        title: '基础使用',
        description: `${iconName} 图标的基本使用方法`,
        code: `<template>
  <${iconName} />
</template>

<script setup lang="ts">
import { ${iconName} } from '${ICONS_PACKAGE_NAME}';
</script>`,
        language: 'vue',
      },
      {
        title: '自定义尺寸和颜色',
        description: '通过 width / height / color props 控制外观',
        code: `<template>
  <${iconName} :width="32" :height="32" color="var(--aix-colorPrimary)" />
</template>

<script setup lang="ts">
import { ${iconName} } from '${ICONS_PACKAGE_NAME}';
</script>`,
        language: 'vue',
      },
      {
        title: '全局注册',
        description: '注册为全局组件后可在任意模板中直接使用',
        code: `import { createApp } from 'vue';
import { ${iconName} } from '${ICONS_PACKAGE_NAME}';

createApp(App).component('${iconName}', ${iconName}).mount('#app');`,
        language: 'ts',
      },
    ];
  }

  /**
   * 从图标名称和分类中提取关键词
   *
   * 关键词里必须带中文：图标名全是英文驼峰，只拆英文的话
   * "用户""设置""删除""搜索" 这类查询一条都命中不了，
   * 而这套组件库的使用者基本都用中文提问。
   */
  private extractKeywords(iconName: string, category: string): string[] {
    const keywords: string[] = [];

    // 从图标名称中提取关键词（按驼峰命名拆分）
    const nameWords = iconName
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .split(' ')
      .filter(Boolean);
    keywords.push(...nameWords);

    // 英文词逐个映射中文别名
    for (const word of nameWords) {
      const aliases = ICON_WORD_ALIASES[word];
      if (aliases) keywords.push(...aliases);
    }

    // 添加分类相关关键词
    keywords.push(category.toLowerCase());

    // 根据分类添加特定关键词
    const categoryKeywords = this.getCategoryKeywords(category);
    keywords.push(...categoryKeywords);

    // 去重并过滤短词（中文两字词要保留，所以只过滤单字符英文）
    return [...new Set(keywords)].filter((word) => word.length > 1 || /[一-鿿]/.test(word));
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
      categoriesCount[icon.iconCategory] = (categoriesCount[icon.iconCategory] || 0) + 1;

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
