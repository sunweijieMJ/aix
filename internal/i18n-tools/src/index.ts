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
  DEFAULT_DIFY_TIMEOUT,
  DEFAULT_INCLUDE,
  DEFAULT_EXCLUDE,
} from './config';
export type {
  I18nToolsConfig,
  ResolvedConfig,
  DifyApiConfig,
  PathsConfig,
  ConcurrencyConfig,
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
export { DifyClient } from './utils/dify-client';
export { IdGenerator } from './utils/id-generator';
export { ConcurrencyController } from './utils/concurrency-controller';
export { InteractiveUtils } from './utils/interactive-utils';
export { LanguageFileManager } from './utils/language-file-manager';
export { CommandUtils } from './utils/command-utils';
export { FormatjsUtils } from './utils/formatjs-utils';
export { MessageProcessor } from './utils/message-processor';
export { HooksUtils } from './utils/hooks-utils';
export { ASTUtils, CommonASTUtils, ReactASTUtils } from './utils/ast';

// Utils - Constants & Enums
export {
  FILES,
  CONFIG,
  LOCALE_TYPE,
  MODE_DESCRIPTIONS,
} from './utils/constants';
export { ModeName, FrameworkType } from './utils/types';

// Utils - Types
export type {
  ExtractedString,
  Translations,
  LocaleMap,
  ILangMsg,
  ILangMap,
  DifyResponse,
  DifyTranslateResponse,
  MessageInfo,
  TransformContext,
} from './utils/types';
