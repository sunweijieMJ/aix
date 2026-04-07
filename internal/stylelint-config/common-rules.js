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
 * 常见字体名称（允许使用大写）
 * font-family 中的字体名称通常使用 PascalCase 或混合大小写
 */
const FONT_FAMILY_KEYWORDS = [
  // 系统字体
  'BlinkMacSystemFont',
  // 通用字体
  'Roboto',
  'Arial',
  'Helvetica',
  'Verdana',
  'Tahoma',
  'Georgia',
  'Consolas',
  'Courier',
  'Monaco',
  'Menlo',
  // 中文字体
  'PingFang',
  'Hiragino',
  'Heiti',
  'SimSun',
  'SimHei',
  'NSimSun',
  'FangSong',
  'KaiTi',
  'STSong',
  'STHeiti',
  // 泛型字体关键字
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
];

/**
 * 公共规则配置
 */
export const commonRules = {
  // ==================== 嵌套与选择器复杂度 ====================

  // 限制 SCSS 嵌套深度，避免过度嵌套导致选择器过长
  'max-nesting-depth': 5,
  // 限制单个选择器中 ID 选择器的数量，组件库应尽量避免 ID 选择器
  'selector-max-id': 1,
  // 限制复合选择器的层级数，避免过于复杂的选择器链
  'selector-max-compound-selectors': 5,

  // ==================== 命名规范 ====================

  // SCSS 变量名不做命名约束，允许自由命名（如 $color-primary、$fontSize 等）
  'scss/dollar-variable-pattern': null,
  // ID 选择器命名：允许字母开头的驼峰/短横线/下划线命名，以及 el-/mz- 前缀（Element Plus 等第三方组件）
  'selector-id-pattern': '^[a-zA-Z][a-zA-Z0-9_-]+$|^el-|^mz-',
  // 类选择器命名：规则同 ID 选择器
  'selector-class-pattern': '^[a-zA-Z][a-zA-Z0-9_-]+$|^el-|^mz-',
  // @keyframes 动画名称：允许字母、数字、短横线
  'keyframes-name-pattern': '^[a-zA-Z0-9-]+$',
  // CSS 自定义属性（--var）命名：允许字母、数字、短横线
  'custom-property-pattern': '^[a-zA-Z0-9-]+$',
  // SCSS @mixin 命名：允许字母、数字、短横线
  'scss/at-mixin-pattern': '^[a-zA-Z0-9-]+$',
  // SCSS %placeholder 命名：允许字母、数字、短横线
  'scss/percent-placeholder-pattern': '^[a-zA-Z0-9-]+$',

  // ==================== 值与表示法 ====================

  // 关键字值统一小写，但排除 font-family 中的字体名称（如 PingFang、Helvetica）
  'value-keyword-case': [
    'lower',
    {
      ignoreKeywords: FONT_FAMILY_KEYWORDS,
      // 允许 SVG 属性中的 camelCase 关键字（如 currentColor）
      camelCaseSvgKeywords: true,
    },
  ],
  // 使用现代颜色函数写法：rgb(0 0 0 / 50%) 而非 rgba(0, 0, 0, 0.5)
  'color-function-notation': 'modern',
  // 透明度使用数字表示（0.5）而非百分比（50%）
  'alpha-value-notation': 'number',

  // ==================== 浏览器兼容 ====================

  // 禁用值的浏览器前缀（应由 Autoprefixer 处理），但保留 -webkit-box 兼容旧版多行截断
  'value-no-vendor-prefix': [true, { ignoreValues: ['box'] }],
  // 允许媒体查询中使用浏览器前缀（如 -webkit-min-device-pixel-ratio）
  'media-feature-name-no-vendor-prefix': null,

  // ==================== 特异性与覆盖 ====================

  // 关闭特异性降序检查（组件库中嵌套和覆盖场景较多，严格检查误报率高）
  'no-descending-specificity': null,

  // ==================== Vue/SCSS 语法兼容 ====================

  // 允许 Vue 的 ::v-deep 伪元素
  'selector-pseudo-element-no-unknown': [true, { ignorePseudoElements: ['v-deep'] }],
  // 允许 Vue 的 :global、:deep 伪类
  'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global', 'deep'] }],
  // 允许 SCSS 内置函数和 Vue 的 v-bind()、iOS 安全区的 constant()/env() 等
  'function-no-unknown': [
    true,
    {
      ignoreFunctions: ['constant', 'env', 'fade-out', '-', 'nth', 'v-bind'],
    },
  ],
  // SCSS at-rule 检查：允许 @use/@mixin/@include 等 SCSS 语法及 Tailwind 的 @tailwind
  // 注意：stylelint-config-standard-scss 已关闭原生 at-rule-no-unknown，由 scss 插件接管
  'scss/at-rule-no-unknown': [true, { ignoreAtRules: SCSS_AT_RULES }],

  // ==================== 字体相关 ====================

  // 要求 font-family 声明包含通用字体族，但排除图标字体和特定项目字体
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
  ],

  // ==================== 宽松规则 ====================

  // 允许空文件（组件库中部分 .vue 文件可能没有 <style> 块）
  'no-empty-source': null,
  // 允许空的样式块（开发阶段可能存在占位样式块）
  'block-no-empty': null,
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
 * SCSS 文件 override（Vue 项目使用，Vue 预设已处理 .vue 文件）
 */
export const scssOverride = {
  files: ['**/*.scss'],
  customSyntax: 'postcss-scss',
};

/**
 * 基础 overrides 配置（包含 Vue 和 SCSS）
 */
export const commonOverrides = [
  {
    files: ['**/*.vue'],
    customSyntax: 'postcss-html',
  },
  scssOverride,
];
