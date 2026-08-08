import {
  provide,
  inject,
  computed,
  shallowReactive,
  type InjectionKey,
  type ComputedRef,
} from 'vue';
import type { ThinkingVariant } from '../components/Thinking.vue';
import type { RoleConfig, BlockRenderers, QuoteConfig, OutlineOptions } from '../types';
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
  /**
   * 末尾静默呼吸全局开关（opt-in；组件 props.tailBreathing 覆盖）。
   * 流式输出停顿时末块文字明暗呼吸，提示「仍在生成」。默认关闭。
   */
  tailBreathing?: boolean | { idleMs?: number };
  /**
   * 对话大纲导航全局开关（opt-in；组件 props.outline 覆盖）。
   * 右侧提问刻度条 + 点击定位。默认关闭。
   */
  outline?: boolean | OutlineOptions;
  /**
   * 深度思考计时精度（保留小数位数），默认 2。
   * 设为 0 表示整数秒，1 表示保留 1 位小数（如 3.5秒），2 表示保留 2 位（如 3.58秒）。
   */
  timePrecision?: number;
  /**
   * 深度思考（reasoning 块）折叠面板的外观形态，默认 `'card'`。
   *
   * 走配置注入而非 props：ReasoningBlock 由块渲染器注册表实例化，AiChat 无法直接给它传 prop
   * （注册表统一只透传 block/info/typing 等固定契约）。AiChat 的 `reasoningVariant` prop
   * 最终落到这里。
   */
  reasoningVariant?: ThinkingVariant;
}

const DEFAULT_CONFIG: AiChatConfig = { enableTyping: true, timePrecision: 2 };

export const AI_CHAT_CONFIG_KEY: InjectionKey<AiChatConfig> = Symbol('aix-ai-chat-config');

export function provideAiChatConfig(config: Partial<AiChatConfig>): AiChatConfig {
  // 必须是 shallowReactive 而非 reactive：深层代理会把配置里的**组件对象**一并包成
  // reactive 代理（blockRenderers / toolRenderers 的值、roles[*].blockRenderers、
  // quote.toolbar / quote.sheet 都是 Component），随后 `<component :is="...">` 拿到的
  // 是代理而非原组件 —— Vue 会在每次建 vnode 时告警「Vue received a Component that was
  // made a reactive object」并 toRaw 兜底（渲染结果正确，但控制台刷屏 + 无谓开销）。
  // 逐个 markRaw 覆盖不全（roles 可为运行时返回配置的函数），从根上用浅层代理才干净。
  // 语义上也更贴切：本配置是一袋整体替换的选项，不存在"就地深改某一项"的用法。
  // 显式标注返回类型：避免 shallowReactive() 推断出的类型在 dts bundle 时
  // 因引用 @vue/shared 内部类型而不可具名（TS2742）
  const merged = shallowReactive<AiChatConfig>({ ...DEFAULT_CONFIG, ...config });
  provide(AI_CHAT_CONFIG_KEY, merged);
  return merged;
}

export function useAiChatConfig(): ComputedRef<AiChatConfig> {
  const ctx = inject(AI_CHAT_CONFIG_KEY, null);
  return computed(() => ctx ?? DEFAULT_CONFIG);
}
