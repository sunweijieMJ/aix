/**
 * GitHub Copilot 平台适配器
 *
 * 输出格式：.github/copilot-instructions.md — 所有规则合并为单文件
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

export class CopilotAdapter implements PlatformAdapter {
  readonly platform: AIPlatform = 'copilot';
  readonly displayName = 'GitHub Copilot';

  generateFiles(rules: RuleSource[], context: AdapterContext): PlatformOutputFile[] {
    // Copilot 不支持子文件引用，将所有规则合并到主文件中
    return [
      {
        relativePath: '.github/copilot-instructions.md',
        content: this.buildInstructionsFile(rules, context),
        description: 'Copilot 主指令文件',
        sourceRuleIds: rules.map((r) => r.meta.id),
      },
    ];
  }

  detect(projectRoot: string): boolean {
    return (
      existsSync(path.join(projectRoot, '.github', 'copilot-instructions.md')) ||
      existsSync(path.join(projectRoot, '.github', 'copilot'))
    );
  }

  /** 构建主指令文件（所有规则合并，含标记区域保护） */
  private buildInstructionsFile(rules: RuleSource[], context: AdapterContext): string {
    const lines: string[] = [];

    lines.push(`# Copilot Instructions — ${context.projectName}`);
    lines.push('');
    lines.push('> 由 @kit/ai-preset 生成，请勿手动编辑标记区域内的内容');
    lines.push('');
    lines.push(PRESET_MARKER_START);
    lines.push('');

    // 技术栈概览
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

    // 各规则内容直接合并
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
