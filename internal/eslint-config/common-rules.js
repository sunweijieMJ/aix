const isProd = process.env.NODE_ENV === 'production';

/**
 * 公共规则配置 - 用于 Vue 和 React 项目
 * 包含通用的 TypeScript 和 ESLint 规则
 */

/**
 * TypeScript ESLint 规则 - 应用级别配置
 */
export const commonTypeScriptRules = {
  // 使用 @ts-ignore/@ts-nocheck 等注释时给出警告，提醒开发者尽量修复类型问题
  '@typescript-eslint/ban-ts-comment': 'warn',
  // 允许在定义前使用变量/函数（函数声明会被提升，且有利于代码组织）
  '@typescript-eslint/no-use-before-define': 'off',
  // 允许未使用的表达式（如短路求值 `condition && doSomething()`）
  '@typescript-eslint/no-unused-expressions': 'off',
};

/**
 * ESLint 通用规则 - 应用级别配置
 */
export const commonEslintRules = {
  // 生产环境禁止 console.log（仅允许 warn/error），开发环境不限制
  'no-console': isProd ? ['warn', { allow: ['warn', 'error'] }] : 'off',
  // 生产环境禁止 debugger 语句，开发环境不限制
  'no-debugger': isProd ? 'error' : 'off',
  // 禁止使用 label 语句和 with 语句（易导致混乱的控制流和作用域问题）
  'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
  // 允许正则中使用控制字符（某些文本处理场景需要匹配控制字符）
  'no-control-regex': 'off',
};

/**
 * Import 插件配置 - 通用设置
 */
export const commonImportRules = {
  // 强制 import 语句按字母顺序排列，且导入组之间不加空行
  'import/order': [
    'error',
    {
      alphabetize: {
        order: 'asc',
        caseInsensitive: true,
      },
      'newlines-between': 'never',
    },
  ],
};
