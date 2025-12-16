/**
 * @fileoverview useRetry - 网络请求重试机制 (Vue 包装)
 * 基于 @aix/chat-sdk 的 RetryEngine 实现
 */

import {
  RetryEngine,
  retryFetch as sdkRetryFetch,
  type RetryEngineConfig,
  type RetryState as EngineRetryState,
} from '@aix/chat-sdk';
import { ref, type Ref } from 'vue';

/**
 * 重试配置 (复用 SDK 类型)
 */
export type RetryConfig = RetryEngineConfig;

/**
 * 重试状态 (Vue Ref 版本)
 */
export interface RetryState {
  /** 当前重试次数 */
  retryCount: Ref<number>;
  /** 是否正在重试 */
  isRetrying: Ref<boolean>;
  /** 下次重试延迟 */
  nextDelay: Ref<number>;
}

/**
 * 重试结果
 */
export interface RetryResult<T> extends RetryState {
  /** 执行带重试的异步函数 */
  execute: (fn: () => Promise<T>) => Promise<T>;
  /** 重置重试状态 */
  reset: () => void;
}

/**
 * useRetry - 重试机制 Composable
 *
 * 基于 @aix/chat-sdk 的 RetryEngine 实现，提供 Vue 响应式状态
 *
 * @example
 * ```ts
 * const { execute, retryCount, isRetrying } = useRetry({
 *   maxRetries: 3,
 *   exponentialBackoff: true,
 *   onRetry: (count, delay) => {
 *     console.log(`重试第 ${count} 次，延迟 ${delay}ms`);
 *   }
 * });
 *
 * try {
 *   const data = await execute(async () => {
 *     return await fetch('/api/chat');
 *   });
 * } catch (error) {
 *   console.error('请求失败:', error);
 * }
 * ```
 */
export function useRetry<T = unknown>(
  config: RetryConfig = {},
): RetryResult<T> {
  // 创建 RetryEngine 实例
  const engine = new RetryEngine(config);

  // Vue 响应式状态
  const retryCount = ref(0);
  const isRetrying = ref(false);
  const nextDelay = ref(config.initialDelay ?? 1000);

  // 订阅 RetryEngine 状态变化，同步到 Vue Ref
  engine.subscribe((state: EngineRetryState) => {
    retryCount.value = state.retryCount;
    isRetrying.value = state.isRetrying;
    nextDelay.value = state.nextDelay;
  });

  return {
    execute: <R>(fn: () => Promise<R>) => engine.execute(fn) as Promise<R>,
    reset: () => engine.reset(),
    retryCount,
    isRetrying,
    nextDelay,
  };
}

/**
 * 快捷方法: 带重试的 fetch
 *
 * @example
 * ```ts
 * const data = await retryFetch('/api/chat', {
 *   method: 'POST',
 *   body: JSON.stringify({ message: 'Hello' })
 * }, {
 *   maxRetries: 3,
 *   exponentialBackoff: true
 * });
 * ```
 */
export const retryFetch = sdkRetryFetch;
