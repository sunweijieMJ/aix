import jseslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import turboPlugin from 'eslint-plugin-turbo';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * eslint基础配置
 * @type {import("eslint").Linter.Config}
 */
export const baseConfig = [
  // ==================== 基础推荐配置 ====================
  // 应用 JavaScript 官方推荐规则
  jseslint.configs.recommended,

  // 应用 TypeScript 官方推荐规则
  ...tseslint.configs.recommended,

  // 集成 Prettier 配置，禁用与 Prettier 冲突的 ESLint 规则
  eslintConfigPrettier,

  // 集成 turbo 插件配置
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      'turbo/no-undeclared-env-vars': 'off',
    },
  },
  // ==================== 全局配置 ====================
  {
    languageOptions: {
      // 定义全局变量，避免 no-undef 错误
      globals: {
        ...globals.browser, // 浏览器环境全局变量 (window, document, etc.)
        ...globals.node, // Node.js 环境全局变量 (process, Buffer, etc.)
        ...globals.es2022, // ES2022 全局变量和特性
      },
      // 指定 ECMAScript 版本为最新
      ecmaVersion: 'latest',
      // 指定模块类型为 ES Module
      sourceType: 'module',
    },
    // Linter 选项配置
    linterOptions: {
      // 报告未使用的 eslint-disable 指令
      reportUnusedDisableDirectives: true,
    },
    // 自定义规则配置 - 组件库需要更灵活的类型约束
    rules: {
      // 允许使用 namespace（用于类型声明等场景）
      '@typescript-eslint/no-namespace': 'off',
      // 允许空接口（组件库常用于扩展）
      '@typescript-eslint/no-empty-object-type': 'off',
      // 允许非空断言（组件库内部可能有更明确的类型保证）
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 关闭 any 类型警告
      '@typescript-eslint/no-explicit-any': 'off',
      // 未使用变量警告
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/**/*',
      'build/**/*',
      'dist/**/*',
      'logs/**/*',
      'es/**/*',
      'lib/**/*',
      '.rollup.cache/**/*',
    ],
  },
];
