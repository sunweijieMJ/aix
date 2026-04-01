/**
 * Gemini CLI 平台适配器 (Google)
 *
 * 输出格式：GEMINI.md（含 ai-preset 标记区域）
 * 与 CLAUDE.md 类似，使用标记区域保护用户自定义内容
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
import { buildMarkerEntryFile } from './shared.js';

export class GeminiAdapter implements PlatformAdapter {
  readonly platform: AIPlatform = 'gemini';
  readonly displayName = 'Gemini CLI (Google)';

  generateFiles(
    rules: RuleSource[],
    context: AdapterContext,
  ): PlatformOutputFile[] {
    return [
      {
        relativePath: 'GEMINI.md',
        content: this.buildGeminiMd(rules, context),
        description: 'Gemini CLI 项目规范文件',
        sourceRuleIds: rules.map((r) => r.meta.id),
      },
    ];
  }

  detect(projectRoot: string): boolean {
    return (
      existsSync(path.join(projectRoot, 'GEMINI.md')) ||
      existsSync(path.join(projectRoot, '.gemini'))
    );
  }

  private buildGeminiMd(rules: RuleSource[], context: AdapterContext): string {
    return buildMarkerEntryFile(rules, context, { title: 'GEMINI.md' });
  }
}
