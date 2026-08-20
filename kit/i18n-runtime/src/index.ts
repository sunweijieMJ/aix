export const RUNTIME_NAME = '@kit/i18n-runtime';

export { createEngine } from './core/engine.js';
export type { I18nRuntimeConfig, I18nRuntimeEngine, I18nRuntimeEvent } from './core/engine.js';

export {
  createProvider,
  FallbackTranslator,
  BackendProvider,
  LibreTranslateProvider,
} from './core/translator/index.js';

export {
  resolveStorageAdapter,
  LocalStorageAdapter,
  IndexedDbAdapter,
} from './core/storage/index.js';
export type { StorageOption } from './core/storage/index.js';

export type {
  ProviderName,
  TranslateProvider,
  TranslateBatchRequest,
  TranslateBatchResult,
  TranslatableAttr,
  TranslationCandidate,
  ShouldTranslate,
  Terminology,
  PackData,
  PackEntry,
  PackStorageAdapter,
  RemotePack,
  NodeState,
} from './types.js';
