/**
 * @kit/publish 的公开 API。
 *
 * 业务仓库需要的东西只有三类：写配置的 defineConfig 与类型、
 * hooks 里打日志用的 log 系列、以及产物修复常用的 listJsFiles / exec / run。
 */

export { defineConfig } from './config/types';
export type {
  AfterBuildContext,
  BuildConfig,
  CheckFn,
  HooksConfig,
  ManifestConfig,
  ManifestExportsContext,
  PublishConfig,
  PublishContext,
  ResolvedConfig,
  TagsConfig,
} from './config/types';

export { c, logInfo, logOk, logStep, logWarn } from './utils/logger';
export { exec, run, runCapturingStderr, formatDuration, sleep } from './utils/exec';
export type { ExecError } from './utils/exec';
export { listJsFiles } from './utils/fs-walk';
