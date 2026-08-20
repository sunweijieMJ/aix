import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import type { AixLocaleMessagesMap } from '../index';

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
 * 应用级文案覆盖：包名 → 语言 → 部分文案
 *
 * key 来自 AixLocaleMessagesMap（各子包通过模块增强注册，见 index.ts），
 * 因此业务侧写覆盖时包名和文案 key 均有完整类型校验，拼错直接编译报错。
 */
export type LocaleMessages = {
  [K in keyof AixLocaleMessagesMap]?: Partial<Record<Locale, Partial<AixLocaleMessagesMap[K]>>>;
};

/**
 * useLocale 配置项
 * @template T 组件语言包的类型
 */
export interface UseLocaleOptions<T extends object> {
  /**
   * 包名，用于索引应用级 messages 覆盖切片。
   * 必须与该包在 AixLocaleMessagesMap 中注册的 key 一致（两者应在子包
   * locale 模块中相邻声明，避免漂移）。
   */
  name: keyof AixLocaleMessagesMap | (string & {});
  /** 包内置语言包 */
  messages: ComponentLocale<T>;
  /** 语言覆盖，优先于全局 locale，支持静态值 / Ref / getter */
  overrideLocale?: MaybeRefOrGetter<Locale | undefined>;
  /** 实例级文案覆盖，合并优先级最高，支持静态值 / Ref / getter */
  overrideMessages?: MaybeRefOrGetter<Partial<T> | null | undefined>;
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
