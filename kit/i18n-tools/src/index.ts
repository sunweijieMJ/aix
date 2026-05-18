// =============================================================================
// 公共 API
//
// 仅暴露程序化调用所需的最小集合：配置、Processor、Adapter。
// 内部实现（strategies/* 与 utils/*）通过 Adapter / Processor 对外协作，
// 不在此处直接导出——避免 utils 重命名、字段调整、辅助类拆分等内部重构演变成
// breaking change。需要扩展时优先通过 Adapter 接口注入实现。
// =============================================================================

// ---- Config: helpers ----
export { defineConfig, loadConfig, resolveConfig, loadConfigFile, findConfigFile } from './config';

// ---- Config: defaults ----
export {
  DEFAULT_IO,
  DEFAULT_LOCALES,
  DEFAULT_KEYS,
  DEFAULT_PREFIX_STRATEGY,
  BUILTIN_CN_MAPPINGS,
  DEFAULT_EXTRACT,
  DEFAULT_GLOSSARY,
  DEFAULT_LLM_TASK,
  DEFAULT_LLM_MODEL,
  DEFAULT_VUE_FRAMEWORK,
  DEFAULT_REACT_FRAMEWORK,
  DEFAULT_BUCKETS,
  DEFAULT_MERGE,
  DEFAULT_CI,
} from './config';

// ---- Config: types ----
export type {
  I18nToolsConfig,
  ResolvedConfig,
  FrameworkConfig,
  VueFrameworkOptions,
  ReactFrameworkOptions,
  LocalesConfig,
  IoConfig,
  KeysConfig,
  PathPrefixStrategy,
  FixedPrefixStrategy,
  CustomPrefixStrategy,
  PrefixStrategyConfig,
  PrefixContext,
  KeysFallbackConfig,
  KeysReuseConfig,
  ExtractConfig,
  GlossaryConfig,
  LLMConfig,
  LLMSharedConfig,
  LLMTaskConfig,
  ResolvedLLMTaskConfig,
  ResolvedPrefixStrategy,
  BucketsConfig,
  BucketRule,
  MergeConfig,
  CIConfig,
} from './config';

// ---- Core processors ----
export {
  BaseProcessor,
  GenerateProcessor,
  RestoreProcessor,
  PickProcessor,
  TranslateProcessor,
  MergeProcessor,
  ExportProcessor,
  AutomaticProcessor,
  DoctorProcessor,
  GeneratePlanWriter,
} from './core';
export type {
  GeneratePlan,
  GeneratePlanFileEntry,
  GeneratePlanHit,
  DoctorCategory,
  DoctorFinding,
  DoctorSeverity,
} from './core';

// ---- Adapters ----
export { FrameworkAdapter, ReactAdapter, VueAdapter, createFrameworkAdapter } from './adapters';
export type {
  FrameworkConfig as FrameworkAdapterConfig,
  ITextExtractor,
  ITransformer,
  IRestoreTransformer,
  IComponentInjector,
  IImportManager,
  ReactAdapterOptions,
  VueAdapterOptions,
} from './adapters';
