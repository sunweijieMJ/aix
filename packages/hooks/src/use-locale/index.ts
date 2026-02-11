import { inject, computed, isRef, type Ref } from 'vue';
import { LOCALE_INJECTION_KEY } from './context';
import { commonLocale } from './common';
import type { ComponentLocale, LocaleReturn, Locale } from './types';

// 导出所有类型和工具
export * from './types';
export * from './context';
export * from './common';

/**
 * 内部共享：解析当前 locale
 */
function useCurrentLocale(overrideLocale?: Locale | Ref<Locale>) {
  const localeContext = inject(LOCALE_INJECTION_KEY, null);

  // 优先级：overrideLocale > 全局 locale > 默认 'zh-CN'
  return computed(() => {
    const override = isRef(overrideLocale)
      ? overrideLocale.value
      : overrideLocale;
    if (override) {
      return override;
    }
    return localeContext?.locale ?? 'zh-CN';
  });
}

/**
 * 组件内使用的国际化 hook
 *
 * @param componentLocale 组件的语言包
 * @param overrideLocale 可选的覆盖语言，支持静态值或响应式 Ref，优先级高于全局设置
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useLocale } from '@aix/hooks';
 * import { locale } from './locale';
 *
 * const { locale: currentLocale, t } = useLocale(locale);
 * </script>
 *
 * <template>
 *   <div>{{ t.placeholder }}</div>
 * </template>
 * ```
 */
export function useLocale<T extends object>(
  componentLocale: ComponentLocale<T>,
  overrideLocale?: Locale | Ref<Locale>,
): LocaleReturn<T & (typeof commonLocale)['zh-CN']> {
  const currentLocale = useCurrentLocale(overrideLocale);

  const t = computed(() => {
    const locale = currentLocale.value;
    const component = componentLocale[locale];
    const common = commonLocale[locale];
    return { ...common, ...component } as T & (typeof commonLocale)['zh-CN'];
  });

  return { locale: currentLocale, t };
}

/**
 * 仅使用公共语言包的 hook
 * 适用于不需要组件特定文案的场景
 *
 * @param overrideLocale 可选的覆盖语言，支持静态值或响应式 Ref，优先级高于全局设置
 */
export function useCommonLocale(overrideLocale?: Locale | Ref<Locale>) {
  const currentLocale = useCurrentLocale(overrideLocale);

  const t = computed(() => {
    return commonLocale[currentLocale.value];
  });

  return { locale: currentLocale, t };
}
