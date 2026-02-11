import { inject, computed, unref, isRef, type Ref } from 'vue';
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

// 格式化器缓存：每个 locale 只创建一次格式化器函数，避免重复构造
const formatterCache = new Map<
  Locale,
  {
    plural: PluralFormatter;
    date: DateFormatter;
    number: NumberFormatter;
    currency: CurrencyFormatter;
  }
>();

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
 * 内部共享：locale 解析 + 格式化器闭包
 * 格式化器通过闭包委托，解构后仍能响应 locale 变化
 */
function useLocaleCore(overrideLocale?: Locale | Ref<Locale>) {
  const localeContext = inject(LOCALE_INJECTION_KEY, null);

  // 优先级：overrideLocale > 全局 locale > 默认 'zh-CN'
  const currentLocale = computed(() => {
    const override = isRef(overrideLocale)
      ? overrideLocale.value
      : overrideLocale;
    if (override) {
      return override;
    }
    return unref(localeContext?.locale) ?? 'zh-CN';
  });

  // 闭包委托：每次调用时读取 currentLocale，解构后仍然响应式
  const plural: PluralFormatter = (count, templates) =>
    getOrCreateFormatters(currentLocale.value).plural(count, templates);

  const date: DateFormatter = {
    short: (d) => getOrCreateFormatters(currentLocale.value).date.short(d),
    long: (d) => getOrCreateFormatters(currentLocale.value).date.long(d),
    time: (d) => getOrCreateFormatters(currentLocale.value).date.time(d),
    relative: (d) =>
      getOrCreateFormatters(currentLocale.value).date.relative(d),
  };

  const number: NumberFormatter = {
    decimal: (n, digits?) =>
      getOrCreateFormatters(currentLocale.value).number.decimal(n, digits),
    percent: (n) =>
      getOrCreateFormatters(currentLocale.value).number.percent(n),
    compact: (n) =>
      getOrCreateFormatters(currentLocale.value).number.compact(n),
  };

  const currency: CurrencyFormatter = (amount, curr?) =>
    getOrCreateFormatters(currentLocale.value).currency(amount, curr);

  return { currentLocale, plural, date, number, currency };
}

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
  const { currentLocale, plural, date, number, currency } =
    useLocaleCore(overrideLocale);

  const t = computed(() => {
    const locale = currentLocale.value;
    const component =
      componentLocale[locale] ||
      componentLocale['zh-CN'] ||
      (Object.values(componentLocale)[0] as T);
    const common = commonLocale[locale] || commonLocale['zh-CN'];
    return { ...common, ...component } as T & (typeof commonLocale)['zh-CN'];
  });

  return { locale: currentLocale, t, plural, date, number, currency };
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
  const { currentLocale, plural, date, number, currency } =
    useLocaleCore(overrideLocale);

  const t = computed(() => {
    return commonLocale[currentLocale.value] || commonLocale['zh-CN'];
  });

  return { locale: currentLocale, t, plural, date, number, currency };
}
