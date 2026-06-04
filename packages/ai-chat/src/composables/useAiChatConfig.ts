import { provide, inject, computed, reactive, type InjectionKey, type ComputedRef } from 'vue';
import type { ShouldFollow } from './useAutoScroll';
import type { RoleConfig, BlockRenderers } from '../types';

export interface AiChatConfig {
  /** 全局打字机开关，默认 true：开启后流式更新中的 AI 气泡逐字显示（由 AiChat 透传给 BubbleList） */
  enableTyping: boolean;
  /** 角色默认样式映射，被 AiChat 合并进 BubbleList 的 roles */
  roles?: Record<string, RoleConfig>;
  /** 默认跟随策略覆盖 */
  shouldFollow?: ShouldFollow;
  /** 全局块渲染器注册表，被 AiChat 合并后透传给 BubbleList（组件 props.blockRenderers 优先） */
  blockRenderers?: BlockRenderers;
}

const DEFAULT_CONFIG: AiChatConfig = { enableTyping: true };

export const AI_CHAT_CONFIG_KEY: InjectionKey<AiChatConfig> = Symbol('aix-ai-chat-config');

export function provideAiChatConfig(config: Partial<AiChatConfig>) {
  const merged = reactive<AiChatConfig>({ ...DEFAULT_CONFIG, ...config });
  provide(AI_CHAT_CONFIG_KEY, merged);
  return merged;
}

export function useAiChatConfig(): ComputedRef<AiChatConfig> {
  const ctx = inject(AI_CHAT_CONFIG_KEY, null);
  return computed(() => ctx ?? DEFAULT_CONFIG);
}
