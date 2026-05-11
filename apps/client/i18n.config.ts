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
    // 导出目录（export-to-public 命令输出位置）
    exportLocale: 'public/locale',
    // 源代码扫描目录
    source: 'src',
    // .ts/.js 文件中 t 函数的导入路径
    tImport: '@/plugins/locale',
    // 翻译词表文件（命中条目跳过 LLM 直接采用）
    glossary: 'src/locale/glossary.json',
  },

  // LLM API 配置
  llm: {
    // ID 生成接口
    default: {
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
    // 路径前缀保留的最大目录层级数，默认 0（不限制，保留 anchor 之后到文件目录的全部段）
    // 注意：设置了 value 固定前缀时本字段不生效
    // maxDepth: 0,
    // 中文常用词映射表（用于本地 ID 兜底生成，可扩展）
    // chineseMappings: { '确认': 'confirm', '取消': 'cancel', ... },
  },

  // 并发控制
  concurrency: {
    // ID 生成最大并发数
    idGeneration: 5,
    // 翻译最大并发数
    translation: 5,
  },

  // 翻译批次大小（每次发送给 LLM 的条目数）
  batchSize: 30,

  // 翻译批次间延时（毫秒），默认 500
  batchDelay: 500,

  // 转换后是否自动格式化代码（Prettier + ESLint），默认 true
  format: false,

  // 文件过滤 glob 模式（扫描哪些文件）
  include: ['**/*.vue', '**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],

  // 排除的目录或文件
  exclude: ['node_modules', 'dist', 'build', '.git', 'public', 'src/components'],

  // 翻译词表选项（仅 paths.glossary 配置时生效）
  glossary: {
    override: 'always',
    normalize: true,
  },

  // 导出格式配置（仅影响 export 输出，内部工作文件不受影响）
  output: {
    // 'flat'（默认）: { "views__demo__title": "标题" }
    // 'nested': { "views": { "demo": { "title": "标题" } } }
    format: 'flat',
  },

  // 模块化导出（可选）
  // 配置后 export 命令会把 key 按规则分桶到子目录，并生成 manifest.json
  // modules: {
  //   rules: [
  //     // 按源码路径匹配（glob）——key 前缀会反推为虚拟 filePath
  //     // views__demo__* → src/views/demo/index，可被 glob 命中
  //     { name: 'demo', match: 'src/views/demo/**' },
  //   ],
  //   defaultModule: 'common',
  //   manifest: true,
  //   layout: 'by-locale', // public/locale/zh-CN/demo.json
  // },
});
