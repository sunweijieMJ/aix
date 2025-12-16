/**
 * @fileoverview AgentRunner - 框架无关的 AI 代理运行器
 * 从 useXAgent composable 提取的核心逻辑
 */

import type {
  ToolCall,
  AgentRequestInfo,
  AgentCallbacks,
  AgentConfig,
} from '../types';
import { Observable } from './Observable';

/**
 * AgentRunner 内部状态
 */
export interface AgentRunnerState {
  /** 是否正在加载 */
  loading: boolean;
  /** Tool Calls 列表 */
  toolCalls: ToolCall[];
}

/**
 * AgentRunner - AI 代理运行器
 *
 * 继承自 Observable，提供状态订阅能力
 *
 * @example
 * ```ts
 * const agent = new AgentRunner({
 *   request: async (info, callbacks) => {
 *     // 实现 AI 请求逻辑
 *     callbacks.onUpdate?.('Hello');
 *     callbacks.onSuccess?.('Hello World');
 *   },
 *   model: 'gpt-4',
 *   timeout: 60000,
 * });
 *
 * await agent.run(
 *   { message: 'Hi', messages: [] },
 *   {
 *     onUpdate: (chunk) => console.log(chunk),
 *     onSuccess: (content) => console.log('Done:', content),
 *     onError: (error) => console.error(error),
 *   }
 * );
 *
 * // 订阅状态变化
 * agent.subscribe((state) => {
 *   console.log('Loading:', state.loading);
 *   console.log('Tool Calls:', state.toolCalls);
 * });
 * ```
 */
export class AgentRunner extends Observable<AgentRunnerState> {
  private config: Required<AgentConfig>;
  private abortController: AbortController | null = null;
  /** 超时定时器 */
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(config: AgentConfig) {
    super({
      loading: false,
      toolCalls: [],
    });

    this.config = {
      request: config.request,
      model: config.model ?? 'gpt-3.5-turbo',
      timeout: config.timeout ?? 60000,
    };
  }

  /**
   * 获取模型名称
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * 检查是否正在加载
   */
  getLoading(): boolean {
    return this.state.loading;
  }

  /**
   * 清理超时定时器
   */
  private clearTimeoutTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * 重置运行状态
   */
  private resetRunState(): void {
    this.clearTimeoutTimer();
    this.updateState({ loading: false });
    this.abortController = null;
  }

  /**
   * 执行 AI 请求
   */
  async run(info: AgentRequestInfo, callbacks: AgentCallbacks): Promise<void> {
    // 清理之前的定时器（如果有）
    this.clearTimeoutTimer();

    // 清空之前的 Tool Calls
    this.updateState({ loading: true, toolCalls: [] });
    this.abortController = new AbortController();

    // 创建包装后的回调，确保在完成时重置状态，并自动管理 Tool Calls
    const wrappedCallbacks: AgentCallbacks = {
      onUpdate: callbacks.onUpdate,
      onSuccess: (content: string) => {
        this.clearTimeoutTimer();
        callbacks.onSuccess?.(content);
        this.updateState({ loading: false });
        this.abortController = null;
      },
      onError: (error: Error) => {
        this.clearTimeoutTimer();
        callbacks.onError?.(error);
        this.updateState({ loading: false });
        this.abortController = null;
      },
      // Tool Call 自动管理
      onToolCallStart: (toolCall) => {
        this.addToolCall(toolCall);
        callbacks.onToolCallStart?.(toolCall);
      },
      onToolCallUpdate: (id, updates) => {
        this.updateToolCall(id, updates);
        callbacks.onToolCallUpdate?.(id, updates);
      },
      onToolCallEnd: (id, result) => {
        this.updateToolCall(id, {
          status: 'success',
          result,
          endTime: Date.now(),
        });
        callbacks.onToolCallEnd?.(id, result);
      },
      onToolCallError: (id, error) => {
        this.updateToolCall(id, {
          status: 'error',
          error,
          endTime: Date.now(),
        });
        callbacks.onToolCallError?.(id, error);
      },
    };

    try {
      // 设置超时处理
      if (this.config.timeout > 0) {
        this.timeoutId = setTimeout(() => {
          if (this.state.loading) {
            this.abortController?.abort();
            const error = new Error(
              `Request timeout after ${this.config.timeout}ms`,
            );
            error.name = 'TimeoutError';
            wrappedCallbacks.onError?.(error);
          }
        }, this.config.timeout);
      }

      // 执行请求
      await this.config.request(info, wrappedCallbacks);

      // 如果请求完成但没有调用 onSuccess/onError，确保清除状态
      if (this.state.loading) {
        this.resetRunState();
      }
    } catch (error) {
      this.clearTimeoutTimer();
      wrappedCallbacks.onError?.(error as Error);
    }
  }

  /**
   * 停止当前请求
   */
  stop(): void {
    this.clearTimeoutTimer();
    this.abortController?.abort();
    this.updateState({ loading: false });
    this.abortController = null;
  }

  /**
   * 销毁实例，清理所有资源
   */
  override destroy(): void {
    // 停止当前请求
    if (this.state.loading) {
      this.stop();
    }

    // 清理定时器
    this.clearTimeoutTimer();

    // 清空 Tool Calls
    this.updateState({ toolCalls: [] });

    // 清除 AbortController
    this.abortController = null;

    // 调用父类销毁
    super.destroy();
  }

  /**
   * 添加 Tool Call
   */
  addToolCall(toolCall: ToolCall): void {
    this.updateState({
      toolCalls: [...this.state.toolCalls, toolCall],
    });
  }

  /**
   * 更新 Tool Call
   */
  updateToolCall(id: string, updates: Partial<ToolCall>): boolean {
    const toolCalls = [...this.state.toolCalls];
    const index = toolCalls.findIndex((tc) => tc.id === id);
    if (index !== -1) {
      const existingToolCall = toolCalls[index];
      if (existingToolCall) {
        toolCalls[index] = { ...existingToolCall, ...updates };
        this.updateState({ toolCalls });
        return true;
      }
    }
    return false;
  }

  /**
   * 获取 Tool Calls
   */
  getToolCalls(): ToolCall[] {
    return [...this.state.toolCalls];
  }

  /**
   * 清空 Tool Calls
   */
  clearToolCalls(): void {
    this.updateState({ toolCalls: [] });
  }
}

/**
 * 创建 AgentRunner 实例
 */
export function createAgentRunner(config: AgentConfig): AgentRunner {
  return new AgentRunner(config);
}
