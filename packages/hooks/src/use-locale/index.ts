import { inject, computed, unref, isRef } from 'vue';
import { LOCALE_INJECTION_KEY } from './context';
import { commonLocale } from './common';
import {
  createPluralFormatter,
  createDateFormatter,
  createNumberFormatter,
  createCurrencyFormatter,
} from './formatters';
import type {
  ComponentLocale,
  LocaleReturn,
  Locale,
  PluralFormatter,
  DateFormatter,
  NumberFormatter,
  CurrencyFormatter,
} from './types';

// 格式化器缓存：避免重复创建 Intl 实例，提升性能
const formatterCache = new Map<
  Locale,
  {
    plural: PluralFormatter;
    date: DateFormatter;
    number: NumberFormatter;
    currency: CurrencyFormatter;
  }
>();

/**
 * 获取或创建指定语言的格式化器
 * 使用缓存机制，每个 locale 只创建一次
 */
function getOrCreateFormatters(locale: Locale) {
  if (!formatterCache.has(locale)) {
    formatterCache.set(locale, {
      plural: createPluralFormatter(locale),
      date: createDateFormatter(locale),
      number: createNumberFormatter(locale),
      currency: createCurrencyFormatter(locale),
    });
  }
  return formatterCache.get(locale)!;
}

// 导出所有类型和工具
export * from './types';
export * from './context';
export * from './common';
export * from './formatters';

/**
 * 组件内使用的国际化 hook
 *
 * @param componentLocale 组件的语言包
 * @param overrideLocale 可选的覆盖语言，支持静态值或响应式 Ref，优先级高于全局设置
 * @returns 包含 locale、t、格式化器的对象
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ref } from 'vue';
 * import { useLocale } from '@aix/hooks';
 * import { selectLocale } from './locale';
 *
 * // 使用全局 locale
 * const { locale, t, plural, date, number, currency } = useLocale(selectLocale);
 *
 * // 或者覆盖为特定语言（静态）
 * const { t } = useLocale(selectLocale, 'en-US');
 *
 * // 或者使用响应式覆盖
 * const dynamicLocale = ref('zh-CN');
 * const { t } = useLocale(selectLocale, dynamicLocale);
 * </script>
 *
 * <template>
 *   <div>{{ t.placeholder }}</div>
 *   <div>{{ plural(5, t.items) }}</div>
 *   <div>{{ date.short(new Date()) }}</div>
 * </template>
 * ```
 */
export function useLocale<T extends Record<string, unknown>>(
  componentLocale: ComponentLocale<T>,
  overrideLocale?: Locale | import('vue').Ref<Locale>,
): LocaleReturn<T & (typeof commonLocale)['zh-CN']> {
  // 注入全局 locale context
  const localeContext = inject(LOCALE_INJECTION_KEY, null);

  // 当前语言（响应式）
  // 优先级：overrideLocale > 全局 locale > 默认 'zh-CN'
  const currentLocale = computed(() => {
    // 支持 Ref<Locale> 或 Locale
    const override = isRef(overrideLocale)
      ? overrideLocale.value
      : overrideLocale;
    if (override) {
      return override;
    }
    return unref(localeContext?.locale) ?? 'zh-CN';
  });

  // 翻译文本对象（自动合并公共语言包和组件语言包）
  const t = computed(() => {
    const locale = currentLocale.value;

    // 获取组件语言包
    const component =
      componentLocale[locale] ||
      componentLocale['zh-CN'] ||
      (Object.values(componentLocale)[0] as T);

    // 获取公共语言包
    const common = commonLocale[locale] || commonLocale['zh-CN'];

    // 合并（组件语言包优先）
    return { ...common, ...component } as T & (typeof commonLocale)['zh-CN'];
  });

  // 使用缓存的格式化器（避免重复创建 Intl 实例）
  const formatters = computed(() => getOrCreateFormatters(currentLocale.value));

  // 返回格式化器作为 getter，保持响应式且避免每次创建新对象
  return {
    locale: currentLocale,
    t,
    get plural() {
      return formatters.value.plural;
    },
    get date() {
      return formatters.value.date;
    },
    get number() {
      return formatters.value.number;
    },
    get currency() {
      return formatters.value.currency;
    },
  };
}

/**
 * 仅使用公共语言包的 hook
 * 适用于不需要组件特定文案的场景
 *
 * @param overrideLocale 可选的覆盖语言，支持静态值或响应式 Ref，优先级高于全局设置
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ref } from 'vue';
 * import { useCommonLocale } from '@aix/hooks';
 *
 * // 使用全局 locale
 * const { t } = useCommonLocale();
 *
 * // 或者覆盖为特定语言（静态）
 * const { t } = useCommonLocale('en-US');
 *
 * // 或者使用响应式覆盖
 * const dynamicLocale = ref('zh-CN');
 * const { t } = useCommonLocale(dynamicLocale);
 * </script>
 *
 * <template>
 *   <button>{{ t.confirm }}</button>
 *   <button>{{ t.cancel }}</button>
 * </template>
 * ```
 */
export function useCommonLocale(
  overrideLocale?: Locale | import('vue').Ref<Locale>,
) {
  const localeContext = inject(LOCALE_INJECTION_KEY, null);

  const currentLocale = computed(() => {
    // 支持 Ref<Locale> 或 Locale
    const override = isRef(overrideLocale)
      ? overrideLocale.value
      : overrideLocale;
    if (override) {
      return override;
    }
    return unref(localeContext?.locale) ?? 'zh-CN';
  });

  const t = computed(() => {
    return commonLocale[currentLocale.value] || commonLocale['zh-CN'];
  });

  // 使用缓存的格式化器（避免重复创建 Intl 实例）
  const formatters = computed(() => getOrCreateFormatters(currentLocale.value));

  // 返回格式化器作为 getter，保持响应式且避免每次创建新对象
  return {
    locale: currentLocale,
    t,
    get plural() {
      return formatters.value.plural;
    },
    get date() {
      return formatters.value.date;
    },
    get number() {
      return formatters.value.number;
    },
    get currency() {
      return formatters.value.currency;
    },
  };
}
