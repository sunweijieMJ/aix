// Config
export {
  defineConfig,
  loadConfig,
  resolveConfig,
  loadConfigFile,
  findConfigFile,
} from './config';
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
} from './config';

// Core processors
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

// Adapters
export { FrameworkAdapter, ReactAdapter, VueAdapter } from './adapters';
export type {
  FrameworkConfig,
  ITextExtractor,
  ITransformer,
  IRestoreTransformer,
  IComponentInjector,
  IImportManager,
} from './adapters';

// Strategies
export {
  VueTextExtractor,
  VueTransformer,
  VueRestoreTransformer,
  VueComponentInjector,
  VueImportManager,
  ReactTextExtractor,
  ReactTransformer,
  ReactRestoreTransformer,
  ReactComponentInjector,
  ReactImportManager,
} from './strategies';

// Utils - Classes
export { FileUtils } from './utils/file-utils';
export { LoggerUtils, LogLevel } from './utils/logger';
export { LLMClient } from './utils/llm-client';
export { IdGenerator } from './utils/id-generator';
export { ConcurrencyController } from './utils/concurrency-controller';
export { InteractiveUtils } from './utils/interactive-utils';
export { LanguageFileManager } from './utils/language-file-manager';
export { CommandUtils } from './utils/command-utils';
export { MessageProcessor } from './utils/message-processor';
export { HooksUtils } from './utils/hooks-utils';
export { CommonASTUtils, ReactASTUtils } from './utils/ast';

// Utils - Constants & Enums
export { FILES, CONFIG, MODE_DESCRIPTIONS } from './utils/constants';
export { ModeName } from './utils/types';

// Utils - Types
export type {
  ExtractedString,
  Translations,
  LocaleMap,
  ILangMsg,
  ILangMap,
  MessageInfo,
  TransformContext,
} from './utils/types';
