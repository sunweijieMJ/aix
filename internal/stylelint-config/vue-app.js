import {
  commonRules,
  commonIgnoreFiles,
  commonOverrides,
} from './common-rules.js';

/**
 * Stylelint Vue 项目配置
 * 适用于 Vue 项目中的 SCSS 和 SFC
 */
const config = {
  extends: [
    'stylelint-config-standard-scss', // SCSS 标准配置
    'stylelint-config-property-sort-order-smacss', // 属性排序规则
    'stylelint-config-recommended-vue', // Vue 推荐配置
  ],
  plugins: ['stylelint-scss', 'stylelint-order'],
  rules: commonRules,
  ignoreFiles: commonIgnoreFiles,
  overrides: commonOverrides,
};

export default config;
