/**
 * 类型定义统一导出
 */

export type {
  Phase,
  Platform,
  PackageManager,
  ScheduledCheck,
  InstallConfig,
  InstallResult,
  PhaseConfig,
} from './config.js';

export {
  DEFAULT_ALLOWED_PATHS,
  PHASE_CONFIGS,
  VALID_PLATFORMS,
  MARKER_START,
  MARKER_END,
  DEFAULT_PACKAGE_MANAGER,
  DEFAULT_MODEL,
  DEFAULT_PR_DAILY_LIMIT,
  DEFAULT_CRON,
  DEFAULT_MAX_TURNS,
  DEFAULT_SMOKE_TEST_CMD,
  ALL_SCHEDULED_CHECKS,
} from './config.js';
