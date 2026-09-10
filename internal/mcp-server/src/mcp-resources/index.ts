/**
 * MCP Resources API 实现
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { MIME_TYPES, RESOURCE_TYPES } from '../constants';
import type { ComponentIndex, ComponentInfo, DocsIndex } from '../types/index';
import { log } from '../utils/logger';

/**
 * 资源类型
 */
export type ResourceType =
  | typeof RESOURCE_TYPES.COMPONENT_SOURCE
  | typeof RESOURCE_TYPES.COMPONENT_README
  | typeof RESOURCE_TYPES.COMPONENT_STORY
  | typeof RESOURCE_TYPES.COMPONENT_CHANGELOG;

/**
 * 资源描述
 */
export interface ResourceDescription {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * 资源内容
 */
export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

/**
 * 资源管理器
 */
export class ResourceManager {
  private componentIndex: ComponentIndex;
  /** 源文件缓存：packageName -> 相对包根的源文件路径列表（如 src/hooks/index.ts） */
  private sourceFilesCache = new Map<string, string[]>();
  /** 文档快照，脱离仓库运行时的唯一数据来源，首次访问时懒加载 */
  private docsIndex: DocsIndex | null = null;
  private docsLoaded = false;

  /**
   * @param componentIndex - 组件索引
   * @param dataDir - 数据目录，用于加载文档快照
   * @param repoRoot - workspace 根；null 表示脱离仓库运行，此时源码类资源不可用
   */
  constructor(
    componentIndex: ComponentIndex,
    private dataDir: string = '',
    private repoRoot: string | null = null,
  ) {
    this.componentIndex = componentIndex;
  }

  /**
   * 把数据里的仓库相对路径还原成可读取的绝对路径
   */
  private toAbsolute(repoRelativePath: string): string | null {
    return this.repoRoot ? join(this.repoRoot, repoRelativePath) : null;
  }

  /**
   * 懒加载文档快照
   */
  private async getDocs(packageName: string): Promise<{ readme?: string; changelog?: string }> {
    if (!this.docsLoaded) {
      this.docsLoaded = true;
      try {
        const content = await readFile(join(this.dataDir, 'docs-index.json'), 'utf8');
        this.docsIndex = JSON.parse(content) as DocsIndex;
      } catch {
        this.docsIndex = null;
      }
    }

    return this.docsIndex?.docs?.[packageName] ?? {};
  }

  /**
   * 获取所有可用资源列表
   */
  async listResources(): Promise<ResourceDescription[]> {
    const resources: ResourceDescription[] = [];

    for (const component of this.componentIndex.components) {
      const docs = await this.getDocs(component.packageName);

      // 组件源码和 Story 依赖真实仓库，脱离仓库运行时不登记
      // ——登记了也读不到，只会让调用方白跑一趟拿到 "Resource not found"
      if (this.repoRoot) {
        // URI 用相对包根的路径而非 basename：一个包内多个同名 index.ts 会撞 URI，
        // 撞上之后读取只会返回第一个命中，其余文件永远无法寻址
        const sourceFiles = await this.getComponentSourceFiles(component);
        for (const sourceFile of sourceFiles) {
          resources.push({
            uri: `component-source://${component.packageName}/${sourceFile}`,
            name: `${component.name} - ${sourceFile}`,
            description: `${component.name} 组件的源码文件`,
            mimeType: this.getMimeType(sourceFile),
          });
        }

        if (component.storiesPath) {
          resources.push({
            uri: `component-story://${component.packageName}/${basename(component.storiesPath)}`,
            name: `${component.name} - Stories`,
            description: `${component.name} 组件的故事文件`,
            mimeType: this.getMimeType(component.storiesPath),
          });
        }
      }

      // README：有仓库读磁盘，没仓库读快照
      if (component.readmePath || docs.readme) {
        resources.push({
          uri: `component-readme://${component.packageName}/README.md`,
          name: `${component.name} - README`,
          description: `${component.name} 组件的说明文档`,
          mimeType: 'text/markdown',
        });
      }

      // CHANGELOG：同上
      if (await this.hasChangelog(component, docs)) {
        resources.push({
          uri: `component-changelog://${component.packageName}/CHANGELOG.md`,
          name: `${component.name} - Changelog`,
          description: `${component.name} 组件的变更日志`,
          mimeType: 'text/markdown',
        });
      }
    }

    return resources;
  }

