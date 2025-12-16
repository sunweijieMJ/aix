/**
 * @fileoverview Core 模块统一导出
 * @module @aix/chat-sdk/core
 */

// ============================================================
// 核心类
// ============================================================

// Observable 基类
export {
  Observable,
  EventEmitter,
  createObservable,
  type StateListener,
  type Unsubscribe,
  type ObservableOptions,
} from './Observable';

// ErrorHandler
export {
  ErrorHandler,
  createErrorHandler,
  type ErrorHandlerState,
} from './ErrorHandler';

// RetryEngine
export {
  RetryEngine,
  createRetryEngine,
  retryFetch,
  type RetryEngineConfig,
  type RetryState,
} from './RetryEngine';

// AgentRunner
export {
  AgentRunner,
  createAgentRunner,
  type AgentRunnerState,
} from './AgentRunner';

// ChatStore
export {
  ChatStore,
  createChatStore,
  type ChatStoreState,
  type ChatStoreEvents,
  type ChatStoreOptions,
  type ChatStoreAgent,
  type StorageAdapter,
  type OverflowStrategy,
  type BatchUpdateItem,
  type ChatStoreJSON,
} from './ChatStore';

// ChatStoreManager
export {
  ChatStoreManager,
  createChatStoreManager,
  chatStoreManager,
  type ChatStoreManagerOptions,
  type ConversationInfo,
} from './ChatStoreManager';

// Storage Adapters
export {
  LocalStorageAdapter,
  SessionStorageAdapter,
  MemoryStorageAdapter,
  IndexedDBStorageAdapter,
  createLocalStorageAdapter,
  createSessionStorageAdapter,
  createMemoryStorageAdapter,
  createIndexedDBStorageAdapter,
} from './storage';
