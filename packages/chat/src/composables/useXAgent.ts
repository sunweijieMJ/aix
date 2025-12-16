/**
 * @fileoverview useXAgent - AI 代理请求管理
 * 基于 @aix/chat-sdk AgentRunner 的 Vue 3 响应式封装
 */

import {
  createAgentRunner,
  type AgentRunnerState,
  type ToolCall,
  type AgentRequestInfo,
  type AgentCallbacks,
} from '@aix/chat-sdk';
import { ref, onScopeDispose } from 'vue';
import type { UseXAgentOptions, UseXAgentReturn } from '../types';

export function useXAgent(options: UseXAgentOptions): UseXAgentReturn {
  const { request, model = 'gpt-3.5-turbo', timeout = 60000 } = options;

  // 创建 SDK AgentRunner 实例
  const runner = createAgentRunner({
    request,
    model,
    timeout,
  });

  // Vue 响应式状态
  const loading = ref(false);
  const toolCalls = ref<ToolCall[]>([]);

  // 订阅 AgentRunner 状态变化，同步到 Vue 响应式状态
  const unsubscribe = runner.subscribe((state: AgentRunnerState) => {
    loading.value = state.loading;
    toolCalls.value = [...state.toolCalls] as ToolCall[];
  });

  /**
   * 执行 AI 请求（支持流式响应）
   */
  const run = async (info: AgentRequestInfo, callbacks: AgentCallbacks) => {
    await runner.run(info, callbacks);
  };

  /**
   * 停止当前请求
   */
  const stop = () => {
    runner.stop();
  };

  /**
   * 添加 Tool Call
   */
  const addToolCall = (toolCall: ToolCall) => {
    runner.addToolCall(toolCall);
  };

  /**
   * 更新 Tool Call
   */
  const updateToolCall = (id: string, updates: Partial<ToolCall>) => {
    runner.updateToolCall(id, updates);
  };

  /**
   * 清空 Tool Calls
   */
  const clearToolCalls = () => {
    runner.clearToolCalls();
  };

  // 清理订阅和销毁 Runner
  onScopeDispose(() => {
    unsubscribe();
    runner.destroy();
  });

  return {
    run,
    stop,
    loading,
    model,
    toolCalls,
    addToolCall,
    updateToolCall,
    clearToolCalls,
  };
}
