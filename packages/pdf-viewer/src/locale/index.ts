import type { ComponentLocale } from '@aix/hooks';
import enUS from './en-US';
import type { PdfViewerLocaleText } from './types';
import zhCN from './zh-CN';

// 注册应用级文案覆盖切片：业务在 createLocale(locale, { messages: { 'pdf-viewer': ... } })
// 中写覆盖时获得包名 + key 级类型校验。key 必须与 useLocale 调用传的 name 一致。
declare module '@aix/hooks' {
  interface AixLocaleMessagesMap {
    'pdf-viewer': PdfViewerLocaleText;
  }
}

export type { PdfViewerLocaleText } from './types';

export const locale: ComponentLocale<PdfViewerLocaleText> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
