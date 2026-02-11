import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from '@kit/i18n-tools';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // 项目根目录（绝对路径）
  rootDir: __dirname,

  // 框架类型: 'vue' | 'react'
  framework: 'vue',

  // Vue 框架专用配置
  vue: {
    // i18n 库: 'vue-i18n' | 'vue-i18next'
    library: 'vue-i18n',
    // 命名空间（仅 vue-i18next 生效）
    namespace: '',
  },

  // 语言配置
  locale: {
    // 源语言代码
    source: 'zh-CN',
    // 目标语言代码
    target: 'en-US',
  },

  // 路径配置（相对于 rootDir）
  paths: {
    // 语言文件目录
    locale: 'src/locale',
    // 自定义语言文件目录（用于覆盖默认翻译）
    customLocale: 'src/overrides/locale',
    // 导出目录（export-to-public 命令输出位置）
    exportLocale: 'public/locale',
    // 源代码扫描目录
    source: 'src',
    // .ts/.js 文件中 t 函数的导入路径
    tImport: '@/plugins/locale',
  },

  // LLM API 配置
  llm: {
    // ID 生成接口
    idGeneration: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
      // 超时时间（毫秒），默认 60000
      timeout: 60000,
      // 最大重试次数，默认 2
      maxRetries: 2,
      // 温度参数，控制输出随机性，默认 0.1
      temperature: 0.1,
    },
    // 翻译接口
    translation: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
      timeout: 60000,
      maxRetries: 2,
      temperature: 0.1,
    },
  },

  // 自定义 AI 提示词（覆盖默认提示词，不设置则使用内置提示词）
  // prompts: {
  //   idGeneration: {
  //     system: '自定义 ID 生成 System Prompt...',
  //     user: 'Generate IDs for {count} texts:\n{textList}',
  //   },
  //   translation: {
  //     system: '自定义翻译 System Prompt...',
  //     user: 'Translate:\n{jsonText}',
  //   },
  // },

  // ID 前缀配置
  idPrefix: {
    // 锚点目录名，用于定位路径前缀的起始位置
    anchor: 'src',
    // 自定义固定前缀（设置后替代自动提取的路径前缀，留空则自动提取）
    value: '',
    // ID 分隔符，默认 '__'
    separator: '__',
    // 中文常用词映射表（用于本地 ID 兜底生成，可扩展）
    // chineseMappings: { '确认': 'confirm', '取消': 'cancel', ... },
  },

  // 并发控制
  concurrency: {
    // ID 生成最大并发数
    idGeneration: 5,
    // 翻译最大并发数
    translation: 3,
  },

  // 翻译批次大小（每次发送给 LLM 的条目数）
  batchSize: 10,

  // 翻译批次间延时（毫秒），默认 500
  batchDelay: 500,

  // 转换后是否自动格式化代码（Prettier + ESLint），默认 true
  format: false,

  // 文件过滤 glob 模式（扫描哪些文件）
  include: ['**/*.vue', '**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],

  // 排除的目录或文件
  exclude: ['node_modules', 'dist', 'build', '.git', 'public'],
});
