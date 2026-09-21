import type { TemplateConfig } from '../../../../src/types';

/** 故意含未闭合条件块的模板，用于验证 composer 的语法报错链路 */
const config: TemplateConfig = {
  id: 'template-broken',
  platform: 'web',
  compatibleCliVersions: '*', // fixture 不与真实 CLI 版本耦合
  variables: {},
  features: {
    i18n: { label: '国际化' },
  },
};

export default config;
