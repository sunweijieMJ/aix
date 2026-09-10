import { COMPONENT_LIBRARY_CONFIG, DEFAULT_MAX_CONCURRENT_EXTRACTION } from '../constants';
import { createParsers } from '../parsers/index';
import type { ComponentExample, ComponentInfo, ExtractorConfig, PackageInfo } from '../types/index';
import {
  DataManager,
  findComponentFiles,
  findPackages,
  getDisplayName,
  readPackageJson,
} from '../utils/index';
import { log } from '../utils/logger';
import { ConcurrencyController } from '../utils/performance';
import { findRepoRoot, toRepoRelative } from '../utils/repo-root';
import { IconsExtractor } from './icons-extractor';
import type { IconInfo } from './icons-extractor';
import { ReadmeExtractor, toSubComponentName } from './readme-extractor';

/**
 * 图标包名称（基于组件库配置）
 */
const ICONS_PACKAGE_NAME = `${COMPONENT_LIBRARY_CONFIG.packageScope}/icons`;

/**
 * 组件提取器
 */
export class ComponentExtractor {
  private readmeExtractor: ReadmeExtractor;
  private iconsExtractor: IconsExtractor;
  private parsers: ReturnType<typeof createParsers>;
  private config: ExtractorConfig;
  private concurrencyController: ConcurrencyController;
  private dataManager: DataManager;
  /** workspace 根，用于把绝对路径相对化后落盘 */
  private repoRoot: string;

  constructor(config: ExtractorConfig) {
    this.config = config;
    this.readmeExtractor = new ReadmeExtractor();
    this.iconsExtractor = new IconsExtractor();
    this.parsers = createParsers();
    this.concurrencyController = new ConcurrencyController(
      config.maxConcurrentExtraction || DEFAULT_MAX_CONCURRENT_EXTRACTION,
    );
    this.dataManager = new DataManager(config.outputDir);

    const repoRoot = findRepoRoot(config.packagesDir);
    if (!repoRoot) {
      log.warn(
        `⚠️ 未找到 workspace 根（${config.packagesDir} 向上无 pnpm-workspace.yaml），路径将保持绝对路径`,
      );
    }
    this.repoRoot = repoRoot ?? '';
  }

  /**
   * 把绝对路径转成相对 workspace 根的路径
   */
  private relativize(absolutePath: string): string {
    return this.repoRoot ? toRepoRelative(absolutePath, this.repoRoot) : absolutePath;
  }

  /**
   * 汇总一个包内出现过的子组件名
   *
   * 不把它们拆成独立的顶层组件：README 章节标题只有一部分是真组件名，
   * 剩下的是 API 种类（`Props`）、函数名（`createLocale`）或说明性标题
   * （`音频来源契约`），照单拆分会产出一堆不存在的"组件"。
   */
  private collectSubComponents(
    ...groups: Array<Array<{ group?: string }> | undefined>
  ): string[] | undefined {
    const names = new Set<string>();

    for (const list of groups) {
      for (const item of list ?? []) {
        const name = toSubComponentName(item.group);
        if (name) names.add(name);
      }
    }

    // 只有一个、且就是包本身的显示名时没有区分价值
    return names.size > 1 ? [...names].sort() : undefined;
  }

  /**
   * 读取可选文件，不存在返回 undefined
   */
  private async readOptional(filePath: string): Promise<string | undefined> {
    try {
      const { readFile } = await import('node:fs/promises');
      return await readFile(filePath, 'utf8');
    } catch {
      return undefined;
    }
  }

