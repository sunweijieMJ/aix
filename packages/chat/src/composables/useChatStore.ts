/**
 * @fileoverview useChatStore - 注入 ChatProvider 上下文
 * @description 用于在子组件中获取多会话聊天状态
 */

import { inject } from 'vue';
import type { ChatProviderContext } from '../components/ChatProvider/types';
import { CHAT_PROVIDER_KEY } from '../components/ChatProvider/types';

/**
 * 使用 ChatStore 上下文（必须在 ChatProvider 内使用）
 *
 * @throws 如果未在 ChatProvider 内使用
 *
 * @example
 * ```ts
 * const store = useChatStore();
 *
 * // 获取当前会话
 * const session = store.currentSession;
 *
 * // 发送消息
 * await store.sendMessage('Hello');
 *
 * // 切换会话
 * store.switchSession('session-id');
 * ```
 */
export function useChatStore(): ChatProviderContext {
  const context = inject(CHAT_PROVIDER_KEY);

  if (!context) {
    throw new Error('[useChatStore] 必须在 <ChatProvider> 组件内使用');
  }

  return context;
}

/**
 * 尝试使用 ChatStore 上下文
 *
 * @returns ChatStore 上下文或 undefined（如果不在 ChatProvider 内）
 *
 * @example
 * ```ts
 * const store = tryUseChatStore();
 * if (store) {
 *   // 在 ChatProvider 内
 *   await store.sendMessage('Hello');
 * }
 * ```
 */
export function tryUseChatStore(): ChatProviderContext | undefined {
  return inject(CHAT_PROVIDER_KEY);
}
