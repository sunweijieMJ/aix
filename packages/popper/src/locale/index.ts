import type { ComponentLocale } from '@aix/hooks';
import enUS from './en-US';
import type { PopperLocale } from './types';
import zhCN from './zh-CN';

export type { PopperLocale } from './types';
export { default as zhCN } from './zh-CN';
export { default as enUS } from './en-US';

/** Popper 组件语言包（供 useLocale 使用） */
export const locale: ComponentLocale<PopperLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
