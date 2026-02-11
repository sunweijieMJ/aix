# @kit/i18n-tools

Vue/React 项目国际化自动化工具集，支持中文提取、语义化 ID 生成、AI 翻译和代码转换。

## 特性

- **多框架支持** - Vue (`vue-i18n`, `vue-i18next`) 和 React (`react-intl`, `react-i18next`)
- **多语言支持** - 支持中英日韩等多种语言翻译
- **智能提取** - 自动扫描源码中的中文文本，支持 JSX、模板、脚本等多种上下文
- **语义化 ID** - 基于 LLM 生成有意义的国际化 key，支持本地兜底策略
- **AI 翻译** - 集成 OpenAI 兼容 API（支持 OpenAI/DeepSeek/Azure 等）
- **完整工作流** - 从提取到导出的一站式自动化流程
- **增量处理** - 支持增量运行，避免重复处理已国际化的内容

## 安装

```bash
pnpm add @kit/i18n-tools -D
```

## 快速开始

### 1. 创建配置文件

在项目根目录创建配置文件（支持 `i18n.config.ts`、`i18n.config.js`、`i18n.config.mjs`）：

```typescript
import { defineConfig } from '@kit/i18n-tools';

export default defineConfig({
  // 项目根目录（必填）
  rootDir: __dirname,

  // 框架类型：'vue' | 'react'
  framework: 'vue',

  // 路径配置
  paths: {
    locale: 'src/locale',           // 主语言文件目录
    customLocale: 'src/overrides/locale', // 定制语言文件目录
    exportLocale: 'public/locale',  // 导出目录
    source: 'src',                  // 源码扫描目录
    tImport: '@/plugins/locale',    // t 函数导入路径
  },

  // LLM API 配置（必填）
  llm: {
    idGeneration: {
      apiKey: process.env.LLM_API_KEY!,
      model: 'gpt-4o',
      // baseURL: 'https://api.deepseek.com', // 非 OpenAI 服务需设置
    },
    translation: {
      apiKey: process.env.LLM_API_KEY!,
      model: 'gpt-4o',
    },
  },
});
```

### 2. 设置环境变量

创建 `.env` 文件：

```bash
LLM_API_KEY=sk-your-api-key
```

### 3. 运行工具

```bash
# 交互模式（推荐首次使用）
npx i18n-tools -i

# 全自动流程
npx i18n-tools --mode automatic

# 指定模式
npx i18n-tools --mode generate
```

## 命令行用法

```bash
i18n-tools [选项]
```

### 选项

| 选项 | 别名 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | - | 配置文件路径 | `i18n.config.ts` |
| `--mode` | `-m` | 操作模式 | `generate` |
| `--custom` | `-c` | 操作定制目录 | `false` |
| `--interactive` | `-i` | 交互模式 | 未指定 mode 时开启 |
| `--skip-llm` | - | 跳过 LLM，使用本地 ID 生成 | `false` |
| `--help` | `-h` | 显示帮助 | - |

### 操作模式

| 模式 | 说明 |
|------|------|
| `automatic` | 全自动流程 - 一键完成从提取到导出的所有步骤 |
| `generate` | 代码生成 - 扫描源码提取中文并生成国际化调用 |
| `pick` | 提取待翻译 - 从国际化文件中提取未翻译条目 |
| `translate` | AI 翻译 - 调用 AI 服务将中文翻译为英文 |
| `merge` | 合并翻译 - 将翻译结果合并回主文件 |
| `restore` | 代码还原 - 将国际化调用还原为中文 |
| `export` | 语言包导出 - 生成最终的多语言文件 |

### 使用示例

```bash
# 扫描单个文件
npx i18n-tools -m generate
# 然后输入文件路径：src/views/Login.vue

# 扫描整个目录
npx i18n-tools -m generate
# 然后输入目录路径：src/views

# 处理定制目录的翻译
npx i18n-tools -m merge --custom

# 跳过 LLM（使用本地 ID 生成策略）
npx i18n-tools -m generate --skip-llm

# 指定配置文件
npx i18n-tools --config ./config/i18n.config.ts -m automatic
```

## 工作流程

