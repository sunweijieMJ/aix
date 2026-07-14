import { provide, inject, computed, reactive, type InjectionKey, type ComputedRef } from 'vue';
import type { RoleConfig, BlockRenderers, QuoteConfig } from '../types';
import type { MarkdownRenderers } from '../utils/markdownWalker';
import type { ShouldFollow } from './useAutoScroll';
import type { MarkdownItPlugin } from './useMarkdownRenderer';

export interface AiChatConfig {
  /** 全局打字机开关，默认 true：开启后流式更新中的 AI 气泡逐字显示（由 AiChat 透传给 BubbleList） */
  enableTyping: boolean;
  /** 角色默认样式映射，被 AiChat 合并进 BubbleList 的 roles */
  roles?: Record<string, RoleConfig>;
  /** 默认跟随策略覆盖 */
  shouldFollow?: ShouldFollow;
  /** 全局块渲染器注册表，被 AiChat 合并后透传给 BubbleList（组件 props.blockRenderers 优先） */
  blockRenderers?: BlockRenderers;
  /** 全局工具调用（tool_use）渲染器注册表，被 AiChat 合并后透传给 BubbleList（组件 props.toolRenderers 优先） */
  toolRenderers?: BlockRenderers;
  /** 全局 markdown token 渲染器注册表，经 AiChat 注入到气泡内 MarkdownRenderer（组件 props 优先） */
  markdownRenderers?: MarkdownRenderers;
  /** 是否允许渲染原始 HTML（经 sandbox iframe 隔离渲染：allow-scripts，无 allow-same-origin），默认 false；经 AiChat 注入到 MarkdownRenderer */
  allowHtml?: boolean;
  /** 注入的 markdown-it 插件（扩展新语法，如脚注/容器）；经 AiChat 注入到气泡内 MarkdownRenderer */
  mdPlugins?: MarkdownItPlugin[];
  /** 划词引用/追问统一配置（opt-in；组件 props.quote 覆盖），undefined 视为关闭 */
  quote?: QuoteConfig;
}

const DEFAULT_CONFIG: AiChatConfig = { enableTyping: true };

export const AI_CHAT_CONFIG_KEY: InjectionKey<AiChatConfig> = Symbol('aix-ai-chat-config');

export function provideAiChatConfig(config: Partial<AiChatConfig>): AiChatConfig {
  // 显式标注返回类型：避免 reactive() 推断出的 UnwrapNestedRefs 类型在 dts bundle 时
  // 因引用 @vue/shared 内部类型而不可具名（TS2742）
  const merged = reactive<AiChatConfig>({ ...DEFAULT_CONFIG, ...config });
  provide(AI_CHAT_CONFIG_KEY, merged);
  return merged;
}

export function useAiChatConfig(): ComputedRef<AiChatConfig> {
  const ctx = inject(AI_CHAT_CONFIG_KEY, null);
  return computed(() => ctx ?? DEFAULT_CONFIG);
}
