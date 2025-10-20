import jseslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginHtml from 'eslint-plugin-html';
import eslintPluginMarkdown from 'eslint-plugin-markdown';
import eslintPluginOnlyWarn from 'eslint-plugin-only-warn';
import turboPlugin from 'eslint-plugin-turbo';
import tseslint from 'typescript-eslint';

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

  // 集成 turbo 配置
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      'turbo/no-undeclared-env-vars': 'off',
    },
  },

  {
    plugins: {
      onlyWarn: eslintPluginOnlyWarn,
    },
  },

  {
    plugins: {
      markdown: eslintPluginMarkdown,
    },
  },

  {
    plugins: {
      html: eslintPluginHtml,
    },
  },
  {
    rules: {
      // 关闭 any 类型警告
      '@typescript-eslint/no-explicit-any': 'off',
      // 关闭未使用变量警告（如果需要）
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/**/*',
      'deploy/**/*',
      'build/**/*',
      'dist/**/*',
      'logs/**/*',
      'es/**/*',
      'lib/**/*',
      '.rollup.cache/**/*',
    ],
  },
];
