/**
 * @fileoverview RetryEngine - 框架无关的重试机制
 * 从 useRetry composable 提取的核心逻辑
 */

import { isRetryable } from '../utils/error-detection';
import { logger } from '../utils/logger';
import { Observable } from './Observable';

/**
 * RetryEngine 专用配置（扩展基础 RetryConfig）
 */
export interface RetryEngineConfig {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 初始延迟时间(毫秒) */
  initialDelay?: number;
  /** 最大延迟时间(毫秒) */
  maxDelay?: number;
  /** 退避因子(指数退避) */
  backoffFactor?: number;
  /** 是否使用指数退避 */
  exponentialBackoff?: boolean;
  /** 自定义重试条件判断 */
  shouldRetry?: (
    error: Error,
    retryCount: number,
    maxRetries: number,
  ) => boolean;
  /** 每次重试前的回调 */
  onRetry?: (retryCount: number, delay: number, error: Error) => void;
}

/** 硬限制：最大重试次数上限（防止配置错误导致无限重试） */
const HARD_MAX_RETRIES = 100;

/**
 * 重试状态
 */
export interface RetryState {
  /** 当前重试次数 */
  retryCount: number;
  /** 是否正在重试 */
  isRetrying: boolean;
  /** 下次重试延迟 */
  nextDelay: number;
}

/**
 * 默认重试条件
 */
const defaultShouldRetry = (
  error: Error,
  retryCount: number,
  maxRetries: number,
): boolean => {
  if (retryCount >= maxRetries) return false;
  return isRetryable(error);
};

/**
 * 计算延迟时间(指数退避)
 */
const calculateDelay = (
  retryCount: number,
  initialDelay: number,
  backoffFactor: number,
  maxDelay: number,
  exponentialBackoff: boolean,
): number => {
  if (!exponentialBackoff) {
    return initialDelay;
  }
  const delay = initialDelay * Math.pow(backoffFactor, retryCount);
  return Math.min(delay, maxDelay);
};

/**
 * RetryEngine - 重试机制核心类
 *
 * 继承自 Observable，提供状态订阅能力
 *
 * @example
 * ```ts
 * const retry = new RetryEngine({
 *   maxRetries: 3,
 *   exponentialBackoff: true,
 *   onRetry: (count, delay) => {
 *     console.log(`重试第 ${count} 次，延迟 ${delay}ms`);
 *   }
 * });
 *
 * const data = await retry.execute(async () => {
 *   return await fetch('/api/chat');
 * });
 *
 * // 订阅状态变化
 * retry.subscribe((state) => {
 *   console.log('Retry count:', state.retryCount);
 * });
 * ```
 */
export class RetryEngine extends Observable<RetryState> {
  private config: Required<RetryEngineConfig>;

  constructor(config: RetryEngineConfig = {}) {
    super({
      retryCount: 0,
      isRetrying: false,
      nextDelay: config.initialDelay ?? 1000,
    });

    this.config = {
      maxRetries: config.maxRetries ?? 3,
      initialDelay: config.initialDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      backoffFactor: config.backoffFactor ?? 2,
      exponentialBackoff: config.exponentialBackoff ?? true,
      shouldRetry: config.shouldRetry ?? defaultShouldRetry,
      onRetry: config.onRetry ?? (() => {}),
    };
  }

  /**
   * 执行带重试的异步函数
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.updateState({ retryCount: 0, isRetrying: false });

    // 使用硬限制防止配置错误导致无限重试
    const effectiveMaxRetries = Math.min(
      this.config.maxRetries,
      HARD_MAX_RETRIES,
    );

    while (true) {
      try {
        const result = await fn();

        // 成功，重置状态
        if (this.state.retryCount > 0) {
          logger.debug(
            `[RetryEngine] 重试成功，共重试 ${this.state.retryCount} 次`,
          );
        }
        this.updateState({ retryCount: 0, isRetrying: false });
        return result;
      } catch (error) {
        const err = error as Error;

        // 检查是否应该重试（使用 effectiveMaxRetries）
        if (
          !this.config.shouldRetry(
            err,
            this.state.retryCount,
            effectiveMaxRetries,
          )
        ) {
          logger.warn(
            '[RetryEngine] 达到最大重试次数或不满足重试条件，停止重试',
          );
          this.updateState({ isRetrying: false });
          throw err;
        }

        // 额外检查硬限制
        if (this.state.retryCount >= HARD_MAX_RETRIES) {
          logger.error('[RetryEngine] 达到硬限制上限，强制停止重试');
          this.updateState({ isRetrying: false });
          throw err;
        }

        // 计算延迟时间
        const delayTime = calculateDelay(
          this.state.retryCount,
          this.config.initialDelay,
          this.config.backoffFactor,
          this.config.maxDelay,
          this.config.exponentialBackoff,
        );

        this.updateState({
          nextDelay: delayTime,
          retryCount: this.state.retryCount + 1,
          isRetrying: true,
        });

        logger.debug(
          `[RetryEngine] 请求失败，准备重试第 ${this.state.retryCount} 次，延迟 ${delayTime}ms`,
          err.message,
        );

        // 调用重试回调
        this.config.onRetry(this.state.retryCount, delayTime, err);

        // 等待延迟后重试
        await this.delay(delayTime);
      }
    }
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.updateState({
      retryCount: 0,
      isRetrying: false,
      nextDelay: this.config.initialDelay,
    });
  }

  /**
   * 销毁实例，清理所有资源
   */
  override destroy(): void {
    this.reset();
    super.destroy();
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 创建 RetryEngine 实例
 */
export function createRetryEngine(config?: RetryEngineConfig): RetryEngine {
  return new RetryEngine(config);
}

/**
 * 快捷方法：带重试的 fetch
 */
export async function retryFetch<T = unknown>(
  url: string,
  options?: RequestInit,
  retryConfig?: RetryEngineConfig,
): Promise<T> {
  const engine = createRetryEngine(retryConfig);

  return engine.execute(async () => {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  });
}
