import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import { baseConfig } from './base.js';
import {
  commonTypeScriptRules,
  commonEslintRules,
  commonImportRules,
} from './common-rules.js';

/**
 * Vue 组件库的 ESLint 配置
 * 适用于可复用的 Vue 组件包开发
 * @type {import("eslint").Linter.Config}
 */
export const config = [
  ...baseConfig,

  // 应用 Vue.js 官方推荐规则
  ...eslintPluginVue.configs['flat/recommended'],

  // ==================== Vue 文件专用配置 ====================
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        // 指定 ECMAScript 版本为最新
        ecmaVersion: 'latest',
        // 指定模块类型为 ES Module
        sourceType: 'module',
        // 使用 TypeScript 解析器解析 <script> 部分
        parser: tseslint.parser,
        // 支持 .vue 文件扩展名
        extraFileExtensions: ['.vue'],
        // 启用项目引用以支持 TypeScript 类型检查
        project: './tsconfig.json',
        // 设置 TypeScript 配置根目录
        tsconfigRootDir: process.cwd(),
      },
    },

    rules: {
      // ========== Vue 3 特定规则调整 ==========
      // 关闭单行元素内容必须换行的限制
      'vue/singleline-html-element-content-newline': 'off',
      // 关闭组件名必须多单词的限制（允许 Button.vue 等单词组件名）
      'vue/multi-word-component-names': 'off',
      // 关闭模板根节点唯一性检查（Vue 3 支持多根节点）
      'vue/no-multiple-template-root': 'off',
      // 允许单行多属性（组件库常见）
      'vue/max-attributes-per-line': 'off',
      // 允许 v-html（组件库可能需要渲染动态 HTML）
      'vue/no-v-html': 'off',
    },
  },

  // ==================== Import 规则配置 ====================
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
          extensions: ['.js', '.ts', '.vue', '.json', '.d.ts'],
        },
      },
    },
    rules: commonImportRules,
  },

  // ==================== TypeScript 规则 ====================
  {
    rules: {
      ...commonTypeScriptRules,
      // Vue 特定配置：未使用的变量警告（下划线开头忽略）
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ==================== ESLint 通用规则 ====================
  {
    rules: commonEslintRules,
  },
];
