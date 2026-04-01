/**
 * Cursor 平台适配器
 *
 * 输出格式：.cursor/rules/*.mdc
 * MDC = Markdown + frontmatter（description, globs, alwaysApply）
 */

import path from 'node:path';
import { existsSync } from '../utils/fs.js';
import type {
  AdapterContext,
  AIPlatform,
  PlatformAdapter,
  PlatformOutputFile,
  ResourceType,
  RuleSource,
} from '../types.js';
import { ruleIdToSlug, inferGlobs } from './shared.js';

export class CursorAdapter implements PlatformAdapter {
  readonly platform: AIPlatform = 'cursor';
  readonly displayName = 'Cursor';
  readonly supportedResourceTypes: ResourceType[] = ['rules'];

  generateFiles(
    rules: RuleSource[],
    _context: AdapterContext,
  ): PlatformOutputFile[] {
    const files: PlatformOutputFile[] = [];

    for (const rule of rules) {
      const slug = ruleIdToSlug(rule.meta.id);
      files.push({
        relativePath: `.cursor/rules/${slug}.mdc`,
        content: this.buildMdcFile(rule),
        description: `Cursor Rule: ${rule.meta.title || slug}`,
        sourceRuleIds: [rule.meta.id],
      });
    }

    return files;
  }

  detect(projectRoot: string): boolean {
    return (
      existsSync(path.join(projectRoot, '.cursor')) ||
      existsSync(path.join(projectRoot, '.cursorrules'))
    );
  }

  /** 构建 MDC 格式文件 */
  private buildMdcFile(rule: RuleSource): string {
    const lines: string[] = [];

    // MDC frontmatter
    lines.push('---');
    lines.push(`description: ${rule.meta.description || rule.meta.title}`);

    // globs: 从 tags 推断文件匹配模式
    const globs = inferGlobs(rule.meta.tags);
    if (globs.length > 0) {
      lines.push(`globs: ${JSON.stringify(globs)}`);
    }

    // alwaysApply: base 层的规则始终生效
    lines.push(`alwaysApply: ${rule.meta.layer === 'base'}`);
    lines.push('---');
    lines.push('');

    // 标题 + 正文
    if (rule.meta.title) {
      lines.push(`# ${rule.meta.title}`);
      lines.push('');
    }
    lines.push(rule.content);
    lines.push('');

    return lines.join('\n');
  }
}
