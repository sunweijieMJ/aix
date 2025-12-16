/**
 * @fileoverview useXChat - 聊天数据流管理
 * 基于 @aix/chat-sdk ChatStore 的 Vue 3 响应式封装
 */

import {
  createChatStore,
  chatStoreManager,
  type ChatStore,
  type ChatStoreState,
  type ChatStoreEvents,
  type MessageContent,
  type MessageRole,
  type BatchUpdateItem,
  type ChatMessage,
  toStringContent,
} from '@aix/chat-sdk';
import { ref, reactive, computed, onScopeDispose } from 'vue';
import type { UseXChatOptions, UseXChatReturn, ParsedMessage } from '../types';

export function useXChat(options: UseXChatOptions = {}): UseXChatReturn {
  const {
    conversationKey = 'default',
    shared = false,
    agent,
    defaultMessages = [],
    maxMessages,
    overflow,
    storage,
    storageKey,
    onRequest: beforeRequest,
    onResponse,
    onError: onErrorCallback,
    placeholder,
    fallback,
    parser,
  } = options;

  // 创建 SDK ChatStore 事件，适配类型
  const storeEvents: ChatStoreEvents = {
    // 将 SDK 的 MessageContent 转换为 string 传递给用户回调
    onRequest: beforeRequest
      ? (content: MessageContent) => beforeRequest(toStringContent(content))
      : undefined,
    onResponse,
    onError: onErrorCallback,
  };

  // 根据配置决定使用共享 Store 还是独立 Store
  let store: ChatStore;
  let isSharedStore = false;

  if (shared) {
    // 使用全局 ChatStoreManager 获取共享 Store
    store = chatStoreManager.get(
      conversationKey,
      {
        agent,
        defaultMessages,
        maxMessages,
        overflow,
        storage,
        storageKey,
      },
      storeEvents,
    );
    isSharedStore = true;
  } else {
    // 创建独立的 ChatStore 实例
    store = createChatStore(
      {
        agent,
        defaultMessages,
        maxMessages,
        overflow,
        storage,
        storageKey,
      },
      storeEvents,
    );
  }

  // Vue 响应式状态
  // 使用 store 的当前状态初始化（共享 Store 可能已有消息）
  const currentState = store.getState();
  const messages = reactive<ChatMessage[]>([...currentState.messages]);
  const isLoading = ref(currentState.isLoading);

  // 占位和回退配置（Vue 层配置，用于 UI 展示）
  const placeholderConfig = ref(placeholder);
  const fallbackConfig = ref(fallback);

  /**
   * 解析后的消息列表
   * 类似于 ant-design/x 的 parsedMessages
   */
  const parsedMessages = computed<ParsedMessage[]>(() => {
    const result: ParsedMessage[] = [];

    messages.forEach((msg) => {
      if (parser) {
        // 使用自定义解析器
        const parsed = parser(msg);
        const parsedArray = Array.isArray(parsed) ? parsed : [parsed];

        parsedArray.forEach((parsedMsg, index) => {
          // 如果解析出多条消息，添加索引后缀
          const id = parsedArray.length > 1 ? `${msg.id}_${index}` : msg.id;
          result.push({
            id,
            message: parsedMsg,
            status: msg.status,
            originalMessage: msg,
          });
        });
      } else {
        // 无解析器时，直接包装原始消息
        result.push({
          id: msg.id,
          message: msg,
          status: msg.status,
          originalMessage: msg,
        });
      }
    });

    return result;
  });

  // 订阅 ChatStore 状态变化，同步到 Vue 响应式状态
  const unsubscribe = store.subscribe((state: ChatStoreState) => {
    // 同步消息列表
    messages.splice(0, messages.length, ...state.messages);
    // 同步加载状态
    isLoading.value = state.isLoading;
  });

  // ==========================================================================
  // 基础操作
  // ==========================================================================

  /**
   * 发送用户消息
   */
  const onRequest = async (content: string) => {
    await store.sendMessage(content);
  };

  /**
   * 清空消息
   */
  const clear = () => {
    store.clear();
  };

  /**
   * 停止生成
   */
  const stop = () => {
    store.stop();
  };

  /**
   * 删除指定消息
   */
  const deleteMessage = (id: string): boolean => {
    return store.deleteMessage(id);
  };

  /**
   * 批量删除消息
   */
  const deleteMessages = (ids: string[]): number => {
    return store.deleteMessages(ids);
  };

  /**
   * 重新生成最后一条 AI 消息
   */
  const regenerate = async () => {
    await store.regenerate();
  };

  /**
   * 更新消息
   */
  const updateMessage = (id: string, content: string): boolean => {
    return store.updateMessage(id, { content });
  };

  /**
   * 批量更新消息
   */
  const batchUpdate = (updates: BatchUpdateItem[]): number => {
    return store.batchUpdate(updates);
  };

  /**
   * 手动重试最后一次失败的请求
   */
  const retry = async () => {
    await store.retry();
  };

  /**
   * 重新加载指定的 AI 消息
   * 类似于 ant-design/x 的 onReload 功能
   * @param messageId 要重新加载的消息 ID
   * @returns 是否成功开始重新加载
   */
  const onReload = async (messageId: string): Promise<boolean> => {
    return store.reloadMessage(messageId);
  };

  /**
   * 添加消息
   */
  const addMessage = (
    message: Omit<ChatMessage, 'id' | 'createAt' | 'updateAt'>,
  ) => {
    return store.addMessage(message);
  };

  /**
   * 在指定位置插入消息
   */
  const insertMessage = (
    message: Omit<ChatMessage, 'id' | 'createAt' | 'updateAt'>,
    index?: number,
  ) => {
    return store.insertMessage(message, index);
  };

  /**
   * 回复消息
   * 发送一条带有引用信息的用户消息
   */
  const replyToMessage = async (messageId: string, content: string) => {
    const replyMsg = store.getMessageById(messageId);
    if (!replyMsg) {
      console.warn('[useXChat] 未找到要回复的消息');
      return;
    }

    // 构建带引用信息的回复元数据
    const replyMeta = {
      replyTo: {
        messageId: replyMsg.id,
        role: replyMsg.role,
        contentSnippet: toStringContent(replyMsg.content).slice(0, 100),
      },
    };

    // 使用带 meta 的 sendMessage，确保 meta 在消息创建时就被关联
    await store.sendMessage(content, { meta: replyMeta });
  };

  // ==========================================================================
  // 查询方法
  // ==========================================================================

  /**
   * 根据 ID 获取消息
   */
  const getMessageById = (id: string): ChatMessage | undefined => {
    return store.getMessageById(id);
  };

  /**
   * 获取指定角色的所有消息
   */
  const getMessagesByRole = (role: MessageRole): ChatMessage[] => {
    return store.getMessagesByRole(role);
  };

  /**
   * 获取最后一条消息
   */
  const getLastMessage = (): ChatMessage | undefined => {
    return store.getLastMessage();
  };

  /**
   * 获取最后一条 AI 消息
   */
  const getLastAssistantMessage = (): ChatMessage | undefined => {
    return store.getLastAssistantMessage();
  };

  /**
   * 获取最后一条用户消息
   */
  const getLastUserMessage = (): ChatMessage | undefined => {
    return store.getLastUserMessage();
  };

  /**
   * 搜索消息（Vue 层实现，使用响应式数据）
   */
  const searchMessages = (keyword: string): ChatMessage[] => {
    if (!keyword.trim()) return [];
    const lowerKeyword = keyword.toLowerCase();
    return messages.filter((msg) => {
      const content = toStringContent(msg.content).toLowerCase();
      return content.includes(lowerKeyword);
    });
  };

  // ==========================================================================
  // 统计方法
  // ==========================================================================

  /**
   * 获取消息总数
   */
  const getMessageCount = (): number => {
    return store.getMessageCount();
  };

  /**
   * 获取指定角色的消息数
   */
  const getMessageCountByRole = (role: MessageRole): number => {
    return store.getMessageCountByRole(role);
  };

  /**
   * 检查是否为空
   */
  const isEmpty = (): boolean => {
    return store.isEmpty();
  };

  // ==========================================================================
  // 快照和序列化
  // ==========================================================================

  /**
   * 创建消息快照
   */
  const snapshot = (): ChatMessage[] => {
    return store.snapshot();
  };

  /**
   * 从快照恢复消息
   */
  const restore = (msgs: ChatMessage[]): void => {
    store.restore(msgs);
  };

  /**
   * 导出消息
   */
  const exportMessages = (format: 'json' | 'markdown' | 'text'): string => {
    switch (format) {
      case 'json':
        return JSON.stringify(messages, null, 2);
      case 'markdown':
        return messages
          .map((msg) => `**${msg.role}**: ${toStringContent(msg.content)}`)
          .join('\n\n');
      case 'text':
      default:
        return messages
          .map((msg) => `${msg.role}: ${toStringContent(msg.content)}`)
          .join('\n');
    }
  };

  // ==========================================================================
  // 持久化
  // ==========================================================================

  /**
   * 从存储加载消息
   */
  const loadMessages = async (): Promise<boolean> => {
    return store.loadMessages();
  };

  /**
   * 保存消息到存储
   */
  const saveMessages = async (): Promise<boolean> => {
    return store.saveMessages();
  };

  /**
   * 清除存储的消息
   */
  const clearStorage = async (): Promise<boolean> => {
    return store.clearStorage();
  };

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  /**
   * 获取最大消息数配置
   */
  const getMaxMessages = (): number | undefined => {
    return store.getMaxMessages();
  };

  /**
   * 设置最大消息数
   */
  const setMaxMessages = (max: number | undefined): void => {
    store.setMaxMessages(max);
  };

  // ==========================================================================
  // 清理
  // ==========================================================================

  onScopeDispose(() => {
    unsubscribe();
    // 只有独立 Store 才需要销毁，共享 Store 由 ChatStoreManager 管理生命周期
    if (!isSharedStore) {
      store.destroy();
    }
  });

  return {
    // 响应式状态
    messages,
    parsedMessages,
    onRequest,
    isLoading,
    placeholderConfig,
    fallbackConfig,

    // 基础操作
    clear,
    stop,
    deleteMessage,
    deleteMessages,
    regenerate,
    updateMessage,
    batchUpdate,
    addMessage,
    insertMessage,
    retry,
    onReload,
    replyToMessage,

    // 查询方法
    getMessageById,
    getMessagesByRole,
    getLastMessage,
    getLastAssistantMessage,
    getLastUserMessage,
    searchMessages,

    // 统计方法
    getMessageCount,
    getMessageCountByRole,
    isEmpty,

    // 快照和序列化
    snapshot,
    restore,
    exportMessages,

    // 持久化
    loadMessages,
    saveMessages,
    clearStorage,

    // 配置管理
    getMaxMessages,
    setMaxMessages,
  };
}
