/**
 * OpenAI Codex 平台适配器
 *
 * 输出格式：AGENTS.md — 所有规则合并为单文件的 ## 章节
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
import { PRESET_MARKER_END, PRESET_MARKER_START } from '../types.js';

export class CodexAdapter implements PlatformAdapter {
  readonly platform: AIPlatform = 'codex';
  readonly displayName = 'OpenAI Codex';

  generateFiles(rules: RuleSource[], context: AdapterContext): PlatformOutputFile[] {
    return [
      {
        relativePath: 'AGENTS.md',
        content: this.buildAgentsMd(rules, context),
        description: 'Codex AGENTS.md',
        sourceRuleIds: rules.map((r) => r.meta.id),
      },
    ];
  }

  detect(projectRoot: string): boolean {
    return (
      existsSync(path.join(projectRoot, 'AGENTS.md')) ||
      existsSync(path.join(projectRoot, 'codex.md'))
    );
  }

  /** 所有规则合并到单个 AGENTS.md */
  private buildAgentsMd(rules: RuleSource[], context: AdapterContext): string {
    const lines: string[] = [];

    lines.push(`# AGENTS.md — ${context.projectName}`);
    lines.push('');
    lines.push('> 由 @kit/ai-preset 生成，请勿手动编辑标记区域内的内容');
    lines.push('');
    lines.push(PRESET_MARKER_START);
    lines.push('');

    // 技术栈
    lines.push('## 项目概览');
    lines.push('');
    lines.push('- **语言**: TypeScript');
    if (context.framework) {
      const names: Record<string, string> = {
        vue3: 'Vue 3',
        react: 'React',
        node: 'Node.js',
      };
      lines.push(`- **框架**: ${names[context.framework] || context.framework}`);
    }
    lines.push('');

    // 各规则作为 ## 章节
    for (const rule of rules) {
      if (rule.content.trim()) {
        lines.push(`## ${rule.meta.title || rule.meta.id}`);
        lines.push('');
        lines.push(rule.content);
        lines.push('');
      }
    }

    lines.push(PRESET_MARKER_END);
    lines.push('');

    return lines.join('\n');
  }
}
