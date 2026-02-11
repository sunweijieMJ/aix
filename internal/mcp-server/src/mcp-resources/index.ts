/**
 * MCP Resources API 实现
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { MIME_TYPES, RESOURCE_TYPES } from '../constants';
import type { ComponentIndex, ComponentInfo } from '../types/index';
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
  /** 源文件缓存：packageName -> sourceFiles[] */
  private sourceFilesCache = new Map<string, string[]>();

  constructor(componentIndex: ComponentIndex) {
    this.componentIndex = componentIndex;
  }

  /**
   * 获取所有可用资源列表
   */
  async listResources(): Promise<ResourceDescription[]> {
    const resources: ResourceDescription[] = [];

    for (const component of this.componentIndex.components) {
      // 组件源码文件
      const sourceFiles = await this.getComponentSourceFiles(component);
      for (const sourceFile of sourceFiles) {
        resources.push({
          uri: `component-source://${component.packageName}/${basename(sourceFile)}`,
          name: `${component.name} - ${basename(sourceFile)}`,
          description: `${component.name} 组件的源码文件`,
          mimeType: this.getMimeType(sourceFile),
        });
      }

      // README 文件
      if (component.readmePath) {
        resources.push({
          uri: `component-readme://${component.packageName}/README.md`,
          name: `${component.name} - README`,
          description: `${component.name} 组件的说明文档`,
          mimeType: 'text/markdown',
        });
      }

      // Story 文件
      if (component.storiesPath) {
        resources.push({
          uri: `component-story://${component.packageName}/${basename(component.storiesPath)}`,
          name: `${component.name} - Stories`,
          description: `${component.name} 组件的故事文件`,
          mimeType: this.getMimeType(component.storiesPath),
        });
      }

      // CHANGELOG 文件
      const changelogPath = join(component.sourcePath, 'CHANGELOG.md');
      try {
        await stat(changelogPath);
        resources.push({
          uri: `component-changelog://${component.packageName}/CHANGELOG.md`,
          name: `${component.name} - Changelog`,
          description: `${component.name} 组件的变更日志`,
          mimeType: 'text/markdown',
        });
      } catch {
        // CHANGELOG 文件不存在，跳过
      }
    }

    return resources;
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

      let filePath: string;
      let mimeType: string;

      switch (type) {
        case 'component-source':
          filePath = await this.findSourceFile(component, fileName);
          mimeType = this.getMimeType(filePath);
          break;

        case 'component-readme':
          if (!component.readmePath) return null;
          filePath = component.readmePath;
          mimeType = 'text/markdown';
          break;

        case 'component-story':
          if (!component.storiesPath) return null;
          filePath = component.storiesPath;
          mimeType = this.getMimeType(component.storiesPath);
          break;

        case 'component-changelog':
          filePath = join(component.sourcePath, 'CHANGELOG.md');
          mimeType = 'text/markdown';
          break;

        default:
          return null;
      }

      const content = await readFile(filePath, 'utf8');

      return {
        uri,
        mimeType,
        text: content,
      };
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
    const match = uri.match(
      /^(component-\w+):\/\/(@[^/]+\/[^/]+|[^/]+)\/(.+)$/,
    );
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
    return this.componentIndex.components.find(
      (c) => c.packageName === packageName,
    );
  }

  /**
   * 获取组件源码文件列表（带缓存）
   */
  private async getComponentSourceFiles(
    component: ComponentInfo,
  ): Promise<string[]> {
    // 检查缓存
    const cached = this.sourceFilesCache.get(component.packageName);
    if (cached) {
      return cached;
    }

    try {
      const { glob } = await import('glob');
      const pattern = join(component.sourcePath, 'src/**/*.{ts,tsx,vue}');
      const files = await glob(pattern);

      const filteredFiles = files.filter(
        (file) =>
          !file.includes('.test.') &&
          !file.includes('.spec.') &&
          !file.includes('.stories.'),
      );

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
   */
  private async findSourceFile(
    component: ComponentInfo,
    fileName: string,
  ): Promise<string> {
    const sourceFiles = await this.getComponentSourceFiles(component);
    const targetFile = sourceFiles.find((file) => basename(file) === fileName);

    if (!targetFile) {
      throw new Error(`Source file not found: ${fileName}`);
    }

    return targetFile;
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
): ResourceManager {
  return new ResourceManager(componentIndex);
}
