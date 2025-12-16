<template>
  <div class="aix-chat-provider">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview ChatProvider - 聊天上下文提供者
 * 使用 Provide/Inject 模式，复用 SDK 的 ChatStoreManager 管理会话
 */

import {
  toOpenAIMessages,
  chatStoreManager,
  RetryEngine,
  type RetryEngineConfig,
  type AgentRequest,
  type AgentRequestInfo,
  type AgentCallbacks,
} from '@aix/chat-sdk';
import { provide, ref, computed, onScopeDispose } from 'vue';
import { useXChat, useXAgent } from '../../composables';
import type {
  UseXChatReturn,
  AgentRequestParams,
  AgentStreamCallbacks,
} from '../../types';
import type {
  ChatProviderProps,
  ChatProviderContext,
  SessionConfig,
  UIConfig,
  RetryConfig,
} from './types';
import { CHAT_PROVIDER_KEY } from './types';

/**
 * 创建外部请求适配器：将外部 API 请求函数转换为内部 AgentRequest
 * 使用 SDK 的 toOpenAIMessages 支持多模态消息转换
 * 使用 SDK 的 RetryEngine 处理重试逻辑
 */
function createExternalRequestAdapter(
  externalRequest: (
    params: AgentRequestParams,
    callbacks?: AgentStreamCallbacks,
  ) => Promise<string | void>,
  retryConfig?: RetryConfig,
): AgentRequest {
  // 如果配置了重试，使用 SDK 的 RetryEngine
  let retryEngine: RetryEngine | null = null;
  if (retryConfig) {
    const engineConfig: RetryEngineConfig = {
      maxRetries: retryConfig.maxRetries ?? 3,
      initialDelay: retryConfig.initialDelay ?? 1000,
      maxDelay: retryConfig.maxDelay ?? 30000,
      backoffFactor: retryConfig.exponentialBackoff !== false ? 2 : 1,
      onRetry: retryConfig.onRetry
        ? (attempt, delay) => retryConfig.onRetry!(attempt, delay)
        : undefined,
    };
    retryEngine = new RetryEngine(engineConfig);
  }

  return async (
    info: AgentRequestInfo,
    callbacks: AgentCallbacks,
  ): Promise<void> => {
    const params: AgentRequestParams = {
      messages: toOpenAIMessages(info.messages),
      stream: true,
    };

    const doRequest = async () => {
      await externalRequest(params, {
        onUpdate: callbacks.onUpdate,
        onSuccess: callbacks.onSuccess,
        onError: callbacks.onError,
      });
    };

    // 如果有重试配置，使用 SDK 的 RetryEngine
    if (retryEngine) {
      try {
        await retryEngine.execute(doRequest);
      } catch (error) {
        callbacks.onError?.(error as Error);
      }
    } else {
      await doRequest();
    }
  };
}

const props = withDefaults(defineProps<ChatProviderProps>(), {
  uiConfig: () => ({
    showAvatar: true,
    showTimestamp: true,
    showActions: true,
    showToolCalls: true,
    showSuggestions: true,
    showWelcome: true,
    enableMarkdown: true,
    enableSpeech: false,
    enableFileUpload: true,
    autoScroll: true,
  }),
});

// ========== 状态管理 ==========

/** 会话 Vue 封装实例映射（用于响应式绑定） */
const sessionWrappers = new Map<string, UseXChatReturn>();

/** 会话版本号（用于强制触发 computed 重新计算） */
const sessionVersion = ref(0);

/** 当前活动会话ID */
const currentSessionId = ref('');

/** UI 配置 */
const uiConfig = ref<UIConfig>({ ...props.uiConfig });

// ========== 计算属性 ==========

/** 当前会话实例 */
const currentSession = computed(() => {
  void sessionVersion.value;
  return sessionWrappers.get(currentSessionId.value);
});

/** 当前消息列表 */
const messages = computed(() => currentSession.value?.messages || []);

/** 是否正在加载 */
const isLoading = computed(() => {
  return currentSession.value?.isLoading.value ?? false;
});

// ========== 会话管理 ==========

/**
 * 创建新会话
 * 使用 SDK 的 chatStoreManager 管理底层 ChatStore
 */
