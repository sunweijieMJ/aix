/**
 * 通义灵码平台适配器（阿里云）
 *
 * 输出格式：.lingma/rules/*.md
 *
 * 支持 4 种生效模式：
 * - always: 始终生效
 * - globs: 指定文件生效
 * - model_decision: 模型决策（需提供描述）
 * - manual: 手动引入（通过 #rule）
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

export class TongyiAdapter implements PlatformAdapter {
  readonly platform: AIPlatform = 'tongyi';
  readonly displayName = '通义灵码 (阿里)';
  readonly supportedResourceTypes: ResourceType[] = ['rules'];

  generateFiles(
    rules: RuleSource[],
    _context: AdapterContext,
  ): PlatformOutputFile[] {
    return rules.map((rule) => {
      const slug = ruleIdToSlug(rule.meta.id);
      return {
        relativePath: `.lingma/rules/${slug}.md`,
        content: this.buildRuleFile(rule),
        description: `通义灵码 Rule: ${rule.meta.title || slug}`,
        sourceRuleIds: [rule.meta.id],
      };
    });
  }

  detect(projectRoot: string): boolean {
    return (
      existsSync(path.join(projectRoot, '.lingma')) ||
      existsSync(path.join(projectRoot, '.ai', 'rules'))
    );
  }

  private buildRuleFile(rule: RuleSource): string {
    const lines: string[] = [];

    // 通义灵码 frontmatter
    lines.push('---');
    lines.push(`name: ${rule.meta.title || ruleIdToSlug(rule.meta.id)}`);
    lines.push(`description: ${rule.meta.description || rule.meta.title}`);

    // 生效模式
    const globs = inferGlobs(rule.meta.tags);
    if (rule.meta.layer === 'base') {
      lines.push('mode: always');
    } else if (globs.length > 0) {
      lines.push('mode: globs');
      lines.push(`globs: ${globs.join(',')}`);
    } else {
      lines.push('mode: model_decision');
    }

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
}
