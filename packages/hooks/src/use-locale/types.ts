import type { ComputedRef } from 'vue';

/**
 * 支持的语言代码常量
 * Locale 类型从此数组派生，确保单一数据源
 */
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;

/**
 * 支持的语言类型
 */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * 组件语言包结构
 * @template T 语言包的类型
 */
export interface ComponentLocale<T = Record<string, unknown>> {
  'zh-CN': T;
  'en-US': T;
}

/**
 * useLocale 返回值接口
 */
export interface LocaleReturn<T> {
  /** 当前语言 */
  locale: ComputedRef<Locale>;
  /** 翻译文本对象 */
  t: ComputedRef<T>;
}
