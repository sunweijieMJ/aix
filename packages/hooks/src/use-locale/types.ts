import type { ComputedRef } from 'vue';

/**
 * 支持的语言类型
 */
export type Locale = 'zh-CN' | 'en-US';

/**
 * 组件语言包结构
 * @template T 语言包的类型
 */
export interface ComponentLocale<T = Record<string, unknown>> {
  'zh-CN': T;
  'en-US': T;
}

/**
 * 日期格式化器接口
 */
export interface DateFormatter {
  /**
   * 短日期格式
   * @example 2025-01-15 (zh-CN) | 01/15/2025 (en-US)
   */
  short: (date: Date) => string;
  /**
   * 长日期格式
   * @example 2025年1月15日 星期三 (zh-CN) | Wednesday, January 15, 2025 (en-US)
   */
  long: (date: Date) => string;
  /**
   * 时间格式
   * @example 14:30:00
   */
  time: (date: Date) => string;
  /**
   * 相对时间
   * @example 3天前 (zh-CN) | 3 days ago (en-US)
   */
  relative: (date: Date) => string;
}

/**
 * 数字格式化器接口
 */
export interface NumberFormatter {
  /**
   * 小数格式化
   * @param num 数字
   * @param digits 小数位数，默认 2
   */
  decimal: (num: number, digits?: number) => string;
  /**
   * 百分比格式化
   * @example 0.755 -> 75.5%
   */
  percent: (num: number) => string;
  /**
   * 紧凑格式（简写）
   * @example 12000 -> 1.2万 (zh-CN) | 12K (en-US)
   */
  compact: (num: number) => string;
}

/**
 * 复数格式化器类型
 */
export type PluralFormatter = (
  count: number,
  templates: Record<string, string>,
) => string;

/**
 * 货币格式化器类型
 */
export type CurrencyFormatter = (amount: number, currency?: string) => string;

/**
 * useLocale 返回值接口
 */
export interface LocaleReturn<T> {
  /**
   * 当前语言
   */
  locale: ComputedRef<Locale>;
  /**
   * 翻译文本对象
   */
  t: ComputedRef<T>;
  /**
   * 复数格式化器
   */
  plural: PluralFormatter;
  /**
   * 日期格式化器
   */
  date: DateFormatter;
  /**
   * 数字格式化器
   */
  number: NumberFormatter;
  /**
   * 货币格式化器
   */
  currency: CurrencyFormatter;
}
