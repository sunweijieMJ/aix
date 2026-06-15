import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginImportX from 'eslint-plugin-import-x';
import eslintPluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import { config as baseConfig } from './base.js';
import { commonTypeScriptRules, commonEslintRules, commonImportRules } from './common-rules.js';

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
        // 按文件就近查找 tsconfig 提供类型信息。
        // 不能用 project + tsconfigRootDir: process.cwd()：从仓库根运行时（lint-staged/IDE）
        // 会解析到根 tsconfig.json，而根 tsconfig exclude 了 packages/，导致所有包内 .vue 解析失败
        projectService: true,
      },
    },

    rules: {
      // 关闭 no-useless-assignment（<script setup> 变量在模板中使用，ESLint 无法感知）
      'no-useless-assignment': 'off',
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
      // vue组件的可选 props 不需要强制默认值
      'vue/require-default-prop': 'off',
      // 【临时关闭，待全仓 typescript 收敛到单一版本后放开】
      // 根因是双 TS 版本错位：@typescript-eslint 8.61 的 peer 拉入 typescript@6.0.3，
      // projectService 用 6.0 建 program（prop 的 type 带 6.0 的 TypeFlags 位值），
      // 而 eslint-plugin-vue 用项目钉的 5.9.3 解读 TypeFlags。6.0 重排了枚举（String 4→32，
      // 而 5.9 的 32=Enum、NumberLike 含 Enum），于是 import 接口里的 string prop 被误判成
      // Number，字符串默认值被误报 "must be a number"（如 popper 的 teleportTo / transition）。
      // 默认值类型校验本就由 defineProps<T>() + vue-tsc 覆盖，此规则冗余，先禁用。
      'vue/require-valid-default-prop': 'off',
      // 关闭强制自闭合式
      'vue/html-self-closing': 'off',
      // 是否要求在标签的右括号前换行
      'vue/html-closing-bracket-newline': 'off',
    },
  },

  // ==================== Import 规则配置 ====================
  {
    plugins: {
      import: eslintPluginImportX,
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
    rules: commonTypeScriptRules,
  },

  // ==================== ESLint 通用规则 ====================
  {
    rules: commonEslintRules,
  },

  // ==================== 非 Vue 文件禁用 Vue 规则 ====================
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    ignores: ['**/*.vue'],
    rules: {
      'vue/one-component-per-file': 'off',
      'vue/require-prop-types': 'off',
      'vue/require-default-prop': 'off',
      'vue/comment-directive': 'off',
    },
  },

  // ==================== Prettier 兼容（必须在最后） ====================
  // base.js 中的 eslintConfigPrettier 会被上方 flat/recommended 的 vue 格式规则覆盖，
  // 在数组末尾重新应用一次，确保与 Prettier 冲突的格式规则（vue/html-indent 等）被禁用
  eslintConfigPrettier,
];
