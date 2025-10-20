import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { baseConfig } from './base.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Vue 组件库的 ESLint 配置
 * 适用于可复用的 Vue 组件包开发
 * @type {import("eslint").Linter.Config}
 */
export const config = [
  ...baseConfig,

  // 应用 Vue.js 官方推荐规则
  ...eslintPluginVue.configs['flat/recommended'],

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
    // 插件设置
    settings: {
      // 配置 import 解析器，支持 TypeScript 路径映射
      'import/resolver': {
        typescript: {
          // 总是尝试解析类型文件
          alwaysTryTypes: true,
          // 组件库使用 tsconfig.json
          project: './tsconfig.json',
        },
      },
    },
    // 自定义规则配置 - 组件库需要更灵活的类型约束
    rules: {
      // 允许使用 namespace（用于类型声明等场景）
      '@typescript-eslint/no-namespace': 'off',
      // 允许空接口（组件库常用于扩展）
      '@typescript-eslint/no-empty-object-type': 'off',
      // 允许非空断言（组件库内部可能有更明确的类型保证）
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

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
      // 在 Vue 文件中关闭未使用变量检查（模板中使用的变量可能被误报）
      '@typescript-eslint/no-unused-vars': 'off',
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
          map: [
            ['@', './src'],
            ['~', './'],
          ],
          extensions: ['.js', '.ts', '.vue', '.json', '.d.ts'],
        },
      },
    },
    rules: {
      // 组件库不强制默认导出
      'import/prefer-default-export': 'off',
      // import 排序
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

  // ==================== TypeScript 规则 ====================
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off', // 允许非空断言
      '@typescript-eslint/ban-ts-comment': 'warn', // 警告 ts 注释
      '@typescript-eslint/no-use-before-define': 'off', // 允许定义前使用
      '@typescript-eslint/no-unused-expressions': 'off', // 允许未使用表达式
      '@typescript-eslint/no-empty-object-type': 'off', // 允许空对象类型
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ], // 未使用的变量警告（下划线开头忽略）
    },
  },

  // ==================== ESLint 通用规则 ====================
  {
    rules: {
      /**
       * 环境调试
       */
      'no-console': isProd ? ['warn', { allow: ['warn', 'error'] }] : 'off',
      'no-debugger': isProd ? 'error' : 'off',
      /**
       * 最佳实践
       */
      'no-use-before-define': 'off',
      'no-shadow': 'off',
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'no-bitwise': 'off',
      'func-names': 'off',
      'class-methods-use-this': 'off',
      'prefer-destructuring': ['error', { array: false, object: false }],
      'no-else-return': ['error', { allowElseIf: true }],
      'consistent-return': 'off',
      'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
      'lines-between-class-members': [
        'error',
        'always',
        { exceptAfterSingleLine: true },
      ],
      'no-nested-ternary': 'off',
      'no-continue': 'off',
      'no-control-regex': 'off',
      'default-param-last': 'off',
      camelcase: 'off',
      'sort-imports': [
        2,
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
        },
      ],
    },
  },
];
