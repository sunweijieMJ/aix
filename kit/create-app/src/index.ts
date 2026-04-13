// Override 命令相关（P0-1）
export { generateFiles, generateOverrideUtils } from './override/generator';
export {
  checkProjectConflict,
  resolveConflicts,
  writeFiles,
  printFileTree,
} from './utils/conflict';
export { detectLanguage, isProjectRoot } from './utils/detector';
export { runPrompts } from './override/prompts';
export type { ModuleId, GenerateOptions, GeneratedFile, TemplateContext } from './override/types';
export {
  ALL_MODULES,
  REQUIRED_MODULES,
  MODULE_DESCRIPTIONS,
  MODULE_DIMENSION,
} from './override/types';

// 全局类型（P0-2+）
export type {
  Platform,
  WebScenario,
  QiankunMode,
  FeatureId,
  ProjectConfig,
  FileEntry,
  FileList,
  TemplateFeatureDef,
  TemplateConfig,
} from './types';

// 错误处理（P0-2）
export { CreateAppError, wrapError } from './utils/errors';
export type { ErrorCode } from './utils/errors';
export { handleError } from './utils/logger';

// 核心模块（P0-2, P0-3）
export { TemplateResolver } from './core/resolver';
export { Composer } from './core/composer';
export { runEntryBuilder } from './core/entry-builders';
export type { EntryBuilder } from './core/entry-builders';
export { deepMerge, sortDependencies, patchPackageJson } from './core/pkg-patcher';
export { writeFiles as writeFileList, printFileTree as printFileList } from './utils/fs';

// 问答编排器（P0-4）
export { collectProjectConfig } from './prompts/index';
