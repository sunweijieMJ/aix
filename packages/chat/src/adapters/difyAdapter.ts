/**
 * @fileoverview Dify API 适配器
 * 将 Dify 的流式响应适配到 useXAgent
 */

import type {
  AgentRequest,
  AgentCallbacks,
  AgentRequestInfo,
  ChatMessage,
} from '@aix/chat-sdk';
import { fetchEventSource } from '@microsoft/fetch-event-source';

/**
 * Dify API 配置
 */
export interface DifyConfig {
  /** Dify API 端点 */
  baseURL: string;
  /** API Key (Bearer token) */
  apiKey: string;
  /** 用户标识 */
  user?: string;
  /** 默认输入参数 */
  defaultInputs?: Record<string, string>;
}

/**
 * Dify 消息参数
 */
export interface DifyMessageParams {
  /** 输入参数 */
  inputs?: Record<string, string>;
  /** 用户查询 */
  query: string;
  /** 响应模式 (streaming/blocking) */
  response_mode?: 'streaming' | 'blocking';
  /** 会话 ID */
  conversation_id?: string;
  /** 用户标识 */
  user: string;
}

/**
 * Dify SSE 事件类型
 */
interface DifySSEEvent {
  event:
    | 'message'
    | 'message_end'
    | 'workflow_started'
    | 'workflow_finished'
    | 'node_started'
    | 'node_finished'
    | 'agent_log'
    | 'error'
    | 'ping';
  message_id?: string;
  conversation_id?: string;
  answer?: string; // 流式消息的增量内容
  metadata?: {
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
  error?: string;
}

/**
 * 创建 Dify Agent 请求函数
 *
 * @example
 * ```typescript
 * const difyRequest = createDifyAgent({
 *   baseURL: 'http://dify-new.zhihuishu.com',
 *   apiKey: 'app-oDYBzF9kKekLJC9YfbaaIt0e',
 *   user: 'test_user_003'
 * });
 *
 * const agent = useXAgent({ request: difyRequest });
 * ```
 */
export function createDifyAgent(config: DifyConfig): AgentRequest {
  const { baseURL, apiKey, user = 'default_user', defaultInputs = {} } = config;

  return async (info: AgentRequestInfo, callbacks: AgentCallbacks) => {
    const { message, messages } = info;

    // 查找会话 ID（从最后一条 AI 消息的 meta 中获取）
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant');
    const conversationId =
      (lastAssistantMessage?.meta?.conversation_id as string | undefined) || '';

    // 构建请求参数
    const params: DifyMessageParams = {
      inputs: {
        user_information: '',
        ...defaultInputs,
      },
      query: message,
      response_mode: 'streaming',
      conversation_id: conversationId,
      user,
    };

    let fullAnswer = '';
    let hasEnded = false;

    try {
      await fetchEventSource(`${baseURL}/v1/chat-messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),

        async onopen(response) {
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Dify API 错误: ${response.status} - ${errorText}`);
          }
        },

        onmessage(event) {
          try {
            // 跳过空数据
            if (!event.data || event.data.trim() === '') {
              return;
            }

            // Dify 返回 [DONE] 表示结束
            if (event.data === '[DONE]') {
              hasEnded = true;
              callbacks.onSuccess?.(fullAnswer);
              return;
            }

            // 解析 JSON 数据
            const data = JSON.parse(event.data) as DifySSEEvent;

            // 处理不同类型的事件
            switch (data.event) {
              case 'message':
                // 流式消息事件，累积答案
                if (data.answer) {
                  fullAnswer += data.answer;
                  callbacks.onUpdate?.(fullAnswer);
                }
                break;

              case 'workflow_finished':
              case 'message_end':
                // 工作流结束或消息结束事件，只调用一次 onSuccess
                if (!hasEnded) {
                  hasEnded = true;
                  callbacks.onSuccess?.(fullAnswer);
                }
                break;

              case 'error':
                hasEnded = true;
                throw new Error(data.error || '未知错误');

              case 'workflow_started':
              case 'node_started':
              case 'node_finished':
              case 'agent_log':
              case 'ping':
                // 忽略这些事件
                break;

              default:
                break;
            }
          } catch (err) {
            console.error('[Dify] 消息处理错误:', err);
          }
        },

        onerror(err) {
          hasEnded = true;
          callbacks.onError?.(err as Error);
          throw err;
        },

        onclose() {
          // 如果连接关闭但未收到结束事件，且有累积的答案，手动调用 onSuccess
          if (!hasEnded && fullAnswer) {
            hasEnded = true;
            callbacks.onSuccess?.(fullAnswer);
          }
        },

        openWhenHidden: true,
      });
    } catch (error) {
      callbacks.onError?.(error as Error);
    }
  };
}

/**
 * Dify API 工具函数
 */
export const DifyUtils = {
  /**
   * 从消息中提取会话 ID
   */
  getConversationId(messages: ChatMessage[]): string {
    const lastAssistant = [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant');
    return (lastAssistant?.meta?.conversation_id as string | undefined) || '';
  },

  /**
   * 创建带会话 ID 的消息元数据
   */
  createMessageMeta(conversationId: string) {
    return {
      conversation_id: conversationId,
      source: 'dify',
      timestamp: Date.now(),
    };
  },
};
