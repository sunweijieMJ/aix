// =============================================================================
// 配置模块出口
// =============================================================================

export { defineConfig } from './types';

// ---- 用户输入接口 ----
export type {
  I18nToolsConfig,
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
  BucketsConfig,
  BucketRule,
  MergeConfig,
  CIConfig,
} from './types';

// ---- 已解析接口 ----
export type { ResolvedConfig, ResolvedLLMTaskConfig, ResolvedPrefixStrategy } from './types';

// ---- 加载与解析 ----
export {
  resolveConfig,
  resolveBuckets,
  loadConfig,
  loadConfigFile,
  findConfigFile,
} from './loader';

// ---- 默认值 ----
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
} from './defaults';
