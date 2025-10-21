const isProd = process.env.NODE_ENV === 'production';

/**
 * 公共规则配置 - 用于 Vue 和 React 项目
 * 包含通用的 TypeScript 和 ESLint 规则
 */

/**
 * TypeScript ESLint 规则 - 应用级别配置
 */
export const commonTypeScriptRules = {
  '@typescript-eslint/ban-ts-comment': 'warn', // 警告 ts 注释
  '@typescript-eslint/no-use-before-define': 'off', // 允许定义前使用
  '@typescript-eslint/no-unused-expressions': 'off', // 允许未使用表达式
};

/**
 * ESLint 通用规则 - 应用级别配置
 */
export const commonEslintRules = {
  /**
   * 环境调试
   */
  'no-console': isProd ? ['warn', { allow: ['warn', 'error'] }] : 'off', // 禁用 console
  'no-debugger': isProd ? 'error' : 'off', // 禁用 debugger
  /**
   * 最佳实践
   */
  'no-shadow': 'off', // 禁止变量声明覆盖外层作用域的变量
  'no-param-reassign': 'off', // 禁止对函数参数再赋值
  'no-plusplus': 'off', // 禁止使用一元表达式
  'no-bitwise': 'off', // 禁止使用位运算符
  'func-names': 'off', // 要求或禁止使用命名的function表达式
  'class-methods-use-this': 'off', // 强制类方法使用this
  'prefer-destructuring': 'off', // 不强制解构
  'no-else-return': ['error', { allowElseIf: true }], // 禁止在else之前返回
  'consistent-return': 'off', // 要求return语句一致返回
  'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'], // 禁止指定的语法
  'lines-between-class-members': [
    'error',
    'always',
    { exceptAfterSingleLine: true },
  ], // 要求或禁止类成员之间有空行
  'no-nested-ternary': 'off', // 不允许嵌套的三元表达式
  'no-continue': 'off', // 不允许continue
  'no-control-regex': 'off', // 禁止在正则表达式中使用控制字符
  'default-param-last': 'off', // 默认参数最后
  camelcase: 'off', // 强制执行驼峰命名约定
};

/**
 * Import 插件配置 - 通用设置
 */
export const commonImportRules = {
  'import/prefer-default-export': 'off', // 不强制默认导出
  'import/order': [
    2,
    {
      alphabetize: {
        order: 'asc',
        caseInsensitive: true,
      },
      'newlines-between': 'never',
    },
  ],
};
