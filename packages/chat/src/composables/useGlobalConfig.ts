/**
 * @fileoverview useGlobalConfig - 获取全局 UI 配置
 * @description 用于获取 XProvider 提供的全局配置
 */

import { inject, computed, type ComputedRef } from 'vue';
import {
  X_PROVIDER_KEY,
  type XProviderConfig,
  type XComponentsConfig,
  type XBubbleConfig,
  type XSenderConfig,
  type XConversationsConfig,
} from '../components/XProvider/types';

/**
 * 获取全局配置
 *
 * @example
 * ```ts
 * const config = useGlobalConfig();
 * console.log(config?.locale);
 * ```
 */
export function useGlobalConfig(): XProviderConfig | undefined {
  return inject(X_PROVIDER_KEY);
}

/**
 * 组件配置类型映射
 */
type ComponentConfigMap = {
  bubble: XBubbleConfig;
  sender: XSenderConfig;
  conversations: XConversationsConfig;
};

/**
 * 获取特定组件的全局配置
 *
 * @param component 组件名称
 * @returns 组件配置（响应式）
 *
 * @example
 * ```ts
 * const bubbleConfig = useComponentConfig('bubble');
 * // bubbleConfig.value = { variant: 'filled', enableMarkdown: true }
 * ```
 */
export function useComponentConfig<K extends keyof XComponentsConfig>(
  component: K,
): ComputedRef<ComponentConfigMap[K] | undefined> {
  const config = useGlobalConfig();

  return computed(() => {
    return config?.components?.[component] as ComponentConfigMap[K] | undefined;
  });
}

/**
 * 合并组件 props 和全局配置
 *
 * @param component 组件名称
 * @param localProps 组件本地 props
 * @returns 合并后的配置（本地优先）
 *
 * @example
 * ```ts
 * const mergedConfig = useMergedConfig('bubble', props);
 * ```
 */
export function useMergedConfig<
  K extends keyof XComponentsConfig,
  P extends Partial<ComponentConfigMap[K]>,
>(
  component: K,
  localProps: P,
): ComputedRef<P & Partial<ComponentConfigMap[K]>> {
  const globalConfig = useComponentConfig(component);

  return computed(() => {
    const global = globalConfig.value || {};
    // 本地 props 优先级高于全局配置
    return {
      ...global,
      ...localProps,
    } as P & Partial<ComponentConfigMap[K]>;
  });
}
