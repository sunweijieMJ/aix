import { commonRules, commonIgnoreFiles, scssOverride } from './common-rules.js';

/**
 * Stylelint Vue 项目配置
 * 适用于 Vue 项目中的 SCSS 和 SFC
 */
const config = {
  extends: [
    'stylelint-config-standard-scss', // SCSS 标准配置
    'stylelint-config-property-sort-order-smacss', // 属性排序规则
    'stylelint-config-recommended-vue/scss', // Vue + SCSS 推荐配置（已处理 .vue 文件解析）
  ],
  rules: commonRules,
  ignoreFiles: commonIgnoreFiles,
  overrides: [scssOverride],
};

export default config;
