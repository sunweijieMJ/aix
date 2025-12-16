/**
 * @fileoverview ErrorBoundary 类型定义
 */

export interface ErrorBoundaryProps {
  /** 是否显示重试按钮 */
  showRetry?: boolean;
  /** 是否显示刷新页面按钮 */
  showReload?: boolean;
  /** 是否显示错误详情 */
  showDetails?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟(毫秒) */
  retryDelay?: number;
  /** 自定义错误消息 */
  errorMessage?: string;
  /** 错误回调 */
  onError?: (error: Error, retryCount: number) => void;
  /** 重置回调 */
  onReset?: () => void;
}

export interface ErrorBoundaryEmits {
  (e: 'error', error: Error): void;
  (e: 'reset'): void;
}