  /**
   * 判断组件是否有变更日志可读
   */
  private async hasChangelog(
    component: ComponentInfo,
    docs: { changelog?: string },
  ): Promise<boolean> {
    if (docs.changelog) return true;

    const changelogPath = this.toAbsolute(join(component.sourcePath, 'CHANGELOG.md'));
    if (!changelogPath) return false;

    try {
      await stat(changelogPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 读取指定资源内容
   */
  async readResource(uri: string): Promise<ResourceContent | null> {
    try {
      const parsed = this.parseResourceUri(uri);
      if (!parsed) {
        return null;
      }

      const { type, packageName, fileName } = parsed;
      const component = this.findComponent(packageName);

      if (!component) {
        return null;
      }

      const docs = await this.getDocs(packageName);

      // 文档类资源：优先读仓库里的真实文件（内容最新），
      // 脱离仓库时退回 extract 阶段打进 data/ 的快照
      let filePath: string | null;
      let mimeType: string;
      let snapshot: string | undefined;

      switch (type) {
        case 'component-source':
          filePath = await this.findSourceFile(component, fileName);
          mimeType = this.getMimeType(filePath);
          break;

        case 'component-readme':
          filePath = component.readmePath ? this.toAbsolute(component.readmePath) : null;
          mimeType = 'text/markdown';
          snapshot = docs.readme;
          break;

        case 'component-story':
          filePath = component.storiesPath ? this.toAbsolute(component.storiesPath) : null;
          mimeType = this.getMimeType(component.storiesPath ?? '');
          break;

        case 'component-changelog':
          filePath = this.toAbsolute(join(component.sourcePath, 'CHANGELOG.md'));
          mimeType = 'text/markdown';
          snapshot = docs.changelog;
          break;

        default:
          return null;
      }

      if (filePath) {
        try {
          return { uri, mimeType, text: await readFile(filePath, 'utf8') };
        } catch (error) {
          if (!snapshot) throw error;
          log.warn(`读取 ${filePath} 失败，改用文档快照`);
        }
      }

      if (!snapshot) return null;

      return { uri, mimeType, text: snapshot };
    } catch (error) {
      log.error(`Error reading resource ${uri}:`, error);
      return null;
    }
  }

  /**
   * 解析资源 URI
   *
   * 支持的 URI 格式:
   * - component-source://@scope/package/filename.ts (scoped 包)
   * - component-source://package/filename.ts (unscoped 包)
   */
  private parseResourceUri(uri: string): {
    type: ResourceType;
    packageName: string;
    fileName: string;
  } | null {
    // 使用明确的交替模式匹配包名:
    // - @[^/]+\/[^/]+ 匹配 scoped 包，如 @aix/button
    // - [^/]+ 匹配 unscoped 包，如 button
    const match = uri.match(/^(component-\w+):\/\/(@[^/]+\/[^/]+|[^/]+)\/(.+)$/);
    if (!match) {
      log.error(`Invalid resource URI: ${uri}`);
      return null;
    }

    // match[1], match[2], match[3] are guaranteed to exist when the regex matches
    return {
      type: match[1] as ResourceType,
      packageName: match[2]!,
      fileName: match[3]!,
    };
  }

  /**
   * 查找组件
   */
  private findComponent(packageName: string): ComponentInfo | undefined {
    return this.componentIndex.components.find((c) => c.packageName === packageName);
  }

  /**
   * 获取组件源码文件列表（带缓存）
   *
   * @returns 相对包根的路径列表，统一用 `/` 分隔以便拼进 URI
   */
  private async getComponentSourceFiles(component: ComponentInfo): Promise<string[]> {
    // 检查缓存
    const cached = this.sourceFilesCache.get(component.packageName);
    if (cached) {
      return cached;
    }

    const packageDir = this.toAbsolute(component.sourcePath);
    if (!packageDir) {
      return [];
    }

    try {
      const { glob } = await import('glob');
      const pattern = join(packageDir, 'src/**/*.{ts,tsx,vue}');
      const files = await glob(pattern);

      const filteredFiles = files
        .filter(
          (file) =>
            !file.includes('.test.') && !file.includes('.spec.') && !file.includes('.stories.'),
        )
        .map((file) => relative(packageDir, file).split(sep).join('/'))
        .sort();

      // 存入缓存
      this.sourceFilesCache.set(component.packageName, filteredFiles);
      return filteredFiles;
    } catch (error) {
      log.warn(`Failed to get source files for ${component.name}:`, error);
      return [];
    }
  }

  /**
   * 查找指定的源码文件
   *
   * 只接受 listResources 登记过的相对路径，天然拒绝 `../` 之类的越界访问。
   *
   * @returns 可直接读取的绝对路径
   */
  private async findSourceFile(component: ComponentInfo, filePath: string): Promise<string> {
    const sourceFiles = await this.getComponentSourceFiles(component);
    const targetFile = sourceFiles.find((file) => file === filePath);
    const packageDir = this.toAbsolute(component.sourcePath);

    if (!targetFile || !packageDir) {
      throw new Error(`Source file not found: ${filePath}`);
    }

    return join(packageDir, targetFile);
  }

  /**
   * 根据文件扩展名获取 MIME 类型
   */
  private getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    return MIME_TYPES[ext as keyof typeof MIME_TYPES] || 'text/plain';
  }

  /**
   * 更新组件索引
   */
  updateComponentIndex(componentIndex: ComponentIndex): void {
    this.componentIndex = componentIndex;
    // 清除源文件缓存，因为组件索引已更新
    this.sourceFilesCache.clear();
  }
}

/**
 * 创建资源管理器
 */
export function createResourceManager(
  componentIndex: ComponentIndex,
  dataDir = '',
  repoRoot: string | null = null,
): ResourceManager {
  return new ResourceManager(componentIndex, dataDir, repoRoot);
}
