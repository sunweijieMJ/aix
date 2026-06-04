import type { ComponentLocale } from '@aix/hooks';
import type { AiChatLocale } from './types';
import { zhCN } from './zh-CN';
import { enUS } from './en-US';

export const locale: ComponentLocale<AiChatLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
export type { AiChatLocale } from './types';
export { zhCN, enUS };
