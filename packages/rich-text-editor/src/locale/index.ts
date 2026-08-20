import type { ComponentLocale } from '@aix/hooks';
import enUS from './en-US';
import type { RichTextEditorLocale } from './types';
import zhCN from './zh-CN';

// 注册应用级文案覆盖切片：业务在 createLocale(locale, { messages: { 'rich-text-editor': ... } })
// 中写覆盖时获得包名 + key 级类型校验。key 必须与 useLocale 调用传的 name 一致。
declare module '@aix/hooks' {
  interface AixLocaleMessagesMap {
    'rich-text-editor': RichTextEditorLocale;
  }
}

export type { RichTextEditorLocale } from './types';
export { default as zhCN } from './zh-CN';
export { default as enUS } from './en-US';

/** 组件语言包（供 useLocale 使用） */
export const locale: ComponentLocale<RichTextEditorLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
