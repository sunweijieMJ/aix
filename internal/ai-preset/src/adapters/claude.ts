/**
 * Claude Code 平台适配器
 *
 * 输出文件格式：
 * - CLAUDE.md — 项目主规范文件（含 ai-preset 标记区域）
 * - .claude/agents/*.md — 独立 Agent 文件（带 Claude frontmatter）
 */

import path from 'node:path';
import { existsSync } from '../utils/fs.js';
import type {
  AdapterContext,
  AIPlatform,
  PlatformAdapter,
  PlatformOutputFile,
  RuleSource,
} from '../types.js';
import { ruleIdToSlug, buildMarkerEntryFile } from './shared.js';

export class ClaudeAdapter implements PlatformAdapter {
  readonly platform: AIPlatform = 'claude';
  readonly displayName = 'Claude Code';

  generateFiles(
    rules: RuleSource[],
    context: AdapterContext,
  ): PlatformOutputFile[] {
    const files: PlatformOutputFile[] = [];

    // 按 resourceType 分类
    const mainRules: RuleSource[] = [];
    const agentRules: RuleSource[] = [];
    const commandRules: RuleSource[] = [];
    const skillRules: RuleSource[] = [];

    for (const rule of rules) {
      const type = rule.meta.resourceType || 'rules';
      switch (type) {
        case 'agent':
          agentRules.push(rule);
          break;
        case 'command':
          commandRules.push(rule);
          break;
        case 'skill':
          skillRules.push(rule);
          break;
        default:
          mainRules.push(rule);
      }
    }

    // 1. 生成 CLAUDE.md
    files.push({
      relativePath: 'CLAUDE.md',
      content: this.buildClaudeMd(mainRules, context),
      description: 'Claude Code 主规范文件',
      sourceRuleIds: mainRules.map((r) => r.meta.id),
    });

    // 2. 生成 .claude/agents/*.md
    for (const rule of agentRules) {
      const slug = ruleIdToSlug(rule.meta.id);
      files.push({
        relativePath: `.claude/agents/${slug}.md`,
        content: this.buildAgentFile(rule),
        description: `Agent: ${rule.meta.title || slug}`,
        sourceRuleIds: [rule.meta.id],
      });
    }

    // 3. 生成 .claude/commands/*.md
    for (const rule of commandRules) {
      const slug = ruleIdToSlug(rule.meta.id);
      files.push({
        relativePath: `.claude/commands/${slug}.md`,
        content: this.buildCommandFile(rule),
        description: `Command: /${slug}`,
        sourceRuleIds: [rule.meta.id],
      });
    }

    // 4. 生成 .claude/skills/<slug>/SKILL.md
    for (const rule of skillRules) {
      const slug = ruleIdToSlug(rule.meta.id);
      files.push({
        relativePath: `.claude/skills/${slug}/SKILL.md`,
        content: this.buildSkillFile(rule),
        description: `Skill: /${slug}`,
        sourceRuleIds: [rule.meta.id],
      });
    }

    return files;
  }

  detect(projectRoot: string): boolean {
    return (
      existsSync(path.join(projectRoot, 'CLAUDE.md')) ||
      existsSync(path.join(projectRoot, '.claude'))
    );
  }

  /** 构建 CLAUDE.md 内容 */
  private buildClaudeMd(rules: RuleSource[], context: AdapterContext): string {
    return buildMarkerEntryFile(rules, context, { title: 'CLAUDE.md' });
  }

  /** 构建 Agent 文件内容 */
  private buildAgentFile(rule: RuleSource): string {
    const slug = ruleIdToSlug(rule.meta.id);
    const description = rule.meta.description || rule.meta.title || slug;

    // 根据标签决定可用工具
    const tools = this.resolveAgentTools(rule.meta.tags);

    const lines: string[] = [];
    lines.push('---');
    lines.push(`name: ${slug}`);
    lines.push(`description: ${description}`);
    lines.push(`tools: ${tools.join(', ')}`);
    lines.push('model: inherit');
    lines.push('---');
    lines.push('');
    lines.push(`# ${rule.meta.title || slug}`);
    lines.push('');
    lines.push(rule.content);
    lines.push('');

    return lines.join('\n');
  }

  /** 构建 Command 文件内容 */
  private buildCommandFile(rule: RuleSource): string {
    const lines: string[] = [];
    lines.push('---');
    lines.push(`description: ${rule.meta.description || rule.meta.title}`);
    lines.push('---');
    lines.push('');
    lines.push(rule.content);
    lines.push('');

    return lines.join('\n');
  }

  /** 构建 Skill 文件内容 */
  private buildSkillFile(rule: RuleSource): string {
    const slug = ruleIdToSlug(rule.meta.id);
    const sm = rule.meta.skillMeta;

    const lines: string[] = [];
    lines.push('---');
    lines.push(`name: ${slug}`);
    lines.push(`description: ${rule.meta.description || rule.meta.title}`);
    if (sm?.license) lines.push(`license: ${sm.license}`);
    if (sm?.compatibility) lines.push(`compatibility: ${sm.compatibility}`);
    if (sm?.author || sm?.category) {
      lines.push('metadata:');
      if (sm?.author) lines.push(`  author: ${sm.author}`);
      if (sm?.category) lines.push(`  category: ${sm.category}`);
      lines.push(`  version: "${rule.meta.version}"`);
    }
    lines.push('---');
    lines.push('');
    lines.push(rule.content);
    lines.push('');

    return lines.join('\n');
  }

  /** 根据标签推断 Agent 可用工具 */
  private resolveAgentTools(tags: string[]): string[] {
    const base = ['Read', 'Grep', 'Glob'];

    if (tags.includes('web')) {
      base.push('WebFetch', 'WebSearch');
    }

    return base;
  }
}
