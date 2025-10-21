import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { baseConfig } from './base.js';
import {
  commonTypeScriptRules,
  commonEslintRules,
  commonImportRules,
} from './common-rules.js';

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
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
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
    rules: commonImportRules,
  },
  // TypeScript ESLint 规则
  {
    rules: commonTypeScriptRules,
  },
  // ESLint 通用规则
  {
    rules: commonEslintRules,
  },
];
