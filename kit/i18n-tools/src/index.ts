// =============================================================================
// 公共 API
//
// 仅暴露程序化调用所需的最小集合：配置、Processor、Adapter。
// 内部实现（strategies/* 与 utils/*）通过 Adapter / Processor 对外协作，
// 不在此处直接导出——避免 utils 重命名、字段调整、辅助类拆分等内部重构演变成
// breaking change。需要扩展时优先通过 Adapter 接口注入实现。
// =============================================================================

// ---- Config ----
export { defineConfig, loadConfig, resolveConfig, loadConfigFile, findConfigFile } from './config';
export {
  DEFAULT_PATHS,
  DEFAULT_CONCURRENCY,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_DELAY,
  DEFAULT_LLM_TIMEOUT,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_LOCALE,
  DEFAULT_ID_PREFIX,
  DEFAULT_INCLUDE,
  DEFAULT_EXCLUDE,
} from './config';
export type {
  I18nToolsConfig,
  ResolvedConfig,
  LLMConfig,
  PathsConfig,
  ConcurrencyConfig,
  LocaleConfig,
  PromptsConfig,
  VueConfig,
  ReactConfig,
  GlossaryConfig,
  IdPrefixConfig,
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
} from './core';

// ---- Adapters ----
export { FrameworkAdapter, ReactAdapter, VueAdapter, createFrameworkAdapter } from './adapters';
export type {
  FrameworkConfig,
  ITextExtractor,
  ITransformer,
  IRestoreTransformer,
  IComponentInjector,
  IImportManager,
  ReactAdapterOptions,
  VueAdapterOptions,
} from './adapters';
