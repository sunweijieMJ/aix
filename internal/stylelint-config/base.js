import {
  commonRules,
  commonIgnoreFiles,
  commonOverrides,
} from './common-rules.js';

/**
 * Stylelint 基础配置
 * 适用于 SCSS 项目
 */
const config = {
  extends: [
    'stylelint-config-standard-scss', // SCSS 标准配置
    'stylelint-config-property-sort-order-smacss', // 属性排序规则
  ],
  plugins: ['stylelint-scss', 'stylelint-order'],
  rules: commonRules,
  ignoreFiles: commonIgnoreFiles,
  overrides: commonOverrides,
};

export default config;
