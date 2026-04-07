/**
 * Qoder 平台适配器（阿里巴巴）
 *
 * 输出格式：.qoder/rules/*.md
 * frontmatter 与 Cursor 类似（alwaysApply, description, globs）
 *
 * 规则类型：
 * - Always Apply: 所有请求生效
 * - Apply to Specific Files: 指定文件匹配
 * - Apply Intelligently: 模型自主决策
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
import { ruleIdToSlug, buildFrontmatterRuleFile } from './shared.js';

export class QoderAdapter implements PlatformAdapter {
  readonly platform: AIPlatform = 'qoder';
  readonly displayName = 'Qoder (阿里)';
  readonly supportedResourceTypes: ResourceType[] = ['rules'];

  generateFiles(rules: RuleSource[], _context: AdapterContext): PlatformOutputFile[] {
    return rules.map((rule) => {
      const slug = ruleIdToSlug(rule.meta.id);
      return {
        relativePath: `.qoder/rules/${slug}.md`,
        content: this.buildRuleFile(rule),
        description: `Qoder Rule: ${rule.meta.title || slug}`,
        sourceRuleIds: [rule.meta.id],
      };
    });
  }

  detect(projectRoot: string): boolean {
    return existsSync(path.join(projectRoot, '.qoder'));
  }

  private buildRuleFile(rule: RuleSource): string {
    return buildFrontmatterRuleFile(rule);
  }
}