  /**
   * 核心提取逻辑：并发提取所有包，返回组件和图标
   */
  private async extractPackages(options?: {
    includeIcons?: boolean;
  }): Promise<{ components: ComponentInfo[]; icons: IconInfo[] }> {
    const packagePaths = await findPackages(this.config.packagesDir);
    const components: ComponentInfo[] = [];
    const icons: IconInfo[] = [];

    if (!packagePaths || packagePaths.length === 0) {
      if (this.config.verbose) {
        log.warn('⚠️ 未找到任何包');
      }
      return { components, icons };
    }

    if (this.config.verbose) {
      log.info(`📦 开始并发提取 ${packagePaths.length} 个包...`);
    }

    const extractTasks = packagePaths.map((packagePath) =>
      this.concurrencyController.execute(async () => {
        try {
          // 提取图标包
          if (options?.includeIcons) {
            const packageInfo = await readPackageJson(packagePath);
            if (packageInfo?.name === ICONS_PACKAGE_NAME) {
              const extractedIcons = await this.iconsExtractor.extractIconsFromPackage(packagePath);
              icons.push(...extractedIcons);
              if (this.config.verbose) {
                log.info(`🎨 提取了 ${extractedIcons.length} 个图标`);
              }
              return;
            }
          }

          const component = await this.extractComponentFromPackage(packagePath);
          if (component) {
            components.push(component);
          }
        } catch (error) {
          log.error(`Failed to extract component from ${packagePath}:`, error);
        }
      }),
    );

    await Promise.all(extractTasks);

    if (this.config.verbose) {
      const iconMsg = options?.includeIcons && icons.length > 0 ? `和 ${icons.length} 个图标` : '';
      log.info(`✅ 成功提取 ${components.length} 个组件${iconMsg}`);
    }

    return { components, icons };
  }

  /**
   * 提取所有组件信息
   */
  async extractAllComponents(): Promise<ComponentInfo[]> {
    const { components } = await this.extractPackages();
    return components;
  }

  /**
   * 提取所有组件和图标并保存
   */
  async extractAndSaveAllComponents(): Promise<{
    components: ComponentInfo[];
    icons: IconInfo[];
  }> {
    const result = await this.extractPackages({ includeIcons: true });
    await this.dataManager.saveComponents(result.components, result.icons);
    return result;
  }

  /**
   * 增量提取组件
   *
   * 仅提取自上次提取后有更新的组件，提高效率
   */
  async extractIncrementalComponents(lastExtractTime: Date): Promise<ComponentInfo[]> {
    const packagePaths = await findPackages(this.config.packagesDir);
    const components: ComponentInfo[] = [];

    if (!packagePaths || packagePaths.length === 0) {
      if (this.config.verbose) {
        log.warn('⚠️ 未找到任何包');
      }
      return components;
    }

    if (this.config.verbose) {
      log.info(`📦 开始增量提取，基准时间: ${lastExtractTime.toISOString()}`);
    }

    // 使用并发控制器处理包提取
    const extractTasks = packagePaths.map((packagePath) =>
      this.concurrencyController.execute(async () => {
        try {
          // 检查包是否有更新
          const isUpdated = await this.isPackageUpdatedSince(packagePath, lastExtractTime);
          if (isUpdated) {
            if (this.config.verbose) {
              log.info(`🔄 检测到更新: ${packagePath}`);
            }
            const component = await this.extractComponentFromPackage(packagePath);
            if (component) {
              components.push(component);
            }
          }
        } catch (error) {
          log.error(`Failed to extract component from ${packagePath}:`, error);
        }
      }),
    );

    await Promise.all(extractTasks);

    if (this.config.verbose) {
      log.info(`✅ 增量提取完成，更新了 ${components.length} 个组件`);
    }

    return components;
  }

  /**
   * 检查包是否在指定时间后更新
   */
  private async isPackageUpdatedSince(packagePath: string, since: Date): Promise<boolean> {
    try {
      const { stat } = await import('node:fs/promises');
      const { join } = await import('node:path');

      // 检查关键文件是否有更新
      const filesToCheck = [
        join(packagePath, 'package.json'),
        join(packagePath, 'src'),
        join(packagePath, 'README.md'),
        join(packagePath, 'CHANGELOG.md'),
      ];

      for (const file of filesToCheck) {
        try {
          const stats = await stat(file);
          if (stats.mtime > since) {
            return true;
          }
        } catch {
          // 文件可能不存在，继续检查下一个
        }
      }

      return false;
    } catch {
      return true; // 如果无法获取文件信息，默认认为需要更新
    }
  }

