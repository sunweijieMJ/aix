import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from '@kit/i18n-tools';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// @kit/i18n-tools 配置
//
// 字段分组：
//   root        项目根（绝对路径）
//   framework   框架 + i18n 库 + t 导入路径（判别 union）
//   locales     源 / 目标语种（targets 数组化以支持多目标）
//   io          目录 / 扫描 / 落盘
//   keys        i18n key 派生（前缀 + 兜底 + 复用）
//   extract     文本提取扩展点（filterPatterns 等）
//   glossary    翻译词表
//   llm         LLM API 与任务并发（idGeneration / translation 各自配置）
//   buckets     分桶导出（可选）
//   merge       合并阶段（LLM 拒收策略）
//   ci          CI 集成（coverageThreshold）
// =============================================================================

export default defineConfig({
  // 项目根目录（绝对路径）。所有相对路径以此为基准。
  root: __dirname,

  // ---- 框架 ---------------------------------------------------------------
  // type='vue' 与 type='react' 是封闭判别 union，loader 会校验 library 与 type
  // 是否匹配（防止 type='react' 误配 vue-i18n 这类错配）。
  framework: {
    type: 'vue',
    // 可选：'vue-i18n' | 'vue-i18next'。默认 'vue-i18n'。
    library: 'vue-i18n',
    // t 函数的导入路径。
    // - .ts/.js 文件由工具直接 `import { t } from '<tImport>'`
    // - .vue <script setup> 也走模块顶层 import（不注入 useI18n hook）
    // 这里指向项目自有的 '@/plugins/locale'，与默认 '@/i18n' 不同。
    tImport: '@/plugins/locale',
    // 命名空间（仅 vue-i18next 生效；vue-i18n 路径无效）
    namespace: '',
  },

  // ---- 语言 ---------------------------------------------------------------
  // targets 是数组，支持多目标语种；翻译/词表/落盘流程对每个 target
  // 单独处理。targets 不能包含 source。
  locales: {
    source: 'zh-CN',
    targets: ['en-US'],
    // 可选：扩展 LLM prompt 中的语种展示名（覆盖内置 LOCALE_NAMES 表）
    // names: { 'zh-CN': 'Simplified Chinese' },
  },

  // ---- IO -----------------------------------------------------------------
  // 所有目录 / 扫描 / 落盘相关字段聚合于此。
  io: {
    // 源代码扫描根目录（相对 root）
    sourceDir: 'src',
    // 主语言文件工作目录（generate / merge 读写此目录）
    localesDir: 'src/locale',
    // export 模式的发布目录。
    // 未配置时禁用 export 命令；automatic 流程会跳过 export 步骤。
    exportDir: 'public/locale',
    // 可选：自定义译文 override 目录。仅在 CLI --custom 时启用。
    // customDir: 'src/locale-custom',

    // 文件扫描 include glob（相对 root 做匹配）
    include: ['**/*.vue', '**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
    // 排除目录与文件：单段名（如 'node_modules'）走 literal 匹配，
    // 含 `*/?` 的模式走 picomatch glob 匹配。
    // 默认值会额外排除 *.config.* / 测试 / Storybook 等，可按需追加。
    // 注：exclude 按「目录/文件 basename 单段」匹配，无法用 'src/components' 这类路径限定，
    // 只能写目录名 'components'（命中任意层级的 components 目录）。
    exclude: ['node_modules', 'dist', 'build', '.git', 'public', 'components'],

    // 语言文件序列化格式：
    //   'flat'  : { "views__demo__title": "标题" }
    //   'nested': { "views": { "demo": { "title": "标题" } } } —— 要求 separator='.'
    // 本项目使用 'flat' + separator='__'，对已有 locale 文件保持兼容。
    format: 'flat',
    // JSON 缩进字符数，默认 2
    // indent: 2,
    // 转换后是否过 Prettier 美化
    prettify: false,
  },

  // ---- Keys ---------------------------------------------------------------
  // i18n key 的派生（前缀） + 兜底（fallback） + 复用（reuse） 全部聚合于此。
  keys: {
    // 段分隔符。'flat' 模式下可自由选择；'nested' 模式下必须为 '.'。
    separator: '__',
    // 前缀派生策略（显式 strategy，四选一）
    prefix: {
      // 'path'   : 从 anchor 之后的目录段派生（默认）
      // 'fixed'  : 所有 key 共用同一前缀 value（绕过路径）
      // 'custom' : 用户函数返回前缀段数组
      // 'rules'  : 按文件路径分派到不同子策略（pages/components/utils 各走各的）
      strategy: 'path',
      // anchor 目录名，定位前缀起点。
      // 例（anchor='src'，无 skip/take）：
      //   src/views/demo/test-i18n.vue → ['views', 'demo']
      anchor: 'src',
      // 可选：跳过 anchor 之后前 N 段（用于剥离 pages / views 这类壳目录）
      // skip: 0,
      // 可选：保留 N 段（0 = 不限制）
      // take: 0,
      // 可选：将文件名（去扩展名）作为前缀最后一段
      // includeFile: false,
      // 可选：文件名段大小写策略：'as-is' | 'camel' | 'kebab' | 'snake' | fn
      // fileNameCase: 'camel',
      // 可选：保留段中的连字符（默认 true：'flipped-course' 原样保留）。
      //       设为 false 时连字符会被抹掉（'flipped-course' → 'flippedcourse'）。
      // preserveHyphens: true,
      // 可选：index.* 文件处理（仅 includeFile=true 时生效）。
      //   'collapse-to-parent'（默认）：'TagInput/index.vue' → ['components', 'TagInput']
      //   'as-is'                    : 'TagInput/index.vue' → ['components', 'TagInput', 'index']
      // indexFile: 'collapse-to-parent',
      // 可选：段级 transform 钩子。返回 null 删除该段。
      // transform: (seg, idx, ctx) => seg,
    },
    // ↓ 多目录差异化派生时使用 strategy='rules'：
    // prefix: {
    //   strategy: 'rules',
    //   rules: [
    //     // pages 取 3 段（壳目录 + 业务名 + 一级子目录）
    //     { match: 'src/pages/**',
    //       use: { strategy: 'path', anchor: 'src', take: 3 } },
    //     // components 不限层级，文件名作为末段，index.* 折叠到父目录
    //     { match: 'src/components/**',
    //       use: { strategy: 'path', anchor: 'src', includeFile: true, fileNameCase: 'as-is' } },
    //     // utils 不限层级，把 'confirm.js' 的 confirm 作为末段
    //     { match: 'src/utils/**',
    //       use: { strategy: 'path', anchor: 'src', includeFile: true, fileNameCase: 'as-is' } },
    //   ],
    //   fallback: { strategy: 'path', anchor: 'src' },  // 未命中时使用，可省略
    // },
    // 可选：语义部分兜底（LLM 失败 / --skip-llm 时使用）。
    // extend=true 时与内置 BUILTIN_CN_MAPPINGS 合并（默认 18 条：确认 / 取消 / ...）。
    // fallback: {
    //   extend: true,
    //   mappings: { 自定义术语: 'customTerm' },
    // },
    // 可选：跨目录复用 key。
    // reuse: {
    //   acrossDirectories: false,        // true 表示同原文跨目录共享同一个 key
    //   promoteToCommon: { threshold: 3, namespace: 'common' }, // 被 ≥N 个目录复用时归入 common
    // },
    // 可选：doctor 跳过的动态 key 前缀（避免 t(prefix + name) 误报 missing-key）
    // dynamicKeyAllowlist: ['common__', /^views__\w+__dynamic_/],
    // 可选：doctor untranslated 判定的 skip 函数（返回 true 即跳过）
    // skip: (key, message) => key.startsWith('debug__'),
  },

  // ---- 文本提取扩展（可选）------------------------------------------------
  // extract: {
  //   // 命中任一 RegExp 的字符串将被过滤掉（在工具内置过滤之后才生效，无法绕过安全规则）
  //   filterPatterns: [/^[A-Z_]+$/, /^#[0-9a-fA-F]{3,8}$/],
  // },

  // ---- 词表 ---------------------------------------------------------------
  // 命中条目直接采用词表译文，跳过 LLM 调用；可同时给多 target 提供译文：
  //   { "提交": { "en-US": "Submit", "ja-JP": "送信" } }
  // 或简化形式（仅作用于 targets[0]）：
  //   { "提交": "Submit" }
  glossary: {
    // 词表文件路径（相对 root）。未配置时禁用词表功能。
    file: 'src/locale/glossary.json',
    // 'always' : 词表译文优先，与已有 target 不同时覆盖
    // 'when-empty' : 仅在 target 缺失/为空时采用词表
    override: 'always',
    // 是否对原文做 trim + 空白压缩后再匹配
    normalize: true,
  },

  // ---- LLM ----------------------------------------------------------------
  // shared 的字段作为 idGeneration / translation 的默认值，任务级可单独覆盖。
  // 多模型混用：在任务级覆盖 model / baseURL / apiKey 即可（例如 ID 用 deepseek，
  // 翻译用 gpt-4o）。
  llm: {
    shared: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
      // 超时（毫秒），默认 60000
      timeout: 60000,
      // 最大重试次数，默认 2
      maxRetries: 2,
      // 温度参数，控制输出随机性，默认 0.1
      temperature: 0.1,
      // 可选：透传到 OpenAI SDK 的 defaultHeaders（用于私有部署 dialect）
      // headers: { 'X-Tenant-Id': 'abc' },
    },
    // ID 生成任务：concurrency / batchSize / throttleMs 在任务级配置，
    // idGeneration 与 translation 可独立调优。
    idGeneration: {
      concurrency: 5,
      batchSize: 30,
      // 批次间最小间隔（毫秒），用于规避 LLM 限流
      throttleMs: 500,
      // 可选：覆盖默认 prompt
      // prompt: { system: '...', user: 'Generate IDs for {count}:\n{textList}' },
    },
    // 翻译任务
    translation: {
      concurrency: 5,
      batchSize: 30,
      throttleMs: 500,
      // 可选：覆盖默认 prompt
      // prompt: { system: '...', user: 'Translate:\n{jsonText}' },
    },
  },

  // ---- 分桶导出（可选）---------------------------------------------------
  // 配置后 generate / merge / export 会把 key 按规则分桶到子目录，并可选生成 manifest.json。
  // 反推策略：从 key 前缀（path 派生）重建虚拟 filePath 做匹配；fixed prefix
  // 场景请改用 matchKey（loader 会警告）。
  // buckets: {
  //   rules: [
  //     // 按源码路径匹配（glob / RegExp / 函数）
  //     { name: 'demo', match: 'src/views/demo/**' },
  //     // 按 key 内容匹配（与 match 互斥）
  //     // { name: 'errors', matchKey: (key) => key.endsWith('__error') },
  //   ],
  //   defaultBucket: 'common',     // 未命中规则的 key 落入此桶
  //   emitManifest: true,           // 生成 manifest.json（默认 true）
  //   layout: 'by-locale',          // 'by-locale': <lang>/<bucket>.json
  //                                 // 'by-bucket': <bucket>/<lang>.json
  // },

  // ---- 合并阶段（可选）---------------------------------------------------
  // merge: {
  //   // 'fallback-to-source'（默认）：LLM 拒收条目（如纯标点）用源文本兜底
  //   // 'warn-only'：仅在 RunReport 警告，不合并；条目卡在 untranslated.json 等人工处理
  //   onLlmRejected: 'fallback-to-source',
  // },

  // ---- CI 集成（可选）---------------------------------------------------
  // ci: {
  //   // generate 完成后若覆盖率低于该百分比（0-100）则以非零状态码退出。
  //   // CLI `--coverage-threshold` 优先级更高，未传时回退到此字段。
  //   coverageThreshold: 95,
  // },
});