完整的国际化工作流程如下：

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            automatic 模式                                  │
│                      (自动按顺序执行以下所有步骤)                            │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌────────┐    ┌──────┐ │
│  │ generate │ -> │   pick   │ -> │ translate │ -> │ merge  │ -> │export│ │
│  └──────────┘    └──────────┘    └───────────┘    └────────┘    └──────┘ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│                              restore 模式                                   │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────┐    ┌───────────────┐                                        │
│  │ restore  │ -> │ 还原后的源文件  │   (generate 的逆向操作)                 │
│  └──────────┘    └───────────────┘                                        │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### 各步骤说明

1. **generate** - 扫描源文件，提取中文文本，生成语义化 ID，转换代码
   - 输入：`.vue`/`.tsx`/`.jsx`/`.ts`/`.js` 源文件
   - 输出：转换后的源文件 + `zh-CN.json` 语言文件

2. **pick** - 从语言文件中提取未翻译的条目
   - 输入：`zh-CN.json` + `en-US.json`
   - 输出：`untranslated.json`（待翻译）+ `translations.json`（已翻译）

3. **translate** - 调用 AI 服务翻译
   - 输入：`untranslated.json`
   - 输出：`untranslated.json`（已填充翻译）

4. **merge** - 将翻译结果合并回主文件
   - 输入：`untranslated.json`
   - 输出：`en-US.json`（目标语言文件）

5. **export** - 导出最终语言包
   - 输入：主目录 + 定制目录的语言文件
   - 输出：`public/locale/` 下的最终语言包

6. **restore** - 将国际化调用还原为中文
   - 输入：已国际化的源文件 + `zh-CN.json`
   - 输出：还原后的源文件（默认输出到 `<rootDir>/restored/`）

## 配置参考

### 完整配置接口

```typescript
interface I18nToolsConfig {
  /** 项目根目录（绝对路径） */
  rootDir: string;

  /** 框架类型 */
  framework: 'vue' | 'react';

  /** Vue 框架配置 */
  vue?: {
    library?: 'vue-i18n' | 'vue-i18next';  // 默认 'vue-i18n'
    namespace?: string;                     // vue-i18next 命名空间
  };

  /** React 框架配置 */
  react?: {
    library?: 'react-intl' | 'react-i18next';  // 默认 'react-i18next'
    namespace?: string;                         // react-i18next 命名空间
  };

  /** 语言配置 */
  locale?: {
    source?: string;  // 源语言代码，默认 'zh-CN'
    target?: string;  // 目标语言代码，默认 'en-US'
  };

  /** 路径配置 */
  paths: {
    locale: string;         // 主语言文件目录
    customLocale?: string;  // 定制语言文件目录
    exportLocale?: string;  // 导出目录
    source: string;         // 源码扫描目录
    tImport?: string;       // t 函数导入路径
  };

  /** LLM API 配置 */
  llm: {
    idGeneration: LLMConfig;   // ID 生成 API
    translation: LLMConfig;    // 翻译 API
  };

  /** 自定义 AI 提示词 */
  prompts?: {
    idGeneration?: { system?: string; user?: string };
    translation?: { system?: string; user?: string };
  };

  /** ID 前缀配置 */
  idPrefix?: {
    anchor?: string;                        // 锚点目录，默认 'src'
    value?: string;                         // 自定义固定前缀
    separator?: string;                     // 分隔符，默认 '__'
    chineseMappings?: Record<string, string>; // 中文常用词映射
  };

  /** 并发控制 */
  concurrency?: {
    idGeneration?: number;  // ID 生成并发数，默认 5
    translation?: number;   // 翻译并发数，默认 3
  };

  /** 翻译批次大小，默认 10 */
  batchSize?: number;

  /** 批次间延时（毫秒），默认 500 */
  batchDelay?: number;

  /** 是否自动格式化代码，默认 true */
  format?: boolean;

  /** 文件包含模式，默认 ['**/*.vue', '**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'] */
  include?: string[];

  /** 排除目录/文件，默认 ['node_modules', 'dist', 'build', '.git', 'public'] */
  exclude?: string[];
}
```

### LLM 配置

