// Override 命令相关（P0-1）
export { generateFiles, findMissingPrerequisites } from './override/generator';
export { checkProjectConflict, resolveConflicts } from './utils/conflict';
// writeFiles / printFileTree 收敛到 utils/fs 的单一实现（见文末统一导出）
export { isProjectRoot } from './utils/detector';
export { runPrompts } from './override/prompts';
export type {
  ModuleId,
  ModuleDef,
  ModuleDimension,
  GenerateOptions,
  GeneratedFile,
  TemplateContext,
} from './override/types';
// MODULE_REGISTRY 是模块元数据的单一真源，其余四张表都由它派生（见 override/types.ts）
export {
  MODULE_REGISTRY,
  ALL_MODULES,
  REQUIRED_MODULES,
  MODULE_DESCRIPTIONS,
  MODULE_DIMENSION,
} from './override/types';

// 全局类型（P0-2+）
export type {
  Platform,
  ProjectConfig,
  FileEntry,
  FileList,
  TemplateFeatureDef,
  TemplateParamDef,
  TemplateConfig,
} from './types';

// 模板注册表（P0-5）
export { TEMPLATE_REGISTRY, findTemplateById, loadTemplateRegistry } from './config/defaults';
export type { TemplateRegistryEntry } from './config/defaults';
export {
  loadUserRegistry,
  mergeRegistries,
  userConfigDir,
  userRegistryPath,
} from './config/user-registry';

// 错误处理（P0-2）
export { CreateAppError, wrapError } from './utils/errors';
export type { ErrorCode } from './utils/errors';
export { handleError } from './utils/logger';

// 核心模块（P0-2, P0-3）
export { TemplateResolver, isLocalSource, resolveLocalSource } from './core/resolver';
export {
  isGitSource,
  parseGitSource,
  toCloneUrl,
  gitCacheRoot,
  gitCacheDir,
  buildCloneArgs,
} from './core/git-source';
export type { GitSource } from './core/git-source';
export { Composer } from './core/composer';
export { lintManifest } from './core/manifest-lint';
export { applyConditionalBlocks } from './core/conditional';
export { deepMerge, sortDependencies, patchPackageJson } from './core/pkg-patcher';
export { writeFiles, printFileTree, emptyDir } from './utils/fs';

// 问答编排器（P0-4）
export {
  collectBasicInfo,
  collectFeatureSelection,
  collectPostOptions,
  collectTemplateParams,
  confirmSummary,
  buildSummary,
  parseParamArgs,
  resolveTemplateArg,
  validateFeatureIds,
} from './prompts/index';
export type { BasicInfo, PostOptions, SummaryInput } from './prompts/index';
