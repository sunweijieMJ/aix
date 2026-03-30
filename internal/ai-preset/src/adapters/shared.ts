/**
 * 适配器公共工具函数
 */

import type { AdapterContext, RuleSource } from '../types.js';
import { PRESET_MARKER_END, PRESET_MARKER_START } from '../types.js';

/** 从规则 ID 提取 slug（取最后一段） */
export function ruleIdToSlug(id: string): string {
  const parts = id.split('/');
  return parts[parts.length - 1] || id;
}

/** 从标签推断文件匹配 globs 模式 */
export function inferGlobs(tags: string[]): string[] {
  const globs: string[] = [];

  if (tags.includes('vue') || tags.includes('component')) {
    globs.push('**/*.vue');
  }
  if (tags.includes('react')) {
    globs.push('**/*.tsx', '**/*.jsx');
  }
  if (tags.includes('typescript') || tags.includes('coding')) {
    globs.push('**/*.ts', '**/*.tsx');
  }
  if (tags.includes('css') || tags.includes('style')) {
    globs.push('**/*.css', '**/*.scss');
  }
  if (tags.includes('testing')) {
    globs.push('**/*.test.ts', '**/*.spec.ts');
  }
  if (tags.includes('storybook')) {
    globs.push('**/*.stories.ts');
  }

  return [...new Set(globs)];
}

// ============ 入口文件构建公共逻辑 ============

/** 框架显示名称映射 */
const FRAMEWORK_NAMES: Record<string, string> = {
  vue3: 'Vue 3 (Composition API + `<script setup>`)',
  react: 'React (Hooks + TypeScript)',
  node: 'Node.js (TypeScript)',
};

/** 领域显示名称映射 */
const DOMAIN_NAMES: Record<string, string> = {
  'component-lib': '组件库',
  admin: '中后台管理系统',
  mobile: '移动端/H5',
  'api-service': 'API 服务',
  monorepo: 'Monorepo',
  team: 'Team 协作',
  design: '设计稿还原',
};

/**
 * 构建含标记区域的入口文件内容（CLAUDE.md / GEMINI.md 等通用逻辑）
 */
export function buildMarkerEntryFile(
  rules: RuleSource[],
  context: AdapterContext,
  options: { title: string },
): string {
  const lines: string[] = [];

  lines.push(`# ${options.title} - ${context.projectName}`);
  lines.push('');
  lines.push(`> 由 @kit/ai-preset 生成，请勿手动编辑标记区域内的内容`);
  lines.push('');
  lines.push(PRESET_MARKER_START);
  lines.push('');

  // 技术栈概览
  lines.push('## 核心技术栈');
  lines.push('');
  if (context.framework) {
    lines.push(
      `- **框架**: ${FRAMEWORK_NAMES[context.framework] || context.framework}`,
    );
  }
  lines.push('- **语言**: TypeScript (严格类型检查)');
  if (context.domains.length > 0) {
    const domainLabels = context.domains
      .map((d) => DOMAIN_NAMES[d] || d)
      .join('、');
    lines.push(`- **领域**: ${domainLabels}`);
  }
  lines.push('');

  // 各规则内容
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

// ============ 多文件规则构建公共逻辑 ============

/**
 * 构建 frontmatter 格式的规则文件（Cursor / Trae / Qoder 通用逻辑）
 *
 * 输出格式：description + globs + alwaysApply frontmatter + 正文
 */
export function buildFrontmatterRuleFile(rule: RuleSource): string {
  const lines: string[] = [];

  lines.push('---');
  lines.push(`description: ${rule.meta.description || rule.meta.title}`);

  const globs = inferGlobs(rule.meta.tags);
  if (globs.length > 0) {
    lines.push(`globs: ${JSON.stringify(globs)}`);
  }

  // base 层始终生效，其他按文件匹配或智能匹配
  lines.push(`alwaysApply: ${rule.meta.layer === 'base'}`);
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