```typescript
interface LLMConfig {
  /** API 密钥 */
  apiKey: string;

  /** 模型名称 */
  model: string;

  /** API 地址（非 OpenAI 服务时需设置） */
  baseURL?: string;

  /** 超时时间（毫秒），默认 60000 */
  timeout?: number;

  /** 最大重试次数，默认 2 */
  maxRetries?: number;

  /** 温度参数，默认 0.1 */
  temperature?: number;
}
```

### 配置示例

#### Vue + vue-i18n（默认）

```typescript
export default defineConfig({
  rootDir: __dirname,
  framework: 'vue',
  paths: {
    locale: 'src/locale',
    source: 'src',
  },
  llm: {
    idGeneration: { apiKey: process.env.LLM_API_KEY!, model: 'gpt-4o' },
    translation: { apiKey: process.env.LLM_API_KEY!, model: 'gpt-4o' },
  },
});
```

#### React + react-intl

```typescript
export default defineConfig({
  rootDir: __dirname,
  framework: 'react',
  react: {
    library: 'react-intl',
  },
  paths: {
    locale: 'src/locales',
    source: 'src',
    tImport: '@/utils/intl',
  },
  llm: {
    idGeneration: { apiKey: process.env.LLM_API_KEY!, model: 'gpt-4o' },
    translation: { apiKey: process.env.LLM_API_KEY!, model: 'gpt-4o' },
  },
});
```

#### 使用 DeepSeek API

```typescript
export default defineConfig({
  rootDir: __dirname,
  framework: 'vue',
  paths: {
    locale: 'src/locale',
    source: 'src',
  },
  llm: {
    idGeneration: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
    },
    translation: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
    },
  },
});
```

## 框架支持

### Vue

**支持的文件类型**：`.vue`、`.ts`、`.js`

**支持的 i18n 库：**

| 库 | 模板代码 | 脚本代码 |
|---|---|---|
| `vue-i18n` | `$t('key')` | `t('key')` (via `useI18n()`) |
| `vue-i18next` | `$t('ns:key')` | `t('ns:key')` |

**支持的上下文：**

| 上下文 | 转换前 | 转换后 |
|--------|--------|--------|
| 模板文本节点 | `<span>中文</span>` | `<span>{{ $t('key') }}</span>` |
| 模板插值 | `{{ "中文" }}` | `{{ $t('key') }}` |
| 静态属性 | `<div title="中文">` | `<div :title="$t('key')">` |
| 动态属性 | `:placeholder="'中文'"` | `:placeholder="$t('key')"` |
| script 代码 | `const msg = '中文'` | `const msg = t('key')` |

### React

**支持的文件类型**：`.tsx`、`.jsx`、`.ts`、`.js`

**支持的 i18n 库：**

| 库 | 函数调用 | JSX 组件 |
|---|---|---|
| `react-intl` | `intl.formatMessage({ id: 'key' })` | `<FormattedMessage id="key" />` |
| `react-i18next` | `t('key')` | `<Trans i18nKey="key" />` |

**支持的上下文：**

| 上下文 | 转换前 | 转换后 |
|--------|--------|--------|
| JSX 文本 | `<span>中文</span>` | `<span>{t('key')}</span>` |
| JSX 属性 | `<Input placeholder="中文" />` | `<Input placeholder={t('key')} />` |
| JS 代码 | `const msg = '中文'` | `const msg = t('key')` |

## API 参考

除 CLI 外，也可以程序化调用：

```typescript
import {
  defineConfig,
  loadConfig,
  GenerateProcessor,
  TranslateProcessor,
  AutomaticProcessor,
} from '@kit/i18n-tools';

// 加载配置
const config = await loadConfig('./i18n.config.ts');

// 使用处理器
const processor = new GenerateProcessor(config, false);
await processor.execute('src/views/Login.vue');

// 全自动流程
const auto = new AutomaticProcessor(config, false);
await auto.execute('src/views', false);
```

### 导出的处理器

