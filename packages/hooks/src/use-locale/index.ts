import { inject, computed, toValue, type MaybeRefOrGetter } from 'vue';
import { LOCALE_INJECTION_KEY } from './context';
import { commonLocale, type CommonLocale } from './common';
import type { Locale, LocaleReturn, UseLocaleOptions } from './types';

// 导出所有类型和工具
export * from './types';
export * from './context';
export * from './common';

/**
 * 内部共享：解析全局上下文与当前 locale
 */
function useLocaleContext(overrideLocale?: MaybeRefOrGetter<Locale | undefined>) {
  const localeContext = inject(LOCALE_INJECTION_KEY, null);

  // 优先级：overrideLocale > 全局 locale > 默认 'zh-CN'
  const currentLocale = computed(() => {
    return toValue(overrideLocale) ?? localeContext?.locale ?? 'zh-CN';
  });

  return { localeContext, currentLocale };
}

/**
 * 组件内使用的国际化 hook
 *
 * 文案按四层浅合并，优先级从低到高：
 * 1. commonLocale（hooks 公共语言包）
 * 2. 包内置语言包（options.messages）
 * 3. 应用级覆盖（createLocale 的 messages[options.name]，业务在 main.ts 统一定制）
 * 4. 实例级覆盖（options.overrideMessages，通常来自组件的 messages prop）
 *
 * @example
 * ```ts
 * // 子包内封装专属 composable，组件统一使用它（完整实现见 ai-chat 的 useAiChatLocale）：
 * export function useAiChatLocale(options: UseAiChatLocaleOptions = {}) {
 *   const injected = inject(AI_CHAT_LOCALE_MESSAGES_KEY, null);
 *   return useLocale({
 *     name: 'ai-chat',
 *     messages: locale,
 *     overrideLocale: options.overrideLocale,
 *     overrideMessages: () =>
 *       toValue(options.localeMessages) ?? (injected == null ? undefined : toValue(injected)),
 *   });
 * }
 * ```
 */
export function useLocale<T extends object>(
  options: UseLocaleOptions<T>,
): LocaleReturn<T & CommonLocale> {
  const { name, messages, overrideLocale, overrideMessages } = options;
  const { localeContext, currentLocale } = useLocaleContext(overrideLocale);

  const t = computed(() => {
    const locale = currentLocale.value;
    // messages 的映射类型以 AixLocaleMessagesMap 为准，这里按包名宽松索引
    const appMessages = (
      localeContext?.messages as
        | Record<string, Partial<Record<Locale, Partial<T>>> | undefined>
        | undefined
    )?.[name];
    return {
      ...commonLocale[locale],
      ...messages[locale],
      ...appMessages?.[locale],
      ...toValue(overrideMessages),
    } as T & CommonLocale;
  });

  return { locale: currentLocale, t };
}

/**
 * 仅使用公共语言包的 hook
 * 适用于不需要组件特定文案的场景
 *
 * @param overrideLocale 可选的覆盖语言，支持静态值 / Ref / getter，优先级高于全局设置
 */
export function useCommonLocale(overrideLocale?: MaybeRefOrGetter<Locale | undefined>) {
  const { currentLocale } = useLocaleContext(overrideLocale);

  const t = computed(() => {
    return commonLocale[currentLocale.value];
  });

  return { locale: currentLocale, t };
}
