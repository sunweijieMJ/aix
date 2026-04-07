/**
 * @kit/ai-preset - 跨 AI 平台的编码规范管理工具
 *
 * 导出核心 API、类型和适配器，支持编程式使用
 */

// 类型导出
export type {
  AIPlatform,
  AdapterContext,
  CheckStatus,
  DoctorCheck,
  DoctorResult,
  DomainPreset,
  FileStatus,
  FrameworkPreset,
  InitConfig,
  LockFile,
  LockFileEntry,
  MergedPresetResult,
  MergedSection,
  PlatformAdapter,
  PlatformOutputFile,
  PresetLayer,
  PresetName,
  RuleSource,
  RuleSourceMeta,
  UserConfig,
  VariableDeclaration,
} from './types.js';

// 常量导出
export {
  ALL_DOMAINS,
  ALL_FRAMEWORKS,
  ALL_PLATFORMS,
  CONFIG_FILENAME,
  LOCK_DIR,
  LOCK_FILENAME,
  PRESET_DIR_MAP,
  PRESET_MARKER_END,
  PRESET_MARKER_START,
} from './types.js';

// 核心模块
export {
  filterRulesForPlatform,
  loadRuleSources,
  mergeRuleSources,
  resolvePresetNames,
} from './core/resolver.js';
export { collectVariables, renderTemplate } from './core/template.js';
export { writeOutputFiles } from './core/writer.js';
export type { WriteOptions, WriteResult } from './core/writer.js';
export { buildLockFile, checkFileStatus, readLockFile, writeLockFile } from './core/lock.js';
export { detectPlatforms } from './core/detector.js';
export {
  readConfig,
  writeConfig,
  initConfigToPersisted,
  persistedToInitConfig,
} from './core/config.js';
export type { PersistedConfig } from './core/config.js';
export { createBackup, restoreFromBackup, hasBackup } from './core/backup.js';
export { generateAllPlatformFiles } from './core/generator.js';
export type { GenerateOptions } from './core/generator.js';

// 适配器
export {
  ClaudeAdapter,
  CursorAdapter,
  CopilotAdapter,
  CodexAdapter,
  WindsurfAdapter,
  TraeAdapter,
  TongyiAdapter,
  QoderAdapter,
  GeminiAdapter,
  createAdapter,
  getAvailablePlatforms,
} from './adapters/index.js';
