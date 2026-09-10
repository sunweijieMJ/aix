import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolPackageInfo } from '../types/index';
import { findPackages, getDisplayName, readPackageJson } from '../utils/index';
import { log } from '../utils/logger';
import { findRepoRoot, toRepoRelative } from '../utils/repo-root';
import { ReadmeExtractor } from './readme-extractor';

/**
 * 工具包提取器
 *
 * 扫描 kit/ 和 internal/ 目录，从 package.json 和 README.md 中提取工具包信息。
 */
export class ToolPackageExtractor {
  private readmeExtractor: ReadmeExtractor;

  constructor() {
    this.readmeExtractor = new ReadmeExtractor();
  }

  /**
   * 从指定目录提取所有工具包信息
   */
  /** 排除的包名（不提取自身） */
  private static EXCLUDED_PACKAGES = new Set(['@aix/mcp-server']);

  async extractFromDirectory(dir: string, scope: 'kit' | 'internal'): Promise<ToolPackageInfo[]> {
    const packagePaths = await findPackages(dir);
    if (!packagePaths || packagePaths.length === 0) {
      return [];
    }

    const packages: ToolPackageInfo[] = [];

    for (const packagePath of packagePaths) {
      try {
        const pkg = await this.extractFromPackage(packagePath, scope);
        if (pkg && !ToolPackageExtractor.EXCLUDED_PACKAGES.has(pkg.packageName)) {
          packages.push(pkg);
        }
      } catch (error) {
        log.warn(`提取工具包失败: ${packagePath}`, error);
      }
    }

    return packages;
  }

  /**
   * 从单个包目录提取信息
   */
  private async extractFromPackage(
    packagePath: string,
    scope: 'kit' | 'internal',
  ): Promise<ToolPackageInfo | null> {
    const packageInfo = await readPackageJson(packagePath);
    if (!packageInfo) return null;

    // 读取 README
    // extractFromReadme 内部吞异常返回 null，所以 readmePath 必须靠 existsSync 判断，
    // 否则没有 README 的包也会带上一个不存在的路径
    const readmeAbsolutePath = join(packagePath, 'README.md');
    const hasReadme = existsSync(readmeAbsolutePath);
    const readmeData = hasReadme
      ? await this.readmeExtractor.extractFromReadme(readmeAbsolutePath)
      : null;
    const apiSections = readmeData?.content
      ? this.readmeExtractor.extractApiSections(readmeData.content)
      : [];

    const changelogAbsolutePath = join(packagePath, 'CHANGELOG.md');
    const changelogContent = existsSync(changelogAbsolutePath)
      ? await readFile(changelogAbsolutePath, 'utf8').catch(() => undefined)
      : undefined;

    const repoRoot = findRepoRoot(packagePath);
    const relativize = (p: string) => (repoRoot ? toRepoRelative(p, repoRoot) : p);

    return {
      name: getDisplayName(packageInfo.name),
      packageName: packageInfo.name,
      version: packageInfo.version,
      description: readmeData?.description || packageInfo.description || '',
      category: this.inferCategory(packageInfo.name, scope),
      tags: readmeData?.tags || this.extractBasicTags(packageInfo.name),
      author: this.extractAuthor(packageInfo.author),
      license: packageInfo.license || 'MIT',
      scope,

      sourcePath: relativize(packagePath),
      readmePath: hasReadme ? relativize(readmeAbsolutePath) : undefined,

      dependencies: Object.keys(packageInfo.dependencies || {}),
      peerDependencies: Object.keys(packageInfo.peerDependencies || {}),

      features: readmeData?.features || [],
      examples: readmeData?.examples || [],
      apiSections,

      readmeContent: readmeData?.content,
      changelogContent,
    };
  }

  /**
   * 推断工具包分类
   */
  private inferCategory(packageName: string, scope: 'kit' | 'internal'): string {
    const name = packageName.toLowerCase();

    if (scope === 'internal' && (name.includes('config') || name.includes('lint'))) {
      return '基础设施';
    }
    if (
      name.includes('test') ||
      name.includes('visual') ||
      name.includes('sentinel') ||
      name.includes('ci')
    ) {
      return '开发工具';
    }
    return '工具包';
  }

  /**
   * 从包名提取基础标签
   */
  private extractBasicTags(packageName: string): string[] {
    const withoutScope = packageName.replace(/^@[^/]+\//, '');
    return withoutScope.split('-').filter((t) => t.length > 1);
  }

  /**
   * 提取作者信息
   */
  private extractAuthor(author?: string | { name: string; email?: string }): string {
    if (!author) return '';
    if (typeof author === 'string') return author;
    return author.name + (author.email ? ` <${author.email}>` : '');
  }
}
