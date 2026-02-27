/**
 * Sentinel 配置类型定义
 *
 * 定义安装阶段、配置接口和阶段配置常量
 */

export type Phase = 1 | 2 | 3 | 4;

// 当前支持的平台。扩展新平台时添加到联合类型即可。
export type Platform = 'github';

export interface InstallConfig {
  /** 安装阶段 */
  phase: Phase;
  /** 目标仓库目录 */
  target: string;
  /** 跳过交互确认 */
  yes: boolean;
  /** 干跑模式，不实际写入 */
  dryRun: boolean;
  /** Node.js 版本，默认 "20" */
  nodeVersion: string;
  /** GitHub reviewers */
  reviewers?: string;
  /** 部署 workflow 名称（Phase 2 post-deploy 触发用） */
  deployWorkflow?: string;
  /** CI 平台，默认 'github' */
  platform: Platform;
  /** 选择性安装的阶段列表，优先于 phase 的累积逻辑 */
  phases?: Phase[];
  /** 允许 AI 修改的文件路径模式（bash regex），默认 ["^src/", "^styles/"] */
  allowedPaths?: string[];
}

export interface InstallResult {
  /** 已安装的 workflow 文件路径 */
  workflows: string[];
  /** 已创建的 labels */
  labels: string[];
  /** 是否修改了 CLAUDE.md */
  claudeMdPatched: boolean;
  /** secrets 检查是否通过 */
  secretsOk: boolean;
}

export interface PhaseConfig {
  phase: Phase;
  name: string;
  description: string;
  /** 模板文件名列表 */
  workflows: string[];
  /** 所需的 CI labels */
  labels: string[];
  /** 所需的 CI secrets */
  secrets: string[];
  /** 所需的 CI variables */
  variables: string[];
}

export const DEFAULT_ALLOWED_PATHS = ['^src/', '^styles/'];

export const VALID_PLATFORMS: Platform[] = ['github'];

export const MARKER_START = '<!-- sentinel:start -->';
export const MARKER_END = '<!-- sentinel:end -->';

export const PHASE_CONFIGS: Record<Phase, PhaseConfig> = {
  1: {
    phase: 1,
    name: 'Issue 标签触发',
    description: 'MVP - Issue 打 sentinel 标签触发 AI 修复',
    workflows: ['sentinel-issue.yml'],
    labels: ['sentinel', 'bot'],
    secrets: ['ANTHROPIC_API_KEY'],
    variables: ['SENTINEL_ENABLED'],
  },
  2: {
    phase: 2,
    name: '部署后冒烟测试',
    description: '部署成功后自动跑 E2E，失败触发 AI 修复',
    workflows: ['sentinel-post-deploy.yml'],
    labels: ['sentinel', 'post-deploy', 'urgent'],
    secrets: ['ANTHROPIC_API_KEY'],
    variables: ['SENTINEL_ENABLED'],
  },
  3: {
    phase: 3,
    name: 'Sentry 错误联动',
    description: '线上错误超阈值自动触发 AI 修复',
    workflows: ['sentinel-sentry.yml'],
    labels: ['sentinel', 'bot', 'sentry'],
    secrets: ['ANTHROPIC_API_KEY', 'SENTINEL_PAT'],
    variables: ['SENTINEL_ENABLED', 'SENTINEL_REVIEWERS'],
  },
  4: {
    phase: 4,
    name: '定时质量巡检',
    description: '工作日定时跑 lint/type-check/test/audit',
    workflows: ['sentinel-scheduled.yml'],
    labels: ['sentinel', 'maintenance'],
    secrets: ['ANTHROPIC_API_KEY'],
    variables: ['SENTINEL_ENABLED'],
  },
};
