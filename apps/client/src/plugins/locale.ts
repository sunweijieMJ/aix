import { createI18n } from 'vue-i18n';
import enUS from '../locale/en-US.json';
import zhCN from '../locale/zh-CN.json';

/**
 * 语言包类型
 */
export type LocaleKey = 'zh-CN' | 'en-US';

/**
 * vue-i18n 语言包配置
 */
const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
  messages,
  globalInjection: true, // 全局注入$t函数
});

/**
 * 导出一个便捷函数
 */
export const t = i18n.global.t;

/**
 * 动态加载语言包
 * @param locale 语言代码
 * @returns Promise<boolean> 加载是否成功
 */
export const loadLocaleMessages = async (locale: LocaleKey) => {
  try {
    const response = await fetch(`/locale/${locale}.json`);
    if (!response.ok) {
      console.error(`加载语言包失败: ${locale}，使用默认语言包`);
      return false;
    }

    const messages = await response.json();

    // 设置语言包到 vue-i18n
    i18n.global.setLocaleMessage(locale, messages);

    // 确保当前语言也更新
    i18n.global.locale.value = locale;

    return true;
  } catch (error) {
    console.error(`加载语言包出错: ${locale}，使用默认语言包`, error);
    return false;
  }
};

export default i18n;
