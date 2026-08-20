import type { ComponentLocale } from '@aix/hooks';
import { enUS } from './en-US';
import type { AiChatLocale } from './types';
import { zhCN } from './zh-CN';

// 注册应用级文案覆盖切片：业务在 createLocale(locale, { messages: { 'ai-chat': ... } })
// 中写覆盖时获得包名 + key 级类型校验。key 必须与 useAiChatLocale 传的 name 一致
// （见 composables/useAiChatLocale.ts；本目录只放语言字典与类型，运行时逻辑在那边）。
declare module '@aix/hooks' {
  interface AixLocaleMessagesMap {
    'ai-chat': AiChatLocale;
  }
}

export const locale: ComponentLocale<AiChatLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
export type { AiChatLocale } from './types';
export { zhCN, enUS };
