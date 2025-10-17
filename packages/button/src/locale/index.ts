import type { ComponentLocale } from '@aix/hooks';
import enUS from './en-US';
import zhCN from './zh-CN';

export interface ButtonLocale extends Record<string, unknown> {
  /** 加载状态文案 */
  loadingText: string;
  /** 点击我（示例文案） */
  clickMe: string;
  /** 提交按钮 */
  submitButton: string;
}

export const buttonLocale: ComponentLocale<ButtonLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
