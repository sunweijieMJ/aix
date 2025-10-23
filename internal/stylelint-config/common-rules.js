/**
 * Stylelint 公共规则配置
 * 用于 SCSS 和 Vue 项目
 */

// SCSS at-rule 列表（用于 Sass、Tailwind 等）
const SCSS_AT_RULES = [
  'use',
  'forward',
  'function',
  'if',
  'for',
  'each',
  'else',
  'error',
  'include',
  'extend',
  'mixin',
  'at-root',
  'tailwind',
];

/**
 * 公共规则配置
 */
export const commonRules = {
  'max-nesting-depth': 10, // 限制嵌套深度
  'scss/dollar-variable-pattern': [/$/, { ignore: 'global' }], // scss变量名忽略警告
  'selector-id-pattern': '^[a-zA-Z][a-zA-Z0-9_-]+$|^el-|^mz-', // 为id选择器指定一个匹配模式
  'selector-class-pattern': '^[a-zA-Z][a-zA-Z0-9_-]+$|^el-|^mz-', // 为类选择器指定一个匹配模式
  'selector-max-id': 6, // 限制选择器中ID选择器的数量
  'selector-max-compound-selectors': 15, // 限制选择器中复合选择器的数量
  'color-function-notation': 'modern', // 颜色函数符号
  'alpha-value-notation': ['number'], // 字母值表示法
  'keyframes-name-pattern': '^[a-zA-Z-0-9]+$', // 动画名称匹配模式
  'custom-property-pattern': '^[a-zA-Z-0-9]+$', // 自定义属性匹配模式
  'scss/at-mixin-pattern': '^[a-zA-Z-0-9]+$', // at-mixin匹配模式
  'scss/percent-placeholder-pattern': '^[a-zA-Z-0-9]+$', // percent-placeholder匹配模式
  'no-descending-specificity': null, // 禁止特异性较低的选择器在特异性较高的选择器之后重写
  'media-feature-name-no-vendor-prefix': null, // 不允许媒体功能名称使用供应商前缀
  'selector-pseudo-element-no-unknown': [
    true,
    { ignorePseudoElements: ['v-deep'] },
  ], // 禁止未知的伪类选择器
  'function-no-unknown': [
    true,
    {
      ignoreFunctions: ['constant', 'env', 'fade-out', '-', 'nth', 'v-bind'],
    },
  ], // 禁用未知的函数
  'font-family-no-missing-generic-family-keyword': [
    true,
    {
      ignoreFontFamilies: [
        'iconfont',
        'SourceHanSansSC-Regular',
        'SourceHanSansSC-Bold',
        'SourceHanSansSC-Medium',
        'Source Han Sans SC',
        'Rubik',
      ],
    },
  ], // 不允许在字体系列名称列表中缺少通用系列
  'value-no-vendor-prefix': [
    true,
    {
      ignoreValues: ['box'],
    },
  ], // 禁用值的浏览器前缀
  'at-rule-no-unknown': [
    // 未知规则的禁用
    true,
    {
      ignoreAtRules: SCSS_AT_RULES,
    },
  ],
  'scss/at-rule-no-unknown': [
    // 未知规则的禁用
    true,
    {
      ignoreAtRules: SCSS_AT_RULES,
    },
  ],
  'selector-pseudo-class-no-unknown': [
    true,
    {
      ignorePseudoClasses: ['global', 'deep'],
    },
  ], // 不允许未知的伪类选择器
  'no-empty-source': null, // 允许空源
  'block-no-empty': null, // 允许空块
};

/**
 * 公共忽略文件
 */
export const commonIgnoreFiles = [
  'node_modules/**/*',
  'build/**/*',
  'dist/**/*',
  'es/**/*',
  'lib/**/*',
  'coverage/**/*',
];

/**
 * 公共 overrides 配置
 */
export const commonOverrides = [
  {
    files: ['**/*.vue'],
    customSyntax: 'postcss-html',
  },
  {
    files: ['**/*.scss'],
    customSyntax: 'postcss-scss',
  },
];