  /**
   * 从单个包中提取组件信息
   */
  async extractComponentFromPackage(packagePath: string): Promise<ComponentInfo | null> {
    // 读取 package.json
    const packageInfo = await readPackageJson(packagePath);
    if (!packageInfo) {
      return null;
    }

    // 检查是否在忽略列表中
    if (this.config.ignorePackages?.includes(packageInfo.name)) {
      return null;
    }

    // 查找组件文件
    const files = await findComponentFiles(packagePath);

    // 优先从 README.md 提取信息
    let readmeData: Awaited<ReturnType<typeof this.readmeExtractor.extractFromReadme>> = null;
    if (files.readmeFiles.length > 0 && files.readmeFiles[0]) {
      readmeData = await this.readmeExtractor.extractFromReadme(files.readmeFiles[0]);
    }

    // 如果 README 提取失败，回退到传统方法
    let props: ComponentInfo['props'] = [];
    let emits: ComponentInfo['emits'] = [];
    let slots: ComponentInfo['slots'] = [];
    let examples: ComponentExample[];
    let description: string;
    let category: string;
    let tags: string[];

    if (readmeData) {
      // 使用 README 提取的数据
      props = readmeData.props;
      emits = readmeData.emits;
      slots = readmeData.slots;
      examples = readmeData.examples;
      description = readmeData.description;
      category = readmeData.category;
      tags = readmeData.tags;

      if (this.config.verbose) {
        log.info(`✅ 从 README 提取组件信息: ${readmeData.title}`);
        log.info(`  - Props: ${props.length} 个`);
        log.info(`  - Emits: ${emits.length} 个`);
        log.info(`  - Slots: ${slots.length} 个`);
        log.info(`  - Examples: ${examples.length} 个`);
        log.info(`  - Category: ${category}`);
        log.info(`  - Tags: ${tags.join(', ')}`);
      }
    } else {
      // 回退到传统提取方法
      if (this.config.verbose) {
        log.warn(`⚠️ README 提取失败，使用传统方法: ${packageInfo.name}`);
      }

      // 提取示例（从 Stories 文件）
      examples = await this.extractExamples(files);

      // 从 package.json 获取基本信息
      description = packageInfo.description || '';
      category = this.extractCategory(packageInfo.name);
      tags = this.extractTags(packageInfo, '');
    }

    // 文档快照：发布出去的包里没有 packages/ 源码，靠快照保证文档类能力可用
    const { join } = await import('node:path');
    const changelogContent = await this.readOptional(join(packagePath, 'CHANGELOG.md'));

    // 构建组件信息（路径一律相对 workspace 根）
    const component: ComponentInfo = {
      name: getDisplayName(packageInfo.name),
      packageName: packageInfo.name,
      version: packageInfo.version,
      description,
      category,
      tags,
      author: this.extractAuthor(packageInfo.author),
      license: packageInfo.license || 'MIT',

      sourcePath: this.relativize(packagePath),
      storiesPath: files.storyFiles[0] ? this.relativize(files.storyFiles[0]) : undefined,
      readmePath: files.readmeFiles[0] ? this.relativize(files.readmeFiles[0]) : undefined,

      dependencies: Object.keys(packageInfo.dependencies || {}),
      peerDependencies: Object.keys(packageInfo.peerDependencies || {}),

      props,
      emits,
      slots,
      subComponents: this.collectSubComponents(props, emits, slots),
      examples,

      readmeContent: readmeData?.content,
      changelogContent,
    };

    if (this.config.verbose) {
      log.info(`✅ 提取组件: ${component.name} (${component.packageName})`);
    }

    return component;
  }

