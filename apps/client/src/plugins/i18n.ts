import { createI18n } from 'vue-i18n';
import enUS from '../locale/en-US.json';
import zhCN from '../locale/zh-CN.json';

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

/**
 * 导出一个便捷函数
 */
export const t = i18n.global.t;

export default i18n;
