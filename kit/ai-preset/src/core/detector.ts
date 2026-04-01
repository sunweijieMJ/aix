/**
 * AI 平台自动检测
 *
 * 扫描项目目录结构推断已配置的 AI 工具
 */

import path from 'node:path';
import { existsSync } from '../utils/fs.js';
import type { AIPlatform } from '../types.js';

interface DetectRule {
  platform: AIPlatform;
  /** 检测路径（相对于项目根），任一存在即匹配 */
  paths: string[];
}

const DETECT_RULES: DetectRule[] = [
  {
    platform: 'claude',
    paths: ['CLAUDE.md', '.claude'],
  },
  {
    platform: 'cursor',
    paths: ['.cursor', '.cursorrules'],
  },
  {
    platform: 'copilot',
    paths: ['.github/copilot-instructions.md', '.github/copilot'],
  },
  {
    platform: 'codex',
    paths: ['AGENTS.md', 'codex.md'],
  },
  {
    platform: 'windsurf',
    paths: ['.windsurf', '.windsurfrules'],
  },
  {
    platform: 'trae',
    paths: ['.trae', '.trae/rules'],
  },
  {
    platform: 'tongyi',
    paths: ['.lingma', '.ai/rules'],
  },
  {
    platform: 'qoder',
    paths: ['.qoder', '.qoder/rules'],
  },
  {
    platform: 'gemini',
    paths: ['GEMINI.md', '.gemini'],
  },
];

/**
 * 检测项目中已配置的 AI 平台
 */
export function detectPlatforms(projectRoot: string): AIPlatform[] {
  const detected: AIPlatform[] = [];

  for (const rule of DETECT_RULES) {
    const found = rule.paths.some((p) => existsSync(path.join(projectRoot, p)));
    if (found) {
      detected.push(rule.platform);
    }
  }

  return detected;
}
