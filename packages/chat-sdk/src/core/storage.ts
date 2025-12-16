/**
 * @fileoverview 内置存储适配器
 * 提供常用的持久化存储实现
 */

import type { ChatMessage } from '../types';
import type { StorageAdapter } from './ChatStore';

/**
 * LocalStorage 存储适配器
 * 浏览器环境下的持久化存储，数据在浏览器关闭后仍然保留
 *
 * @example
 * ```ts
 * const store = new ChatStore({
 *   storage: new LocalStorageAdapter(),
 *   storageKey: 'my-chat-messages',
 * });
 *
 * // 保存消息
 * await store.saveMessages();
 *
 * // 加载消息
 * await store.loadMessages();
 * ```
 */
export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  /**
   * @param prefix 键名前缀，用于命名空间隔离
   */
  constructor(prefix = 'aix-chat:') {
    this.prefix = prefix;
  }

  async load(key: string): Promise<ChatMessage[] | null> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    try {
      const data = localStorage.getItem(this.prefix + key);
      if (!data) return null;
      return JSON.parse(data) as ChatMessage[];
    } catch {
      return null;
    }
  }

  async save(key: string, messages: ChatMessage[]): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(messages));
    } catch (error) {
      // 存储空间不足时忽略错误
      console.warn('[LocalStorageAdapter] 保存失败:', error);
    }
  }

  async clear(key: string): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    localStorage.removeItem(this.prefix + key);
  }
}

/**
 * SessionStorage 存储适配器
 * 浏览器环境下的会话存储，数据在浏览器标签页关闭后清除
 *
 * @example
 * ```ts
 * const store = new ChatStore({
 *   storage: new SessionStorageAdapter(),
 *   storageKey: 'chat-session',
 * });
 * ```
 */
export class SessionStorageAdapter implements StorageAdapter {
  private prefix: string;

  /**
   * @param prefix 键名前缀，用于命名空间隔离
   */
  constructor(prefix = 'aix-chat:') {
    this.prefix = prefix;
  }

  async load(key: string): Promise<ChatMessage[] | null> {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }

    try {
      const data = sessionStorage.getItem(this.prefix + key);
      if (!data) return null;
      return JSON.parse(data) as ChatMessage[];
    } catch {
      return null;
    }
  }

  async save(key: string, messages: ChatMessage[]): Promise<void> {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }

    try {
      sessionStorage.setItem(this.prefix + key, JSON.stringify(messages));
    } catch (error) {
      console.warn('[SessionStorageAdapter] 保存失败:', error);
    }
  }

  async clear(key: string): Promise<void> {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }

    sessionStorage.removeItem(this.prefix + key);
  }
}

/**
 * 内存存储适配器
 * 非持久化存储，数据仅保存在内存中
 * 适用于测试环境或服务端渲染
 *
 * @example
 * ```ts
 * // 测试中使用
 * const adapter = new MemoryStorageAdapter();
 * const store = new ChatStore({
 *   storage: adapter,
 *   storageKey: 'test-chat',
 * });
 *
 * // 获取所有存储的键
 * console.log(adapter.keys());
 *
 * // 清除所有数据
 * adapter.clearAll();
 * ```
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private storage = new Map<string, ChatMessage[]>();

  async load(key: string): Promise<ChatMessage[] | null> {
    const messages = this.storage.get(key);
    return messages ? [...messages] : null;
  }

  async save(key: string, messages: ChatMessage[]): Promise<void> {
    this.storage.set(key, [...messages]);
  }

  async clear(key: string): Promise<void> {
    this.storage.delete(key);
  }

  /**
   * 获取所有存储的键
   */
  keys(): string[] {
    return Array.from(this.storage.keys());
  }

  /**
   * 清除所有数据
   */
  clearAll(): void {
    this.storage.clear();
  }

  /**
   * 获取存储项数量
   */
  size(): number {
    return this.storage.size;
  }
}

/**
 * IndexedDB 存储适配器
 * 浏览器环境下的大容量持久化存储
 * 适用于需要存储大量消息历史的场景
 *
 * @example
 * ```ts
 * const store = new ChatStore({
 *   storage: new IndexedDBStorageAdapter('my-chat-db'),
 *   storageKey: 'conversation-1',
 * });
 * ```
 */
export class IndexedDBStorageAdapter implements StorageAdapter {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;

  /**
   * @param dbName 数据库名称
   * @param storeName 对象存储名称
   */
  constructor(dbName = 'aix-chat-db', storeName = 'messages') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async load(key: string): Promise<ChatMessage[] | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch {
      return null;
    }
  }

  async save(key: string, messages: ChatMessage[]): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(messages, key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn('[IndexedDBStorageAdapter] 保存失败:', error);
    }
  }

  async clear(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn('[IndexedDBStorageAdapter] 清除失败:', error);
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * 创建 LocalStorage 存储适配器
 */
export function createLocalStorageAdapter(
  prefix?: string,
): LocalStorageAdapter {
  return new LocalStorageAdapter(prefix);
}

/**
 * 创建 SessionStorage 存储适配器
 */
export function createSessionStorageAdapter(
  prefix?: string,
): SessionStorageAdapter {
  return new SessionStorageAdapter(prefix);
}

/**
 * 创建内存存储适配器
 */
export function createMemoryStorageAdapter(): MemoryStorageAdapter {
  return new MemoryStorageAdapter();
}

/**
 * 创建 IndexedDB 存储适配器
 */
export function createIndexedDBStorageAdapter(
  dbName?: string,
  storeName?: string,
): IndexedDBStorageAdapter {
  return new IndexedDBStorageAdapter(dbName, storeName);
}
