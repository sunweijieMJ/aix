/**
 * @fileoverview ChatStore - 框架无关的聊天数据管理
 * 提供基础的消息管理和 Agent 调用能力
 */

import type {
  ChatMessage,
  AgentCallbacks,
  AgentRequestInfo,
  MessageContent,
  MessageRole,
} from '../types';
import { toStringContent, serializeError } from '../types';
import { logger, uid } from '../utils';
import { Observable } from './Observable';

/**
 * Agent 接口
 */
export interface ChatStoreAgent {
  /** 执行请求 */
  run: (info: AgentRequestInfo, callbacks: AgentCallbacks) => Promise<void>;
  /** 停止请求 */
  stop: () => void;
}

/**
 * 持久化存储适配器接口
 */
export interface StorageAdapter {
  /** 从存储加载消息 */
  load(key: string): Promise<ChatMessage[] | null>;
  /** 保存消息到存储 */
  save(key: string, messages: ChatMessage[]): Promise<void>;
  /** 清除存储的消息 */
  clear(key: string): Promise<void>;
}

/**
 * 消息溢出策略
 */
export type OverflowStrategy = 'remove-oldest' | 'prevent-add';

/**
 * ChatStore 配置选项
 */
export interface ChatStoreOptions {
  /** Agent 实例 */
  agent?: ChatStoreAgent;
  /** 初始消息列表 */
  defaultMessages?: ChatMessage[];
  /** 最大消息数量限制 */
  maxMessages?: number;
  /** 达到限制时的策略 */
  overflow?: OverflowStrategy;
  /** 持久化存储适配器 */
  storage?: StorageAdapter;
  /** 存储键名 */
  storageKey?: string;
}

/**
 * ChatStore 状态
 */
export interface ChatStoreState {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 是否正在加载 */
  isLoading: boolean;
}

/**
 * ChatStore 事件
 */
export interface ChatStoreEvents {
  /** 消息变更回调 */
  onMessagesChange?: (messages: ChatMessage[]) => void;
  /** 请求前回调，返回 false 取消发送 */
  onRequest?: (content: MessageContent) => boolean | Promise<boolean>;
  /** 响应成功回调 */
  onResponse?: (message: ChatMessage) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

/**
 * 批量更新项
 */
export interface BatchUpdateItem {
  id: string;
  changes: Partial<Omit<ChatMessage, 'id' | 'createAt'>>;
}

/**
 * ChatStore 序列化数据
 */
export interface ChatStoreJSON {
  messages: ChatMessage[];
  isLoading: boolean;
}

/**
 * ChatStore - 聊天数据管理核心类
 *
 * 继承自 Observable，提供状态订阅能力
 *
 * @example
 * ```ts
 * const store = new ChatStore({
 *   agent: myAgent,
 *   maxMessages: 100,
 *   overflow: 'remove-oldest',
 * });
 *
 * // 发送消息
 * await store.sendMessage('Hello');
 *
 * // 获取消息
 * const messages = store.getMessages();
 * const lastMsg = store.getLastMessage();
 * const byId = store.getMessageById('msg-123');
 *
 * // 订阅变更
 * store.subscribe((state) => {
 *   console.log('Messages:', state.messages);
 * });
 * ```
 */
export class ChatStore extends Observable<ChatStoreState> {
  private currentAssistantIndex = -1;
  /** 保存最后一条用户消息的完整内容（支持多模态重发） */
  private lastUserMessageContent: MessageContent = '';
  private agent: ChatStoreAgent | null;
  private events: ChatStoreEvents = {};
  private options: ChatStoreOptions;

  /** 节流相关状态 */
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingNotify = false;
  private readonly throttleInterval = 50;

  constructor(options: ChatStoreOptions = {}, events: ChatStoreEvents = {}) {
    super({
      messages: [...(options.defaultMessages ?? [])],
      isLoading: false,
    });
    this.agent = options.agent ?? null;
    this.events = events;
    this.options = options;
  }

