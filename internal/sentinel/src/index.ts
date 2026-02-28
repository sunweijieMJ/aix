/**
 * @kit/sentinel - AI 自动修复 Workflow 安装工具
 *
 * 提供 CLI 和编程 API，将 AI sentinel CI pipelines
 * 安装到业务仓库中。当前支持 GitHub Actions。
 */

// ---- 类型导出 ----

export type {
  Phase,
  Platform,
  PackageManager,
  ScheduledCheck,
  InstallConfig,
  InstallResult,
  PhaseConfig,
} from './types/index.js';

// ---- 常量导出 ----

export {
  PHASE_CONFIGS,
  VALID_PLATFORMS,
  DEFAULT_PACKAGE_MANAGER,
  DEFAULT_MODEL,
  DEFAULT_PR_DAILY_LIMIT,
  DEFAULT_CRON,
  DEFAULT_MAX_TURNS,
  DEFAULT_SMOKE_TEST_CMD,
  ALL_SCHEDULED_CHECKS,
} from './types/index.js';

// ---- 平台适配器 ----

export type { PlatformAdapter } from './platform/index.js';
export { createPlatformAdapter, GitHubAdapter } from './platform/index.js';

// ---- 核心 API ----

export { install } from './core/installer.js';
export { checkSecrets } from './core/secrets-checker.js';
export { validateEnvironment } from './core/validator.js';

// ---- 工具 ----

export { renderTemplate } from './utils/template.js';
export { parseGitRemote } from './utils/git.js';