| 处理器 | 说明 |
|--------|------|
| `GenerateProcessor` | 代码生成处理器 |
| `PickProcessor` | 提取待翻译处理器 |
| `TranslateProcessor` | 翻译处理器 |
| `MergeProcessor` | 合并翻译处理器 |
| `ExportProcessor` | 导出处理器 |
| `RestoreProcessor` | 还原处理器 |
| `AutomaticProcessor` | 全自动处理器 |

### 导出的工具类

| 工具类 | 说明 |
|--------|------|
| `FileUtils` | 文件操作工具 |
| `LoggerUtils` | 日志工具 |
| `LLMClient` | LLM API 客户端 |
| `IdGenerator` | ID 生成器 |
| `LanguageFileManager` | 语言文件管理 |

## 生成的文件结构

```
src/locale/                 # 主语言文件目录
├── zh-CN.json              # 源语言文件（generate 生成/更新）
├── en-US.json              # 目标语言文件（merge 更新）
├── untranslated.json       # 待翻译条目（pick 生成，translate 填充）
└── translations.json       # 已翻译条目（pick 生成，merge 读取）

src/overrides/locale/       # 定制目录（--custom 模式）
├── zh-CN.json              # 定制源语言文件
├── en-US.json              # 定制目标语言文件
├── untranslated.json       # 定制待翻译条目
└── translations.json       # 定制已翻译条目

public/locale/              # 导出目录（export 生成）
├── zh-CN.json              # 合并后的最终源语言包
└── en-US.json              # 合并后的最终目标语言包
```

**文件说明**：
- `untranslated.json` 和 `translations.json` 是工作流中间文件，可在发布时忽略
- `export` 会合并主目录和定制目录的语言文件，检测 key 冲突

## 常见问题

### Q: 如何跳过已国际化的文本？

工具会自动检测源文件中已有的 `t()`/`$t()` 调用，避免重复处理。

### Q: 如何处理动态文本（带变量）？

工具会自动识别模板字符串中的变量：

```typescript
// 源码
const msg = `欢迎 ${username}`;

// 转换后
const msg = t('welcome_user', { username });

// 语言文件
{ "welcome_user": "欢迎 {username}" }
```

### Q: LLM 调用失败怎么办？

- 使用 `--skip-llm` 参数启用本地 ID 生成策略
- 检查 API Key 和网络连接
- 调整 `concurrency` 和 `batchSize` 减少并发压力

**本地 ID 生成策略**：
1. 优先匹配内置的 18 个中文常用词映射（确认→confirm、取消→cancel 等）
2. 包含常用词时，使用 `映射词_哈希` 格式
3. 纯英文文本直接转为 camelCase
4. 其他中文使用 `t_哈希` 格式
5. 自动添加目录前缀保证唯一性

### Q: 如何自定义 ID 前缀？

```typescript
export default defineConfig({
  // ...
  idPrefix: {
    anchor: 'src',           // 从 src 目录开始提取路径
    separator: '__',          // 分隔符
    // value: 'myapp',        // 使用固定前缀（覆盖路径提取）
    chineseMappings: {        // 自定义中文词映射（用于本地 ID 生成兜底）
      '确认': 'confirm',
      '取消': 'cancel',
      // ...
    },
  },
});
```

生成的 ID 格式：`views__login__welcomeMessage`

**内置的中文常用词映射**（18 个）：

| 中文 | 英文 | 中文 | 英文 | 中文 | 英文 |
|------|------|------|------|------|------|
| 确认 | confirm | 取消 | cancel | 删除 | delete |
| 添加 | add | 编辑 | edit | 保存 | save |
| 提交 | submit | 搜索 | search | 登录 | login |
| 退出 | logout | 成功 | success | 失败 | failed |
| 错误 | error | 警告 | warning | 提示 | tip |
| 用户 | user | 请输入 | please_input | 请选择 | please_select |

### Q: restore 模式会覆盖原文件吗？

默认不会。还原后的文件输出到 `<rootDir>/restored/` 目录。如果需要覆盖原文件，可以在程序化调用时设置 `overwrite: true`。

### Q: 如何配置不同的源语言和目标语言？

```typescript
export default defineConfig({
  // ...
  locale: {
    source: 'ja-JP',  // 日语作为源语言
    target: 'en-US',  // 英语作为目标语言
  },
});
```
