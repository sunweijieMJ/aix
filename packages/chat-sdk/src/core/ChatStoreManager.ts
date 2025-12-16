/**
 * @fileoverview ChatStoreManager - 多会话 Store 管理器
 * 提供多会话隔离和生命周期管理
 */

import {
  ChatStore,
  type ChatStoreOptions,
  type ChatStoreEvents,
} from './ChatStore';

/**
 * ChatStoreManager 配置
 */
export interface ChatStoreManagerOptions {
  /** 默认的 ChatStore 配置 */
  defaultOptions?: ChatStoreOptions;
  /** 默认的事件回调 */
  defaultEvents?: ChatStoreEvents;
}

/**
 * 会话信息
 */
export interface ConversationInfo {
  /** 会话 ID */
  key: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后访问时间 */
  lastAccessedAt: number;
  /** 消息数量 */
  messageCount: number;
}

/**
 * ChatStoreManager - 多会话 Store 管理器
 *
 * 提供会话级别的 ChatStore 实例管理，支持：
 * - 会话隔离：每个 conversationKey 对应独立的 ChatStore
 * - 自动创建：首次访问时自动创建 Store
 * - 生命周期管理：支持销毁单个或全部会话
 *
 * @example
 * ```ts
 * const manager = new ChatStoreManager({
 *   defaultOptions: { maxMessages: 100 }
 * });
 *
 * // 获取会话的 Store（不存在则自动创建）
 * const store1 = manager.get('conversation-1');
 * const store2 = manager.get('conversation-2');
 *
 * // 删除会话
 * manager.delete('conversation-1');
 *
 * // 获取所有会话信息
 * const infos = manager.getConversationInfos();
 * ```
 */
export class ChatStoreManager {
  private stores = new Map<string, ChatStore>();
  private createdAtMap = new Map<string, number>();
  private accessedAtMap = new Map<string, number>();
  private defaultOptions: ChatStoreOptions;
  private defaultEvents: ChatStoreEvents;

  constructor(options: ChatStoreManagerOptions = {}) {
    this.defaultOptions = options.defaultOptions ?? {};
    this.defaultEvents = options.defaultEvents ?? {};
  }

  /**
   * 获取指定会话的 ChatStore
   * 如果不存在则自动创建
   */
  get(
    conversationKey: string,
    options?: ChatStoreOptions,
    events?: ChatStoreEvents,
  ): ChatStore {
    const now = Date.now();

    if (!this.stores.has(conversationKey)) {
      // 合并默认配置和传入配置
      const mergedOptions: ChatStoreOptions = {
        ...this.defaultOptions,
        ...options,
      };
      const mergedEvents: ChatStoreEvents = {
        ...this.defaultEvents,
        ...events,
      };

      const store = new ChatStore(mergedOptions, mergedEvents);
      this.stores.set(conversationKey, store);
      this.createdAtMap.set(conversationKey, now);
    }

    // 更新访问时间
    this.accessedAtMap.set(conversationKey, now);

    return this.stores.get(conversationKey)!;
  }

  /**
   * 检查指定会话是否存在
   */
  has(conversationKey: string): boolean {
    return this.stores.has(conversationKey);
  }

  /**
   * 删除指定会话
   * @returns 是否成功删除
   */
  delete(conversationKey: string): boolean {
    const store = this.stores.get(conversationKey);
    if (store) {
      store.destroy();
      this.stores.delete(conversationKey);
      this.createdAtMap.delete(conversationKey);
      this.accessedAtMap.delete(conversationKey);
      return true;
    }
    return false;
  }

  /**
   * 清空所有会话
   */
  clear(): void {
    for (const store of this.stores.values()) {
      store.destroy();
    }
    this.stores.clear();
    this.createdAtMap.clear();
    this.accessedAtMap.clear();
  }

  /**
   * 获取所有会话 Key
   */
  keys(): string[] {
    return Array.from(this.stores.keys());
  }

  /**
   * 获取会话数量
   */
  size(): number {
    return this.stores.size;
  }

  /**
   * 获取指定会话的信息
   */
  getConversationInfo(conversationKey: string): ConversationInfo | undefined {
    const store = this.stores.get(conversationKey);
    if (!store) return undefined;

    return {
      key: conversationKey,
      createdAt: this.createdAtMap.get(conversationKey) ?? 0,
      lastAccessedAt: this.accessedAtMap.get(conversationKey) ?? 0,
      messageCount: store.getMessageCount(),
    };
  }

  /**
   * 获取所有会话的信息
   */
  getConversationInfos(): ConversationInfo[] {
    return this.keys().map((key) => this.getConversationInfo(key)!);
  }

  /**
   * 清理空闲会话
   * @param maxIdleTime 最大空闲时间（毫秒），默认 30 分钟
   * @returns 被清理的会话数量
   */
  cleanupIdleConversations(maxIdleTime: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, lastAccessed] of this.accessedAtMap.entries()) {
      if (now - lastAccessed > maxIdleTime) {
        this.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.clear();
  }
}

/**
 * 创建 ChatStoreManager 实例
 */
export function createChatStoreManager(
  options?: ChatStoreManagerOptions,
): ChatStoreManager {
  return new ChatStoreManager(options);
}

/**
 * 全局默认的 ChatStoreManager 单例
 */
export const chatStoreManager = new ChatStoreManager();
