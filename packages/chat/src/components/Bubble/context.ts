/**
 * @fileoverview Bubble 组件上下文
 * @description 提供 Bubble 组件树共享的配置，避免 props drilling
 */

import {
  provide,
  inject,
  computed,
  type InjectionKey,
  type Ref,
  type ComputedRef,
  type VNode,
} from 'vue';
import type { BubbleShape } from './types';

/**
 * Bubble 上下文值
 */
export interface BubbleContextValue {
  /** 样式变体 */
  variant: Ref<'outlined' | 'filled' | 'borderless' | 'shadow'>;
  /** 气泡形状 */
  shape: Ref<BubbleShape>;
  /** 是否启用 Markdown 渲染 */
  enableMarkdown: Ref<boolean>;
  /** 自定义消息渲染函数 */
  messageRender?: (content: string) => VNode | string;
  /** 时间格式化函数 */
  formatTime: (timestamp: number) => string;
}

/**
 * Bubble 上下文注入 Key
 */
export const BubbleContextKey: InjectionKey<BubbleContextValue> =
  Symbol('BubbleContext');

/**
 * 默认时间格式化函数
 */
const defaultFormatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * 创建 Bubble 上下文选项
 */
export interface CreateBubbleContextOptions {
  /** 样式变体 */
  variant?:
    | Ref<'outlined' | 'filled' | 'borderless' | 'shadow'>
    | 'outlined'
    | 'filled'
    | 'borderless'
    | 'shadow';
  /** 气泡形状 */
  shape?: Ref<BubbleShape> | BubbleShape;
  /** 是否启用 Markdown */
  enableMarkdown?: Ref<boolean> | boolean;
  /** 自定义渲染函数 */
  messageRender?: (content: string) => VNode | string;
  /** 时间格式化函数 */
  formatTime?: (timestamp: number) => string;
}

/**
 * 提供 Bubble 上下文
 *
 * @example
 * ```ts
 * // 在 BubbleList 中提供上下文
 * provideBubbleContext({
 *   variant: toRef(props, 'variant'),
 *   enableMarkdown: toRef(props, 'enableMarkdown'),
 * });
 * ```
 */
export function provideBubbleContext(
  options: CreateBubbleContextOptions = {},
): void {
  const {
    variant = 'filled',
    shape = 'default',
    enableMarkdown = false,
    messageRender,
    formatTime = defaultFormatTime,
  } = options;

  // 将值转换为 Ref（如果还不是）
  const variantRef =
    typeof variant === 'string' ? computed(() => variant) : variant;

  const shapeRef = typeof shape === 'string' ? computed(() => shape) : shape;

  const enableMarkdownRef =
    typeof enableMarkdown === 'boolean'
      ? computed(() => enableMarkdown)
      : enableMarkdown;

  const context: BubbleContextValue = {
    variant: variantRef as Ref<'outlined' | 'filled' | 'borderless' | 'shadow'>,
    shape: shapeRef as Ref<BubbleShape>,
    enableMarkdown: enableMarkdownRef as Ref<boolean>,
    messageRender,
    formatTime,
  };

  provide(BubbleContextKey, context);
}

/**
 * 使用 Bubble 上下文
 *
 * @returns Bubble 上下文（如果在 BubbleList 内），否则返回 undefined
 *
 * @example
 * ```ts
 * // 在子组件中消费上下文
 * const context = useBubbleContext();
 * const enableMarkdown = computed(() => context?.enableMarkdown.value ?? props.enableMarkdown);
 * ```
 */
export function useBubbleContext(): BubbleContextValue | undefined {
  return inject(BubbleContextKey, undefined);
}

/**
 * 获取带默认值的配置
 *
 * @param context Bubble 上下文
 * @param propValue 组件 prop 值
 * @param defaultValue 默认值
 * @returns 最终值（prop > context > default）
 */
export function getConfigValue<T>(
  context: BubbleContextValue | undefined,
  propValue: T | undefined,
  contextKey: keyof BubbleContextValue,
  defaultValue: T,
): ComputedRef<T> {
  return computed(() => {
    // prop 优先
    if (propValue !== undefined) {
      return propValue;
    }
    // 其次是上下文
    const contextValue = context?.[contextKey];
    if (contextValue !== undefined) {
      // 如果是 Ref，取 value
      if (
        contextValue &&
        typeof contextValue === 'object' &&
        'value' in contextValue
      ) {
        return (contextValue as Ref<T>).value;
      }
      return contextValue as T;
    }
    // 最后是默认值
    return defaultValue;
  });
}
