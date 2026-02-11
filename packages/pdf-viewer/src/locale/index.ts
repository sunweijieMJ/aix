import type { ComponentLocale } from '@aix/hooks';
import enUS from './en-US';
import type { PdfViewerLocaleText } from './types';
import zhCN from './zh-CN';

export type { PdfViewerLocaleText } from './types';

export const locale: ComponentLocale<PdfViewerLocaleText> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