  /**
   * 提取组件示例
   */
  private async extractExamples(
    files: Awaited<ReturnType<typeof findComponentFiles>>,
  ): Promise<ComponentExample[]> {
    const examples: ComponentExample[] = [];

    // 从 Stories 文件提取示例
    for (const storyFile of files.storyFiles) {
      const storyExamples = await this.parsers.stories.parseStories(storyFile);
      examples.push(...storyExamples);
    }

    // 从 README 文件提取示例
    for (const readmeFile of files.readmeFiles) {
      const readmeData = await this.parsers.markdown.parseReadme(readmeFile);
      if (readmeData) {
        const readmeExamples = this.parsers.markdown.extractCodeExamples(readmeData.content);
        examples.push(...readmeExamples);
      }
    }

    return examples;
  }

  /**
   * 提取组件分类
   */
  private extractCategory(packageName: string): string {
    const name = packageName.replace(/^@[^/]+\//, '').toLowerCase();

    // 基于包名推断分类
    if (name.includes('picker') || name.includes('select')) {
      return '选择器';
    } else if (name.includes('modal') || name.includes('dialog')) {
      return '弹窗';
    } else if (name.includes('form') || name.includes('input')) {
      return '表单';
    } else if (name.includes('image') || name.includes('video')) {
      return '媒体';
    } else if (name.includes('icon')) {
      return '图标';
    } else if (name.includes('theme')) {
      return '主题';
    } else if (name.includes('util') || name.includes('helper')) {
      return '工具';
    } else if (name.includes('layout') || name.includes('container')) {
      return '布局';
    } else if (name.includes('navigation') || name.includes('menu')) {
      return '导航';
    } else if (name.includes('data') || name.includes('table') || name.includes('list')) {
      return '数据展示';
    } else if (
      name.includes('feedback') ||
      name.includes('message') ||
      name.includes('notification')
    ) {
      return '反馈';
    }

    return '其他';
  }

  /**
   * 提取标签
   */
  private extractTags(packageInfo: PackageInfo, readmeContent: string): string[] {
    const tags: string[] = [];

    // 从包名提取标签
    const packageName = packageInfo.name.replace(/^@[^/]+\//, '');
    const nameWords = packageName.split('-');
    tags.push(...nameWords);

    // 从依赖中提取标签
    const allDeps = {
      ...packageInfo.dependencies,
      ...packageInfo.peerDependencies,
    };

    if (allDeps.vue) tags.push('vue');
    if (allDeps.typescript) tags.push('typescript');

    // 从 README 内容中提取关键词
    const keywordMatches = readmeContent.match(/(?:关键词|keywords|tags)[:：]\s*([^\n]+)/i);
    if (keywordMatches && keywordMatches[1]) {
      const keywords = keywordMatches[1].split(/[,，\s]+/).filter(Boolean);
      tags.push(...keywords);
    }

    return [...new Set(tags)].filter((tag) => tag && tag.length > 1);
  }

  /**
   * 提取作者信息
   */
  private extractAuthor(author?: string | { name: string; email?: string }): string {
    if (!author) return '';

    if (typeof author === 'string') {
      return author;
    }

    return author.name + (author.email ? ` <${author.email}>` : '');
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    totalPackages: number;
    componentPackages: number;
    categories: Record<string, number>;
    tags: Record<string, number>;
  }> {
    const packagePaths = await findPackages(this.config.packagesDir);
    const components = await this.extractAllComponents();

    if (!packagePaths) {
      return {
        totalPackages: 0,
        componentPackages: 0,
        categories: {},
        tags: {},
      };
    }

    const categories: Record<string, number> = {};
    const tags: Record<string, number> = {};

    for (const component of components) {
      // 统计分类
      categories[component.category] = (categories[component.category] || 0) + 1;

      // 统计标签
      for (const tag of component.tags) {
        tags[tag] = (tags[tag] || 0) + 1;
      }
    }

    return {
      totalPackages: packagePaths.length,
      componentPackages: components.length,
      categories,
      tags,
    };
  }
}
