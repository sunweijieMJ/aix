/**
 * Windsurf 平台适配器
 *
 * 输出格式：.windsurf/rules/*.md（trigger frontmatter）
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
import { ruleIdToSlug } from './shared.js';

export class WindsurfAdapter implements PlatformAdapter {
  readonly platform: AIPlatform = 'windsurf';
  readonly displayName = 'Windsurf';
  readonly supportedResourceTypes: ResourceType[] = ['rules'];

  generateFiles(rules: RuleSource[], _context: AdapterContext): PlatformOutputFile[] {
    return rules.map((rule) => {
      const slug = ruleIdToSlug(rule.meta.id);
      return {
        relativePath: `.windsurf/rules/${slug}.md`,
        content: this.buildRuleFile(rule),
        description: `Windsurf Rule: ${rule.meta.title || slug}`,
        sourceRuleIds: [rule.meta.id],
      };
    });
  }

  detect(projectRoot: string): boolean {
    return (
      existsSync(path.join(projectRoot, '.windsurf')) ||
      existsSync(path.join(projectRoot, '.windsurfrules'))
    );
  }

  private buildRuleFile(rule: RuleSource): string {
    const lines: string[] = [];

    // Windsurf frontmatter
    lines.push('---');
    lines.push(`trigger: ${this.inferTrigger(rule.meta.tags)}`);
    lines.push(`description: ${rule.meta.description || rule.meta.title}`);
    lines.push('---');
    lines.push('');

    if (rule.meta.title) {
      lines.push(`# ${rule.meta.title}`);
      lines.push('');
    }
    lines.push(rule.content);
    lines.push('');

    return lines.join('\n');
  }

  /** 从标签推断 trigger 条件 */
  private inferTrigger(tags: string[]): string {
    if (tags.includes('always') || tags.length === 0) return 'always';
    if (tags.includes('review')) return 'on_review';
    if (tags.includes('testing')) return 'on_test';
    return 'always';
  }
}
