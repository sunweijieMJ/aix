// markdownlint-cli2 配置文件 (ES Module)
// 文档: https://github.com/DavidAnson/markdownlint-cli2

const config = {
  // Glob 模式 - 要检查的文件
  globs: ['**/*.md'],

  // 忽略模式 - 不检查的文件或目录
  ignores: [
    'node_modules',
    '**/node_modules/**',
    'dist',
    'docs',
    'coverage',
    '.git',
    'CHANGELOG.md',
  ],

  // Markdownlint 规则配置
  config: {
    default: true,
    MD009: false, // no-trailing-spaces - 允许尾随空格
    MD013: false, // line-length - 不限制行长度
    MD022: false, // blanks-around-headings - 标题周围空行
    MD024: false, // no-duplicate-heading - 允许重复标题
    MD026: false, // no-trailing-punctuation - 标题末尾标点
    MD029: false, // ol-prefix - 有序列表前缀
    MD031: false, // blanks-around-fences - 代码块周围空行
    MD032: false, // blanks-around-lists - 列表周围空行
    MD033: false, // no-inline-html - 允许内联 HTML
    MD034: false, // no-bare-urls - 允许裸 URL
    MD036: false, // no-emphasis-as-heading - 强调作为标题
    MD058: false, // blanks-around-tables - 表格周围空行
    MD040: false, // fenced-code-language - 代码块语言
    MD041: false, // first-line-heading - 第一行必须是标题
    MD060: false, // table-column-style - 表格列样式（禁用严格的空格检查）
  },
};

export default config;