  // ==========================================================================
  // 基础查询方法
  // ==========================================================================

  /**
   * 获取所有消息
   */
  getMessages(): ChatMessage[] {
    return [...this.state.messages];
  }

  /**
   * 获取加载状态
   */
  isLoading(): boolean {
    return this.state.isLoading;
  }

  /**
   * 根据 ID 获取消息
   */
  getMessageById(id: string): ChatMessage | undefined {
    return this.state.messages.find((msg) => msg.id === id);
  }

  /**
   * 获取指定角色的所有消息
   */
  getMessagesByRole(role: MessageRole): ChatMessage[] {
    return this.state.messages.filter((msg) => msg.role === role);
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage(): ChatMessage | undefined {
    const messages = this.state.messages;
    return messages.length > 0 ? messages[messages.length - 1] : undefined;
  }

  /**
   * 获取最后一条 AI 消息
   */
  getLastAssistantMessage(): ChatMessage | undefined {
    const messages = this.state.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') {
        return messages[i];
      }
    }
    return undefined;
  }

  /**
   * 获取最后一条用户消息
   */
  getLastUserMessage(): ChatMessage | undefined {
    const messages = this.state.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        return messages[i];
      }
    }
    return undefined;
  }

  // ==========================================================================
  // 统计方法
  // ==========================================================================

  /**
   * 获取消息总数
   */
  getMessageCount(): number {
    return this.state.messages.length;
  }

  /**
   * 获取指定角色的消息数
   */
  getMessageCountByRole(role: MessageRole): number {
    return this.state.messages.filter((msg) => msg.role === role).length;
  }

  /**
   * 检查是否为空
   */
  isEmpty(): boolean {
    return this.state.messages.length === 0;
  }

  // ==========================================================================
  // 消息发送
  // ==========================================================================

  /**
   * 发送用户消息
   * @param content 消息内容，支持字符串或多模态内容数组
   * @param options 可选配置
   * @param options.meta 消息元数据（如回复引用信息）
   * @returns 是否成功发送（如果正在处理请求则返回 false）
   */
  async sendMessage(
    content: MessageContent,
    options?: { meta?: Record<string, unknown> },
  ): Promise<boolean> {
    // 并发保护：防止在请求进行中时重复发送
    if (this.state.isLoading) {
      logger.warn('[ChatStore] 正在处理请求，请等待完成后再发送');
      return false;
    }

    // 输入验证：检查内容是否为空
    const isEmpty =
      typeof content === 'string'
        ? content.trim() === ''
        : !Array.isArray(content) || content.length === 0;

    if (isEmpty) {
      logger.warn('[ChatStore] 消息内容不能为空');
      return false;
    }

    // 发送前拦截
    if (this.events.onRequest) {
      const shouldContinue = await this.events.onRequest(content);
      if (!shouldContinue) return false;
    }

    // 创建用户消息
    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      content: content,
      createAt: Date.now(),
      updateAt: Date.now(),
      status: 'success',
      ...(options?.meta ? { meta: options.meta } : {}),
    };

    // 应用消息限制
    const newMessages = this.applyMaxMessages([
      ...this.state.messages,
      userMessage,
    ]);
    this.updateState({ messages: newMessages });

    if (!this.agent) return true;

    await this.executeAgentRun(content);
    return true;
  }

  /**
   * 执行 Agent 调用
   * @param messageContent 消息内容（支持字符串或多模态内容）
   */
  private async executeAgentRun(messageContent: MessageContent): Promise<void> {
    if (!this.agent) return;

    // 保存最后一条用户消息内容（支持多模态重发）
    this.lastUserMessageContent = messageContent;
    const messageString = toStringContent(messageContent);

    // 创建 AI 消息占位
    const assistantMessage: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      createAt: Date.now(),
      updateAt: Date.now(),
      status: 'loading', // 使用 loading 状态
    };

    const newMessages = this.applyMaxMessages([
      ...this.state.messages,
      assistantMessage,
    ]);
    this.currentAssistantIndex = newMessages.length - 1;

    this.updateState({
      messages: newMessages,
      isLoading: true,
    });

    await this.agent.run(
      {
        message: messageString,
        messages: newMessages,
      },
      this.createAgentCallbacks(),
    );
  }

  /**
   * 创建统一的 Agent 回调对象
   * 用于 executeAgentRun 和 reloadMessage 共享回调逻辑
   */
  private createAgentCallbacks(): AgentCallbacks {
    return {
      onUpdate: (chunk: string) => {
        const index = this.currentAssistantIndex;
        const messages = [...this.state.messages];
        if (index >= 0 && messages[index]) {
          messages[index] = {
            ...messages[index],
            content: chunk,
            status: 'streaming',
            updateAt: Date.now(),
          };
          this.updateStateThrottled({ messages });
        }
      },
      onSuccess: (finalContent: string) => {
        const index = this.currentAssistantIndex;
        const messages = [...this.state.messages];
        if (index >= 0 && messages[index]) {
          messages[index] = {
            ...messages[index],
            content: finalContent,
            status: 'success',
            updateAt: Date.now(),
          };
          this.events.onResponse?.(messages[index]);
        }
        this.currentAssistantIndex = -1;
        this.updateState({ messages, isLoading: false });
      },
      onError: (error: Error) => {
        const index = this.currentAssistantIndex;
        const messages = [...this.state.messages];
        if (index >= 0 && messages[index]) {
          messages[index] = {
            ...messages[index],
            status: 'error',
            error: serializeError(error),
            updateAt: Date.now(),
          };
        }
        this.currentAssistantIndex = -1;
        this.updateState({ messages, isLoading: false });
        this.events.onError?.(error);
      },
    };
  }

  // ==========================================================================
  // 消息 CRUD 操作
  // ==========================================================================

  /**
   * 添加消息
   */
  addMessage(
    message: Omit<ChatMessage, 'id' | 'createAt' | 'updateAt'>,
  ): ChatMessage {
    const now = Date.now();
    const newMessage: ChatMessage = {
      ...message,
      id: uid(),
      createAt: now,
      updateAt: now,
    };

    const newMessages = this.applyMaxMessages([
      ...this.state.messages,
      newMessage,
    ]);
    this.updateState({ messages: newMessages });
    return newMessage;
  }

  /**
   * 在指定位置插入消息
   * @param message 消息内容
   * @param index 插入位置，默认为末尾
   */
  insertMessage(
    message: Omit<ChatMessage, 'id' | 'createAt' | 'updateAt'>,
    index?: number,
  ): ChatMessage {
    const now = Date.now();
    const newMessage: ChatMessage = {
      ...message,
      id: uid(),
      createAt: now,
      updateAt: now,
    };

    const messages = [...this.state.messages];
    const insertIndex =
      index !== undefined
        ? Math.max(0, Math.min(index, messages.length))
        : messages.length;
    messages.splice(insertIndex, 0, newMessage);

    const newMessages = this.applyMaxMessages(messages);
    this.updateState({ messages: newMessages });
    return newMessage;
  }

  /**
   * 删除消息
   */
  deleteMessage(id: string): boolean {
    const messages = this.state.messages;
    const index = messages.findIndex((msg) => msg.id === id);
    if (index !== -1) {
      const newMessages = [...messages];
      newMessages.splice(index, 1);
      this.updateState({ messages: newMessages });
      return true;
    }
    return false;
  }

  /**
   * 批量删除消息
   * @returns 实际删除的数量
   */
  deleteMessages(ids: string[]): number {
    const idSet = new Set(ids);
    const originalLength = this.state.messages.length;
    const newMessages = this.state.messages.filter((msg) => !idSet.has(msg.id));
    const deletedCount = originalLength - newMessages.length;

    if (deletedCount > 0) {
      this.updateState({ messages: newMessages });
    }
    return deletedCount;
  }

  /**
   * 更新消息
   */
  updateMessage(
    id: string,
    updates: Partial<Omit<ChatMessage, 'id' | 'createAt'>>,
  ): boolean {
    const messages = this.state.messages;
    const index = messages.findIndex((m) => m.id === id);
    if (index !== -1 && messages[index]) {
      const newMessages = [...messages];
      const existingMessage = messages[index];
      newMessages[index] = {
        ...existingMessage,
        ...updates,
        updateAt: Date.now(),
      };
      this.updateState({ messages: newMessages });
      return true;
    }
    return false;
  }

  /**
   * 批量更新消息
   * @returns 实际更新的数量
   */
  batchUpdate(updates: BatchUpdateItem[]): number {
    const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
    let updatedCount = 0;
    const now = Date.now();

    const newMessages = this.state.messages.map((msg) => {
      const changes = updateMap.get(msg.id);
      if (changes) {
        updatedCount++;
        return { ...msg, ...changes, updateAt: now };
      }
      return msg;
    });

    if (updatedCount > 0) {
      this.updateState({ messages: newMessages });
    }
    return updatedCount;
  }

  /**
   * 清空消息
   */
  clear(): void {
    this.currentAssistantIndex = -1;
    this.lastUserMessageContent = '';
    this.updateState({ messages: [] });
  }

  // ==========================================================================
  // AI 交互
  // ==========================================================================

  /**
   * 停止生成
   */
  stop(): void {
    this.agent?.stop();

    const index = this.currentAssistantIndex;
    const messages = [...this.state.messages];
    if (index >= 0 && messages[index]) {
      messages[index] = {
        ...messages[index],
        status: 'cancelled',
        updateAt: Date.now(),
      };
    }
    this.currentAssistantIndex = -1;
    this.updateState({ messages, isLoading: false });
  }

  /**
   * 重新生成最后一条 AI 消息
   * 支持多模态消息内容的完整重发
   */
  async regenerate(): Promise<void> {
    if (this.state.isLoading) {
      logger.warn('[ChatStore] 正在处理请求，无法重新生成');
      return;
    }

    const messages = this.state.messages;

    // 找到最后一条 AI 消息
    let lastAssistantIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }

    if (lastAssistantIndex === -1) {
      logger.warn('[ChatStore] 没有可重新生成的消息');
      return;
    }

    // 找到对应的用户消息
    let userMessageIndex = lastAssistantIndex - 1;
    while (userMessageIndex >= 0) {
      if (messages[userMessageIndex]?.role === 'user') break;
      userMessageIndex--;
    }

    if (userMessageIndex < 0) {
      logger.warn('[ChatStore] 未找到对应的用户消息');
      return;
    }

    const userMessage = messages[userMessageIndex];
    if (!userMessage) return;

    // 删除最后一条 AI 消息
    const newMessages = [...messages];
    newMessages.splice(lastAssistantIndex, 1);
    this.updateState({ messages: newMessages });

    if (!this.agent) return;

    // 使用原始消息内容（支持多模态）
    await this.executeAgentRun(userMessage.content);
  }

  /**
   * 重新加载指定的 AI 消息
   * 类似于 ant-design/x 的 onReload 功能
   * @param messageId 要重新加载的 AI 消息 ID
   * @returns 是否成功开始重新加载
   */
  async reloadMessage(messageId: string): Promise<boolean> {
    if (this.state.isLoading) {
      logger.warn('[ChatStore] 正在处理请求，无法重新加载');
      return false;
    }

    const messages = this.state.messages;
    const targetIndex = messages.findIndex((msg) => msg.id === messageId);

    if (targetIndex === -1) {
      logger.warn('[ChatStore] 未找到指定的消息:', messageId);
      return false;
    }

    const targetMessage = messages[targetIndex];
    if (!targetMessage || targetMessage.role !== 'assistant') {
      logger.warn('[ChatStore] 指定的消息不是 AI 消息:', messageId);
      return false;
    }

    // 找到该 AI 消息之前最近的用户消息
    let userMessageIndex = targetIndex - 1;
    while (userMessageIndex >= 0) {
      if (messages[userMessageIndex]?.role === 'user') break;
      userMessageIndex--;
    }

    if (userMessageIndex < 0) {
      logger.warn('[ChatStore] 未找到对应的用户消息');
      return false;
    }

    const userMessage = messages[userMessageIndex];
    if (!userMessage) return false;

    // 将目标 AI 消息标记为 loading 状态
    const newMessages = [...messages];
    if (newMessages[targetIndex]) {
      newMessages[targetIndex] = {
        ...newMessages[targetIndex],
        content: '',
        status: 'loading',
        updateAt: Date.now(),
      };
    }

    this.currentAssistantIndex = targetIndex;
    this.lastUserMessageContent = userMessage.content;

    this.updateState({
      messages: newMessages,
      isLoading: true,
    });

    if (!this.agent) {
      logger.warn('[ChatStore] 未配置 Agent');
      return false;
    }

    // 使用截止到用户消息的上下文
    const contextMessages = messages.slice(0, userMessageIndex + 1);
    const messageString = toStringContent(userMessage.content);

    await this.agent.run(
      {
        message: messageString,
        messages: contextMessages,
      },
      this.createAgentCallbacks(),
    );

    return true;
  }

  /**
   * 重试上一次请求
   * 使用保存的完整消息内容（支持多模态）
   * 当最后一条 AI 消息为错误或取消状态时允许重试
   */
  async retry(): Promise<void> {
    if (this.state.isLoading) {
      logger.warn('[ChatStore] 正在处理请求，无法重试');
      return;
    }

    const hasContent =
      typeof this.lastUserMessageContent === 'string'
        ? this.lastUserMessageContent !== ''
        : Array.isArray(this.lastUserMessageContent) &&
          this.lastUserMessageContent.length > 0;

    if (!hasContent) {
      logger.warn('[ChatStore] 没有可重试的消息');
      return;
    }

    // 找到最后一条 AI 消息
    const messages = this.state.messages;
    let lastAssistantIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }

    // 校验：必须有 AI 消息且状态为 error 或 cancelled 才允许重试
    if (lastAssistantIndex === -1) {
      logger.warn('[ChatStore] 没有 AI 消息可重试');
      return;
    }

    const lastAssistantMessage = messages[lastAssistantIndex];
    const retryableStatuses = ['error', 'cancelled'];
    if (
      !lastAssistantMessage ||
      !retryableStatuses.includes(lastAssistantMessage.status ?? '')
    ) {
      logger.warn('[ChatStore] 最后一条 AI 消息不是错误或取消状态，无需重试');
      return;
    }

    // 删除错误/取消状态的 AI 消息
    const newMessages = [...messages];
    newMessages.splice(lastAssistantIndex, 1);
    this.updateState({ messages: newMessages });

    await this.executeAgentRun(this.lastUserMessageContent);
  }

  // ==========================================================================
  // 快照和序列化
  // ==========================================================================

  /**
   * 创建消息快照
   */
  snapshot(): ChatMessage[] {
    return this.state.messages.map((msg) => ({ ...msg }));
  }

  /**
   * 从快照恢复消息
   */
  restore(messages: ChatMessage[]): void {
    this.currentAssistantIndex = -1;
    this.updateState({ messages: [...messages] });
  }

  /**
   * 序列化为 JSON
   */
  toJSON(): ChatStoreJSON {
    return {
      messages: this.snapshot(),
      isLoading: this.state.isLoading,
    };
  }

  /**
   * 从 JSON 恢复
   */
  fromJSON(data: { messages: ChatMessage[] }): void {
    this.restore(data.messages);
  }

  // ==========================================================================
  // 持久化
  // ==========================================================================

  /**
   * 从存储加载消息
   */
  async loadMessages(): Promise<boolean> {
    if (!this.options.storage || !this.options.storageKey) {
      logger.warn('[ChatStore] 未配置存储适配器或存储键');
      return false;
    }

    try {
      const messages = await this.options.storage.load(this.options.storageKey);
      if (messages && messages.length > 0) {
        this.restore(messages);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('[ChatStore] 加载消息失败:', error);
      return false;
    }
  }

  /**
   * 保存消息到存储
   */
  async saveMessages(): Promise<boolean> {
    if (!this.options.storage || !this.options.storageKey) {
      logger.warn('[ChatStore] 未配置存储适配器或存储键');
      return false;
    }

    try {
      await this.options.storage.save(
        this.options.storageKey,
        this.state.messages,
      );
      return true;
    } catch (error) {
      logger.error('[ChatStore] 保存消息失败:', error);
      return false;
    }
  }

  /**
   * 清除存储的消息
   */
  async clearStorage(): Promise<boolean> {
    if (!this.options.storage || !this.options.storageKey) {
      logger.warn('[ChatStore] 未配置存储适配器或存储键');
      return false;
    }

    try {
      await this.options.storage.clear(this.options.storageKey);
      return true;
    } catch (error) {
      logger.error('[ChatStore] 清除存储失败:', error);
      return false;
    }
  }

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  /**
   * 设置 Agent
   */
  setAgent(agent: ChatStoreAgent | null): void {
    this.agent = agent;
  }

  /**
   * 获取最大消息数配置
   */
  getMaxMessages(): number | undefined {
    return this.options.maxMessages;
  }

  /**
   * 设置最大消息数
   */
  setMaxMessages(max: number | undefined): void {
    this.options.maxMessages = max;
    if (max !== undefined) {
      const newMessages = this.applyMaxMessages(this.state.messages);
      if (newMessages.length !== this.state.messages.length) {
        this.updateState({ messages: newMessages });
      }
    }
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  /**
   * 应用消息数量限制
   */
  private applyMaxMessages(messages: ChatMessage[]): ChatMessage[] {
    const { maxMessages, overflow = 'remove-oldest' } = this.options;

    if (maxMessages === undefined || messages.length <= maxMessages) {
      return messages;
    }

    if (overflow === 'prevent-add') {
      // 阻止添加策略：返回原消息（不含新增的）
      return messages.slice(0, maxMessages);
    }

    // 移除最旧策略：移除开头的消息
    return messages.slice(messages.length - maxMessages);
  }

  /**
   * 覆盖父类的通知方法，添加 onMessagesChange 事件回调
   */
  protected override notifyListeners(): void {
    super.notifyListeners();
    this.events.onMessagesChange?.(this.state.messages);
  }

  /**
   * 节流更新状态（用于流式更新）
   * 检查当前助手消息是否已被取消/出错，避免覆盖终态
   */
  private updateStateThrottled(partial: Partial<ChatStoreState>): void {
    // 检查当前助手消息是否已经是终态，如果是则不更新
    const index = this.currentAssistantIndex;
    if (index >= 0 && partial.messages) {
      const currentMessage = this.state.messages[index];
      if (
        currentMessage &&
        (currentMessage.status === 'cancelled' ||
          currentMessage.status === 'error' ||
          currentMessage.status === 'success')
      ) {
        // 已是终态，忽略节流更新
        return;
      }
    }

    // 静默更新内部状态（不触发通知），由节流逻辑控制通知时机
    this.setStateSilent({ ...this.state, ...partial });

    if (!this.throttleTimer) {
      this.notifyListeners();
      this.pendingNotify = false;
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        if (this.pendingNotify) {
          this.notifyListeners();
          this.pendingNotify = false;
        }
      }, this.throttleInterval);
    } else {
      this.pendingNotify = true;
    }
  }

  /**
   * 销毁实例
   */
  override destroy(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingNotify = false;
    super.destroy();
  }
}

/**
 * 创建 ChatStore 实例
 */
export function createChatStore(
  options?: ChatStoreOptions,
  events?: ChatStoreEvents,
): ChatStore {
  return new ChatStore(options, events);
}
