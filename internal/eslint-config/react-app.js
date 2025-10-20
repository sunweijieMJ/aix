import eslintPluginHtml from 'eslint-plugin-html';
import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { baseConfig } from './base.js';

const isProd = process.env.NODE_ENV === 'production';

const eslintPluginReactRecommended = eslintPluginReact.configs.flat.recommended;

/**
 * react项目的eslint配置
 * @type {import("eslint").Linter.Config}
 */
export const config = [
  ...baseConfig,

  eslintPluginReactRecommended,
  {
    languageOptions: {
      ...eslintPluginReactRecommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  {
    plugins: {
      react: eslintPluginReact,
    },
    rules: {
      'react/react-in-jsx-scope': 'off', // 允许在没有显式导入 React 的情况下使用 JSX
      'react/display-name': 'off', // 允许不显示组件名称
      'react/prop-types': 'off', // 关闭prop-types检查
      'react/jsx-pascal-case': 'error', // 组件命名必须使用 PascalCase
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    plugins: {
      'react-hooks': eslintPluginReactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn', // 确保依赖项被正确处理
      'react-hooks/rules-of-hooks': 'error', // 确保 hooks 只能在函数组件或自定义 hooks 中使用
    },
  },
  {
    plugins: {
      'react-refresh': eslintPluginReactRefresh,
    },
  },
  {
    plugins: {
      html: eslintPluginHtml,
    },
  },
  {
    plugins: {
      import: eslintPluginImport,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
        alias: {
          map: [['@', './src']],
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.d.ts'],
        },
      },
    },
    rules: {
      'import/prefer-default-export': 'off', // 需要有默认导出
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
    },
  },
  // TypeScript ESLint 规则
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off', // 禁止非空断言
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-use-before-define': 'off', // 禁止定义前使用
      '@typescript-eslint/no-unused-expressions': 'off', // 关闭未使用表达式检查
      '@typescript-eslint/no-empty-object-type': 'off', // 禁止空对象类型
    },
  },
  // Eslint 规则
  {
    rules: {
      /**
       * 环境调试
       */
      'no-console': isProd ? ['warn', { allow: ['warn', 'error'] }] : 'off', // 禁用 console
      'no-debugger': isProd ? 'error' : 'off', // 禁用 debugger
      /**
       * 最佳实践
       */
      'no-use-before-define': 'off', // 禁止定义前使用
      'no-shadow': 'off', // 禁止变量声明覆盖外层作用域的变量
      'no-param-reassign': 'off', // 禁止对函数参数再赋值
      'no-plusplus': 'off', // 禁止使用一元表达式
      'no-bitwise': 'off', // 禁止使用位运算符
      'func-names': 'off', // 要求或禁止使用命名的function表达式
      'class-methods-use-this': 'off', // 强制类方法使用this
      'prefer-destructuring': ['error', { array: false, object: false }], // 优先使用数组和对象解构(不强制)
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
      'sort-imports': [
        // import 排序
        2,
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
        },
      ],
    },
  },
];