function createSession(config: SessionConfig) {
  const { id, request, retry } = config;

  // 如果会话已存在，先删除
  if (sessionWrappers.has(id)) {
    console.warn(`[ChatProvider] 会话 ${id} 已存在，将被覆盖`);
    // 从 SDK Manager 中删除
    chatStoreManager.delete(id);
    sessionWrappers.delete(id);
    sessionVersion.value++;
  }

  // 创建 Agent 实例（如果提供了 request）
  const externalRequest = request || props.defaultRequest;
  const retryConfig = retry || props.defaultRetry;
  const agent = externalRequest
    ? useXAgent({
        request: createExternalRequestAdapter(externalRequest, retryConfig),
      })
    : undefined;

  // 创建 Chat 实例，使用 shared 模式复用 SDK 的 chatStoreManager
  const chat = useXChat({
    conversationKey: id,
    shared: true, // 关键：使用 SDK 的 chatStoreManager 管理
    agent,
  });

  // 存储 Vue 封装实例
  sessionWrappers.set(id, chat);
  sessionVersion.value++;

  // 如果是第一个会话，设为活动会话
  if (!currentSessionId.value) {
    currentSessionId.value = id;
  }

  return chat;
}

/**
 * 切换会话
 */
function switchSession(sessionId: string): boolean {
  // 检查 SDK Manager 中是否存在该会话
  if (chatStoreManager.has(sessionId) || sessionWrappers.has(sessionId)) {
    currentSessionId.value = sessionId;
    return true;
  }
  console.warn(`[ChatProvider] 会话 ${sessionId} 不存在`);
  return false;
}

/**
 * 删除会话
 */
async function deleteSession(sessionId: string) {
  // 从 SDK Manager 中删除（会自动调用 store.destroy()）
  chatStoreManager.delete(sessionId);
  sessionWrappers.delete(sessionId);
  sessionVersion.value++;

  // 如果删除的是当前会话，切换到其他会话
  if (currentSessionId.value === sessionId) {
    const keys = chatStoreManager.keys();
    currentSessionId.value = keys[0] || '';
  }
}

/**
 * 获取会话实例
 */
function getSession(sessionId: string) {
  return sessionWrappers.get(sessionId);
}

/**
 * 获取会话信息列表（来自 SDK Manager）
 */
function getConversationInfos() {
  return chatStoreManager.getConversationInfos();
}

// ========== 消息操作 ==========

/**
 * 发送消息（当前会话）
 */
async function sendMessage(content: string) {
  if (!currentSession.value) {
    console.warn('[ChatProvider] 没有活动会话');
    return;
  }
  await currentSession.value.onRequest(content);
}

/**
 * 停止生成（当前会话）
 */
function stopGeneration() {
  currentSession.value?.stop();
}

/**
 * 清空消息（当前会话）
 */
function clearMessages() {
  currentSession.value?.clear();
}

/**
 * 重新生成（当前会话）
 */
async function regenerate() {
  if (currentSession.value) {
    await currentSession.value.regenerate();
  }
}

/**
 * 删除消息（当前会话）
 */
function deleteMessage(messageId: string) {
  currentSession.value?.deleteMessage(messageId);
}

/**
 * 添加消息（不触发 AI 响应）
 */
function addMessage(
  message: Omit<
    import('@aix/chat-sdk').ChatMessage,
    'id' | 'createAt' | 'updateAt'
  >,
) {
  return currentSession.value?.addMessage(message);
}

// ========== UI 配置 ==========

/**
 * 更新 UI 配置
 */
function updateUIConfig(config: Partial<UIConfig>) {
  uiConfig.value = { ...uiConfig.value, ...config };
}

// ========== 清理 ==========

onScopeDispose(() => {
  // 注意：shared 模式下，chatStoreManager 管理 Store 生命周期
  // Vue 封装实例会在各自的 onScopeDispose 中取消订阅
  sessionWrappers.clear();
});

// ========== 提供上下文 ==========

const context: ChatProviderContext = {
  // 状态
  currentSessionId,
  messages,
  isLoading,
  uiConfig,

  // 会话管理
  createSession,
  switchSession,
  deleteSession,
  getSession,

  // 消息操作
  sendMessage,
  stopGeneration,
  clearMessages,
  regenerate,
  deleteMessage,
  addMessage,

  // UI 配置
  updateUIConfig,
};

provide(CHAT_PROVIDER_KEY, context);

// ========== 初始化 ==========

// 如果提供了初始会话配置，创建会话
if (props.initialSession) {
  createSession(props.initialSession);
}

// ========== 暴露 ==========

defineExpose({
  ...context,
  sessionWrappers, // Vue 封装实例（用于调试）
  getConversationInfos, // 获取 SDK Manager 的会话信息
});
</script>

<style scoped lang="scss">
.aix-chat-provider {
  width: 100%;
  height: 100%;
}
</style>
