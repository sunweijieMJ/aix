import { useLocale, type Locale } from '@aix/hooks';
import { inject, provide, toValue, type InjectionKey, type MaybeRefOrGetter } from 'vue';
import { locale } from '../locale';
import type { AiChatLocale } from '../locale';

/**
 * 实例级文案覆盖的注入 Key（值支持静态对象 / Ref / getter）
 * 命名带 locale 前缀是刻意的：本包里裸的 "messages" 指聊天消息列表（v-model:messages）
 */
export const AI_CHAT_LOCALE_MESSAGES_KEY: InjectionKey<
  MaybeRefOrGetter<Partial<AiChatLocale> | undefined>
> = Symbol('aix-ai-chat-locale-messages');

/**
 * 向组件树注入 ai-chat 的实例级文案覆盖
 *
 * <AiChat :locale-messages> 内部走的就是这条注入路径；业务单独使用 Sender / Bubble 等
 * 独立导出组件时，可在自己组件树的任意上层调用本函数达到同样效果。
 * 内层注入会整体遮蔽外层（不合并）；应用级统一定制请用 createLocale 的 messages。
 */
export function provideAiChatLocaleMessages(
  messages: MaybeRefOrGetter<Partial<AiChatLocale> | undefined>,
): void {
  provide(AI_CHAT_LOCALE_MESSAGES_KEY, messages);
}

export interface UseAiChatLocaleOptions {
  /** 语言覆盖，优先于全局 locale */
  overrideLocale?: MaybeRefOrGetter<Locale | undefined>;
  /**
   * 实例级文案覆盖。缺省从 provideAiChatLocaleMessages 注入值读取；显式传入时优先于注入值
   * （提供者组件自身 inject 不到自己的 provide，AiChat.vue 用这个口子消费自己的 localeMessages prop）
   */
  localeMessages?: MaybeRefOrGetter<Partial<AiChatLocale> | undefined>;
}

/**
 * ai-chat 包内统一的国际化 composable
 *
 * 文案合并优先级（低 → 高）：
 * 包内置语言包 → 应用级 createLocale messages['ai-chat'] → 实例级（prop / provide）
 */
export function useAiChatLocale(options: UseAiChatLocaleOptions = {}) {
  const injected = inject(AI_CHAT_LOCALE_MESSAGES_KEY, null);
  return useLocale({
    name: 'ai-chat',
    messages: locale,
    overrideLocale: options.overrideLocale,
    overrideMessages: () =>
      toValue(options.localeMessages) ?? (injected == null ? undefined : toValue(injected)),
  });
}
