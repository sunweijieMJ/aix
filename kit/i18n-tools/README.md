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
- **分桶导出** - 按 glob 规则将语言文件分桶到 `<lang>/<bucket>.json`，适合大项目按业务域拆分
- **翻译词表** - 支持术语表（glossary），命中词条直接复用译文，跳过 LLM 调用
- **嵌套输出** - 可选按 ID 分隔符生成树形 JSON，便于人工浏览大型语言包
- **事务式写入** - generate 阶段先在内存完成全部 transform，全部成功后才落盘源码与语言文件，避免失败留下孤儿 key
- **Dry-run 预览** - `--dry-run` 生成 plan 文件供 review，`--apply-plan` 回放已审核结果（指纹校验防止源码漂移）
- **覆盖率指标** - generate 完成输出覆盖率 summary，支持 `--coverage-threshold` 在 CI 卡点
- **健康体检** - `doctor` 子命令做 locale 结构 lint + 三类对账（孤儿 key / 缺失 key / 未翻译）
- **CSV 人工翻译/审核闭环** - 把待翻译/已翻译条目导出为单文件 CSV（语言为列）发人翻译或审核，改完回流写回，作为 `translate` 的人工平替

## 安装

```bash
pnpm add @kit/i18n-tools -D
```

## 快速开始

### 1. 创建配置文件

在项目根目录创建配置文件（支持 `.ts` / `.mts` / `.cts` / `.mjs` / `.cjs` / `.js`）：

```typescript
import { defineConfig } from '@kit/i18n-tools';

export default defineConfig({
  // 项目根目录（必填）
  root: __dirname,

  // 框架配置（折叠 type + library + namespace + tImport）
  framework: {
    type: 'vue',                 // 'vue' | 'react'
    library: 'vue-i18n',         // 与 type 联合校验
    tImport: '@/i18n',           // t 函数导入路径
  },

  // 语言：targets 数组化，支持多目标
  locales: {
    source: 'zh-CN',         // 默认 'zh-CN'
    targets: ['en-US'],      // 默认 ['en-US']；可多目标如 ['en-US', 'ja-JP']
  },

  // IO：所有目录 / 扫描 / 落盘聚合于此
  io: {
    sourceDir: 'src',
    localesDir: 'src/i18n',
    exportDir: 'public/locale',  // 可选，未配置即禁用 export
    customDir: undefined,        // 可选定制目录
    format: 'nested',            // JSON 落盘格式
    prettify: true,              // 是否过 Prettier
  },

  // LLM 配置：shared 为共享基线，任务级独立覆盖
  llm: {
    shared: {
      apiKey: process.env.LLM_API_KEY,
      model: 'gpt-4o',
      // baseURL: 'https://api.deepseek.com', // 非 OpenAI 服务需设置
    },
    // 如需为两个任务使用不同模型，可单独指定：
    // idGeneration: { model: 'gpt-4o-mini' },
    // translation:  { model: 'gpt-4o' },
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

#### 基本选项

| 选项 | 别名 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | - | 配置文件路径 | 自动发现 `i18n.config.{ts,mts,cts,mjs,cjs,js}` |
| `--mode` | `-m` | 操作模式 | `generate` |
| `--custom` | `-c` | 操作定制目录 | `false` |
| `--interactive` | `-i` | 交互模式 | 未指定 mode 时开启 |
| `--skip-llm` | - | 跳过 LLM，使用本地 ID 生成 | `false` |
| `--help` | `-h` | 显示帮助 | - |

#### CI / Review 选项

| 选项 | 说明 | 适用模式 |
|------|------|---------|
| `--dry-run` | 生成 plan 但不修改源码与语言文件（用于 review）；csv-import / prune 下表示仅预览不写回 | `generate` / `csv-import` / `prune` |
| `--apply-plan <path \| latest>` | 从指定 plan 回放，跳过 LLM 与 AST 解析；传 `latest` 自动找最近一次 | `generate` |
| `--keep-plan` | apply 成功后保留 plan 目录（默认会自动清理） | `generate` |
| `--plan-output-dir <dir>` | 自定义 dry-run 输出根目录（绕开 Windows 长路径等问题） | `generate` |
| `--coverage-threshold <num>` | 覆盖率低于该百分比（0-100）则以退出码 2 退出 | `generate` / `automatic` |
| `--ci` | doctor：发现 error 级问题时非零退出；csv-import / prune：跳过 y/N 确认直接执行 | `doctor` / `csv-import` / `prune` |

#### CSV 选项

| 选项 | 说明 | 适用模式 |
|------|------|---------|
| `--source <untranslated\|translations>` | 导出数据源：`untranslated`（待翻，默认）/ `translations`（审核已翻） | `csv-export` |
| `--filter <all\|untranslated\|translated>` | 按所选语言列过滤行（判据 `isValidTranslation`），默认 `all` | `csv-export` |
| `--langs <a,b>` | 限定目标语言（逗号分隔）；不传 = 全部 `targets` | `csv-export` / `csv-import` |
| `--output <path>` | export：输出路径/目录（默认 `<localesDir>/i18n.csv`）；import：输入 CSV 文件 | `csv-export` / `csv-import` |

### 操作模式

| 模式 | 说明 |
|------|------|
| `automatic` | 全自动流程 - 一键完成从提取到导出的所有步骤 |
| `generate` | 代码生成 - 扫描源码提取中文并生成国际化调用 |
| `pick` | 提取待翻译 - 从国际化文件中提取未翻译条目 |
| `translate` | AI 翻译 - 调用 AI 服务将中文翻译为英文 |
| `csv-export` | CSV 导出 - 把待翻译/已翻译条目导出为 CSV 发人翻译/审核（translate 的人工平替） |
| `csv-import` | CSV 回流 - 把翻译/审核好的 CSV 写回（按 key 归属自动路由到 `untranslated.json` / `translations.json`） |
| `merge` | 合并翻译 - 将翻译结果合并回主文件 |
| `restore` | 代码还原 - 将国际化调用还原为中文 |
| `export` | 语言包导出 - 生成最终的多语言文件 |
| `doctor` | 健康检查 - 体检 locale 文件结构与源码对账 |
| `prune` | 清理孤儿 key - 删除源码已不再引用的 locale 条目（dry-run + 确认） |

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

# Dry-run：生成 plan 文件供 review，不修改源码
npx i18n-tools -m generate --dry-run
#   → 输出 .i18n-tools/plans/generate-<ts>-<pid>/{plan.json, sources/}

# 回放最近一次 dry-run（推荐：无需粘贴长路径）
npx i18n-tools -m generate --apply-plan latest

# 回放指定 plan（支持传目录或 plan.json 路径；apply 完成默认清理 plan 目录）
npx i18n-tools -m generate --apply-plan .i18n-tools/plans/.../plan.json

# 想保留 plan 用于事后审计 / PR 附件
npx i18n-tools -m generate --apply-plan latest --keep-plan

# CI 卡覆盖率：低于 95% 则以退出码 2 退出
npx i18n-tools -m generate --coverage-threshold 95

# 健康体检
npx i18n-tools -m doctor

# CI 模式体检（发现 error 即非零退出）
npx i18n-tools -m doctor --ci
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
   - 输出：还原后的源文件（默认输出到 `<root>/restored/`）

> 💡 中间的 **translate（AI 翻译）可换成人工翻译**：`pick` 后用 `csv-export` 导出 → 人工翻译/审核 → `csv-import` 回流写回 `untranslated.json` → 照常 `merge`。详见下节。

## CSV 人工翻译/审核闭环

把待翻译（或已翻译）条目导出为 CSV 发给他人翻译/审核，改完回流——相当于用人工翻译替换 `translate` 那步（参数详见 [CSV 选项](#csv-选项)）：

```bash
# 1. 导出：默认读 untranslated.json，写到 <localesDir>/i18n.csv（一个文件、语言为列）
i18n-tools --mode csv-export                  # 全部目标语言
i18n-tools --mode csv-export --langs en-US    # 只导 en-US
i18n-tools --mode csv-export --source translations  # 审核已有译文（读 translations.json）

# 2. 人工在 CSV 里填/改译文（Excel 可直接打开）

# 3. 回流：写回 untranslated.json，再跑 merge 晋升
i18n-tools --mode csv-import --output src/i18n/i18n.csv   # 加 --dry-run 仅预览
i18n-tools --mode merge
```

- **列结构**：单语言 `key, 源语言, 目标语言, reason`；多语言 `key, 源语言, <各语言列>`（无 reason）。`reason` 仅在目标值是「非空垃圾值」时标 `invalid`，其余留空。
- **编码**：UTF-8 带 BOM，Excel 直接打开不乱码。**修改后请「另存为 CSV UTF-8」**，否则回流会因非法编码报错。
- **回流保守合并**：只有非空译文才写回，空单元格保留原值；CSV 多余的 key 警告并跳过（不新建）；源语言列只读。写回用原子写（temp+rename）。

## 配置参考

### 完整配置接口

```typescript
interface I18nToolsConfig {
  /** 项目根目录（绝对路径） */
  root: string;

  /** 框架配置（判别 union） */
  framework:
    | { type: 'vue'; library?: 'vue-i18n' | 'vue-i18next'; namespace?: string; tImport?: string }
    | {
        type: 'react';
        library?: 'react-intl' | 'react-i18next';
        namespace?: string;
        tImport?: string;
        includeDefaultMessage?: boolean;
      };

  /** 语言配置 */
  locales?: {
    source?: string;            // 源语言，默认 'zh-CN'
    targets?: string[];         // 目标语言数组，默认 ['en-US']
    names?: Record<string, string>;  // 自定义 locale 展示名（合并到 prompt）
  };

  /** IO 配置：目录 / 扫描 / 落盘 */
  io?: {
    sourceDir?: string;         // 源码扫描根，默认 'src'
    localesDir?: string;        // 主语言文件目录，默认 'src/i18n'
    exportDir?: string;         // 发布目录（可选）
    customDir?: string;         // 定制 override 目录（可选）
    include?: string[];         // 文件 glob（默认含 vue/tsx/jsx/ts/js）
    exclude?: string[];         // 默认含 node_modules + test/spec/stories
    format?: 'flat' | 'nested'; // JSON 落盘格式，默认 'nested'
    indent?: number;            // JSON 缩进字符数，默认 2
    prettify?: boolean;         // 是否过 Prettier，默认 true
  };

  /** Keys 配置：前缀派生 + 兜底 + 复用 */
  keys?: {
    separator?: string;         // 段分隔符，默认 '.'
    prefix?:
      | {
          strategy: 'path';
          anchor?: string;      // 锚点目录，默认 'src'
          skip?: number;        // 跳过 anchor 后前 N 段
          take?: number;        // 保留 N 段（0 = 不限）
          includeFile?: boolean;// 是否把文件名作为最后一段
          fileNameCase?: 'as-is' | 'camel' | 'kebab' | 'snake' | ((name: string) => string);
          preserveHyphens?: boolean;  // 保留段中的连字符（默认 true）
          indexFile?: 'as-is' | 'collapse-to-parent'; // index.* 处理；默认 collapse-to-parent
          transform?: (segment: string, index: number, ctx: PrefixContext) => string | null;
        }
      | { strategy: 'fixed'; value: string }
      | { strategy: 'custom'; resolve: (filePath: string, ctx: PrefixContext) => string[] }
      | {
          // rules：按文件路径分派到不同的子策略（pages/components/utils 各走各的）
          strategy: 'rules';
          rules: Array<{
            match: string | string[] | RegExp | ((filePath: string) => boolean);
            use: PathStrategy | FixedStrategy | CustomStrategy; // 不允许嵌套 rules
          }>;
          fallback?: PathStrategy | FixedStrategy | CustomStrategy; // 可省略，未命中则无前缀
        };
    fallback?: {
      extend?: boolean;                       // 与内置 18 条合并，默认 true
      mappings?: Record<string, string>;
    };
    reuse?: {
      acrossDirectories?: boolean;            // 默认 false
      promoteToCommon?: { threshold: number; namespace?: string };
    };
    dynamicKeyAllowlist?: (string | RegExp)[]; // doctor 跳过动态 key 误报
    skip?: (key: string, message: string) => boolean; // doctor untranslated 跳过判定
  };

  /** 文本提取扩展 */
  extract?: {
    filterPatterns?: RegExp[];  // 命中即跳过提取
  };

  /** 翻译词表 */
  glossary?: {
    file?: string;              // 词表 JSON 路径（未设置即禁用）
    override?: 'always' | 'when-empty';
    normalize?: boolean;
  };

  /** LLM 配置 */
  llm: {
    shared?: {                  // 共享基线，任务级覆盖
      apiKey?: string;
      baseURL?: string;
      model?: string;
      timeout?: number;
      maxRetries?: number;
      temperature?: number;
      headers?: Record<string, string>;
    };
    idGeneration?: LLMTaskConfig;
    translation?: LLMTaskConfig;
  };

  /** 分桶导出（按规则把 key 分到不同语言文件） */
  buckets?: {
    rules: BucketRule[];
    defaultBucket?: string;     // 默认 'common'
    emitManifest?: boolean;     // 默认 true
    layout?: 'by-locale' | 'by-bucket';
  };

  /** 合并阶段策略 */
  merge?: {
    onLlmRejected?: 'fallback-to-source' | 'warn-only';
  };

  /** CI 集成 */
  ci?: {
    coverageThreshold?: number;  // 0-100，CLI --coverage-threshold 优先级更高
  };
}
```

### LLM 任务配置

```typescript
interface LLMTaskConfig {
  // shared 中的所有字段均可在任务级覆盖
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
  headers?: Record<string, string>;

  // 任务级独有字段
  concurrency?: number;       // 默认 5
  batchSize?: number;         // 默认 30
  throttleMs?: number;        // 批次间最小间隔，默认 500
  prompt?: {
    system?: string;          // 完全覆盖默认 system prompt
    user?: string;            // user prompt 模板
  };
}
```

### 配置示例

#### Vue + vue-i18n（默认）

```typescript
export default defineConfig({
  root: __dirname,
  framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
  locales: { source: 'zh-CN', targets: ['en-US'] },
  io: { sourceDir: 'src', localesDir: 'src/i18n' },
  llm: {
    shared: { apiKey: process.env.LLM_API_KEY!, model: 'gpt-4o' },
  },
});
```

#### React + react-intl

```typescript
export default defineConfig({
  root: __dirname,
  framework: {
    type: 'react',
    library: 'react-intl',
    tImport: '@/utils/intl',
    includeDefaultMessage: true,
  },
  locales: { source: 'zh-CN', targets: ['en-US'] },
  io: { sourceDir: 'src', localesDir: 'src/locales' },
  llm: {
    shared: { apiKey: process.env.LLM_API_KEY!, model: 'gpt-4o' },
  },
});
```

#### 使用 DeepSeek API

```typescript
export default defineConfig({
  root: __dirname,
  framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
  locales: { source: 'zh-CN', targets: ['en-US'] },
  io: { sourceDir: 'src', localesDir: 'src/i18n' },
  llm: {
    shared: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
    },
  },
});
```

#### 多目标语种 + 任务级独立调优

```typescript
export default defineConfig({
  root: __dirname,
  framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
  locales: { source: 'zh-CN', targets: ['en-US', 'ja-JP', 'ko-KR'] },
  io: { sourceDir: 'src', localesDir: 'src/i18n' },
  llm: {
    shared: { apiKey: process.env.LLM_API_KEY!, baseURL: 'https://api.deepseek.com' },
    // ID 用更便宜更快的模型，翻译用质量更高的模型
    idGeneration: { model: 'deepseek-chat', concurrency: 10, batchSize: 50 },
    translation:  { model: 'gpt-4o',        concurrency: 3,  batchSize: 20 },
  },
});
```

## 高级特性

### 分桶导出（buckets）

适用于大型项目按业务域拆分语言包。配置 `buckets.rules` 后，generate / merge / export 会把 key 按规则分桶到子目录，未匹配的 key 落入 `defaultBucket`（默认 `common`）。

```typescript
export default defineConfig({
  // ... 其他配置
  buckets: {
    rules: [
      // 按源码路径匹配（picomatch glob，相对 root）
      { name: 'order',   match: 'src/views/order/**' },
      { name: 'product', match: ['src/views/product/**', 'src/components/product/**'] },
      // 按 key 内容匹配（不依赖源码位置）
      { name: 'error',   matchKey: (key) => key.startsWith('error.') },
      // 也支持 RegExp / (filePath, key, message) => boolean
    ],
    defaultBucket: 'common',     // 未命中规则的 key 归属，默认 'common'
    emitManifest: true,          // 是否生成 manifest.json，默认 true
    layout: 'by-locale',         // 'by-locale': <lang>/<bucket>.json（默认）
                                 // 'by-bucket': <bucket>/<lang>.json
  },
});
```

**匹配优先级**：rules 数组顺序优先（先匹配先归属），同一 key 最多归属一个桶。`match` 与 `matchKey` 互斥，loader 会校验。

### 翻译词表（glossary）

为固定术语提供"权威译文"——命中词表的原文直接采用既定译文，跳过 LLM 翻译。适合品牌词、UI 控件标签等高频固定术语。

```typescript
// i18n.config.ts
export default defineConfig({
  // ... 其他配置
  glossary: {
    file: 'src/i18n/glossary.json',  // 词表文件路径（相对 root）；未设置即禁用词表功能
    override: 'always',               // 'always'（默认）覆盖已有译文 / 'when-empty' 仅在缺失时使用
    normalize: true,                  // 匹配前 trim + 空白压缩，默认 true
  },
});
```

```json
// src/i18n/glossary.json — 可混用两种值形态
{
  // 简化版：仅作用于 locales.targets[0]
  "确认": "Confirm",

  // 完整版：按目标语言独立设译文（多目标场景推荐）
  "我的订单": {
    "en-US": "My Orders",
    "ja-JP": "マイオーダー"
  }
}
```

### 落盘格式（io.format）

控制语言文件序列化为扁平 key 还是嵌套树形 JSON：

```typescript
io: { format: 'nested' }    // 默认；要求 keys.separator='.'
// 或
io: { format: 'flat', /* ... */ }, keys: { separator: '__' }
```

```json
// 'nested'（默认）
{ "views": { "order": { "submit": "提交" } } }

// 'flat'
{ "views.order.submit": "提交" }
```

注：影响 generate / merge / export 全部产物。`flat` + `__` 与 `nested` + `.` 是两套自洽组合；混用会被 loader 拦截（nested 必须用 `.` 分隔）。

### Dry-run + Plan 回放（generate）

适用于大目录批量国际化、需要 PR review 中间产物的场景。`generate --dry-run`
不修改任何源码与语言文件，而是把 transform 结果写入 plan 目录：

```
.i18n-tools/plans/generate-<timestamp>-<pid>/
├── plan.json              # 主 JSON：每文件的 hit 列表 + key→message
└── sources/               # 每个文件 transform 后的完整源码
    └── src/views/Login.vue
```

```bash
# 1. 生成 plan
npx i18n-tools -m generate --dry-run

# 2. Review plan.json 与 sources/ 目录下的转换后源码
#    可用 git diff、code review 工具直接对比

# 3. 确认后回放（推荐用 latest 简写）
npx i18n-tools -m generate --apply-plan latest
#   apply 成功后默认删 plan 目录；想保留请加 --keep-plan
```

**关键设计**：

- **指纹校验**：plan 记录每个源文件的 SHA-256，apply 阶段会重新计算并对比；
  若 plan 生成后源文件被外部修改过，apply 直接拒绝执行，避免静默覆盖
- **schemaVersion**：plan 结构带版本号，不识别的版本会拒绝读取（不向前兼容崩坏）
- **跨步骤复用**：apply 完全不调 LLM 也不解析 AST —— "决策"和"执行"解耦，
  既加快 review 后的最终落盘速度、也避免 LLM 第二次跑出不同结果
- **事务保证**：dry-run 失败（AST 错误）时不会留下半截 plan 目录
- **元数据完整**：plan 包含 `toolVersion`（生成时的 @kit/i18n-tools 版本）和
  `llmModel`（本次使用的模型名，或 `local` 表示跳过 LLM），给 reviewer 提供
  判断"是否需要用新版本重跑"的依据
- **latest 简写 + 自动清理**：
  - dry-run 写盘时同时落 `.i18n-tools/plans/.last.json` 指向最新目录，
    `--apply-plan latest` 一行命令直达；指针损坏时回退到目录扫描（按 mtime 倒序）
  - apply 成功后默认清理 plan 目录（连同指针），避免累积；需要保留时加 `--keep-plan`
- **自定义输出路径**：`--plan-output-dir <dir>` 把 plan 写到自定义根目录，
  适合 Windows 项目深路径场景，或希望把 plan 放到 `/tmp` 以快速失效的 CI 场景

### 覆盖率指标与 CI 卡点

`generate` 完成后会打印覆盖率 summary：

```
📊 本次国际化覆盖率
────────────────────────────────────
扫描文件          2095
中文片段总数      12252
  已国际化         11993  (97.9%)
  本轮新生成       200    (1.6%)
  跳过/待人工      59     (0.5%)
────────────────────────────────────
🎯 当前覆盖率   99.5%

⚠️  待人工处理 59 条（详见 .i18n-tools/logs/）
   • comparison-operand   34  — 比较运算符跳过的中文字面量
   • mixed-content        25  — 混合内容字符串（无法机械拆分）
```

CI 卡点：

```bash
# 覆盖率低于 95% 则以退出码 2 退出
npx i18n-tools -m generate --coverage-threshold 95
```

退出码语义：
- `0` 正常完成
- `1` 一般失败（AST 错误、IO 错误等）
- `2` 专用于覆盖率阈值不满足 —— 便于 CI pipeline 单独识别"i18n 覆盖率不足"这一档

覆盖率指标会同时落盘到 `.i18n-tools/logs/run-*.json`（仅当存在 failure / warning /
待人工条目时落盘，纯成功路径零产物）。

### Doctor 健康体检

`i18n-tools --mode doctor` 对 locale 文件与源码做交叉对账，不修改任何文件：

```bash
npx i18n-tools -m doctor          # 本地查看
npx i18n-tools -m doctor --ci     # CI 模式（有 error 即非零退出）
```

检查维度：

| 类别 | 严重级别 | 触发条件 |
|------|---------|---------|
| `missing-key` | **error** | 源码 `t('xxx')` 引用了 locale 不存在的 key（运行时显示 key 字符串） |
| `orphan-key` | warning | locale 中的 key 源码无引用（清理候选；动态 key 可能误报，不自动删） |
| `untranslated` | warning | target locale 的 value 与 source 完全相同且含中文（疑似漏译） |
| `placeholder-mismatch` | error / warning | 译文与源占位符名集不一致：漏占位符（如译文丢了 `{count}`）= error；多出 = warning |
| `locale-lint` | info / warning | 复用 `LocaleValueLinter.analyze`：语义重复 key、含 HTML、超长 value、跨模块复用候选、硬编码比较等 |

**未翻译判定的保守策略**：仅当 source value 含中文字符且 target = source 时
才报警，避免对纯英文/纯符号（如 `'TCP/IP'`、`'API'`、`'{count}'`）误判为漏译。

### 清理孤儿 key（prune）

`doctor` 能查出 orphan-key 但只读不删；`prune` 负责安全清理：

```bash
i18n-tools --mode prune --dry-run   # 预览将删哪些孤儿 key，不改文件
i18n-tools --mode prune             # 确认(y/N)后从所有 locale 删除
i18n-tools --mode prune --ci        # 非交互直接删（CI/脚本）
```

- 删除范围：源语言 + 所有目标语言的 locale 文件（含分桶布局），以及中间文件 `translations.json` / `untranslated.json`，一并清掉孤儿 key，保持状态一致。命中 `keys.dynamicKeyAllowlist` 的 key 跳过不删。
- 无 `.bak`：写回为原子写，恢复请用 git。

### 落盘日志（.i18n-tools/）

工具会在项目根创建 `.i18n-tools/` 目录（自带 `.gitignore`，不会被业务侧误提交），
集中存放运行期产物：

```
.i18n-tools/
├── .gitignore             # 内容固定为 *，整个目录默认被忽略
├── logs/                  # 失败 / 警告 / 待人工 条目落盘
│   └── run-<ts>-<cmd>-<pid>.json
│   ⚠️  自动按 mtime 倒序保留最近 20 个；不会动用户放在此目录的其它文件
└── plans/                 # dry-run 生成的 plan
    ├── .last.json         # 指向最近一次 dry-run 的目录（给 --apply-plan latest 用）
    └── generate-<ts>-<pid>/
        ├── plan.json
        └── sources/
```

**生命周期**：

- `logs/run-*.json` —— 按 mtime 滚动，仅保留最近 20 个；用户在 `logs/` 下放
  自己的笔记或归档文件不会被清理
- `plans/generate-*/` —— apply 成功后默认清理；`--keep-plan` 显式保留
- `plans/.last.json` —— write 时更新，cleanup 时若指向被清目录则一并删除

日志 payload 结构：

```typescript
{
  command: 'generate' | 'doctor' | ...,
  finishedAt: string,
  rootDir: string,
  summary: { failed, warnings, needsManual },
  coverage?: CoverageMetric,
  failures: FailureRecord[],
  warnings: string[],
  needsManual: ManualEntry[],   // 结构化分类，含 file/line/category/reason/suggestion
}
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
| `GenerateProcessor` | 代码生成处理器（支持 `execute(target, skipLLM, { dryRun })` 与 `applyFromPlan(path)`） |
| `PickProcessor` | 提取待翻译处理器 |
| `TranslateProcessor` | 翻译处理器 |
| `MergeProcessor` | 合并翻译处理器 |
| `ExportProcessor` | 导出处理器 |
| `RestoreProcessor` | 还原处理器 |
| `CsvExportProcessor` | CSV 导出处理器 |
| `CsvImportProcessor` | CSV 回流处理器 |
| `AutomaticProcessor` | 全自动处理器 |
| `DoctorProcessor` | 健康检查处理器（locale lint + 三类对账） |
| `PruneProcessor` | 孤儿 key 清理处理器 |

> 另有基类 `BaseProcessor` 一并导出，供自定义处理器继承。

### 其它导出

| 导出 | 说明 |
|--------|------|
| `GeneratePlanWriter` | Plan 序列化/回读/指纹校验（dry-run/apply 用） |
| `createFrameworkAdapter` / `ReactAdapter` / `VueAdapter` / `FrameworkAdapter` | 框架适配器（自定义提取/转换实现时通过其接口注入） |
| `defineConfig` / `loadConfig` / `resolveConfig` / `loadConfigFile` / `findConfigFile` | 配置加载与解析 |
| `DEFAULT_*` 常量 + 各 `*Config` 类型 | 配置默认值与 TypeScript 类型 |

> 注：`FileUtils`、`LoggerUtils`、`LLMClient`、`IdGenerator`、`LanguageFileManager`、`LocaleValueLinter`、`RunReport` 等 `utils/*` 是**内部实现，不在公共 API 中导出**（避免内部重构演变成 breaking change）；需要扩展请通过 `FrameworkAdapter` 接口注入实现。

## 生成的文件结构

```
src/i18n/                   # io.localesDir：主语言文件目录（默认 'src/i18n'）
├── zh-CN.json              # 源语言文件（generate 生成/更新）
├── en-US.json              # 目标语言文件（merge 更新）
├── untranslated.json       # 待翻译条目（pick 生成，translate 填充）
└── translations.json       # 已翻译条目（pick 生成，merge 读取）

<io.customDir>/             # 定制目录（--custom 模式；仅在 io.customDir 配置后启用）
├── zh-CN.json
├── en-US.json
├── untranslated.json
└── translations.json

<io.exportDir>/             # export 模式输出目录（如 'public/locale'，单文件布局）
├── zh-CN.json              # 合并后的最终源语言包
└── en-US.json              # 合并后的最终目标语言包
```

**分桶模式**（配置了 `buckets` 时）：

```
<io.exportDir>/             # by-locale 布局（默认）
├── zh-CN/
│   ├── common.json
│   ├── order.json
│   └── product.json
├── en-US/
│   ├── common.json
│   ├── order.json
│   └── product.json
└── manifest.json           # 桶清单（emitManifest: true 时生成，默认 true）

# 或 by-bucket 布局
<io.exportDir>/
├── common/
│   ├── zh-CN.json
│   └── en-US.json
└── order/
    ├── zh-CN.json
    └── en-US.json
```

**文件说明**：
- `untranslated.json` 和 `translations.json` 是工作流中间文件，可在发布时忽略
- `export` 会合并主目录与 `io.customDir` 的语言文件，检测 key 冲突
- 分桶模式下，generate/merge 阶段的工作目录也会自动按桶组织

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
  keys: {
    separator: '.',                  // 段分隔符（nested 模式必须为 '.'）
    prefix: {
      strategy: 'path',              // 'path' | 'fixed' | 'custom'
      anchor: 'src',                 // 从 src 目录开始派生路径
      // skip: 1,                    // 可选：跳过 anchor 后前 N 段
      // take: 3,                    // 可选：保留 N 段（0 = 不限）
      // includeFile: true,          // 可选：把文件名加入前缀末尾
    },
    fallback: {
      extend: true,                  // 与内置 18 条合并，默认 true
      mappings: {                    // 自定义中文兜底映射
        // 自定义术语: 'customTerm',
      },
    },
  },
});

// 想用固定前缀（绕过路径派生）：
// keys: { prefix: { strategy: 'fixed', value: 'myapp' } }
```

生成的 ID 格式：`views.login.welcomeMessage`（separator='.'）或 `views__login__welcomeMessage`（separator='__'）

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

默认不会。还原后的文件输出到 `<root>/restored/` 目录。如果需要覆盖原文件，可以在程序化调用时设置 `overwrite: true`。

### Q: 如何配置不同的源语言和目标语言？

```typescript
export default defineConfig({
  // ...
  locales: {
    source: 'ja-JP',           // 日语作为源语言
    targets: ['en-US', 'zh-CN'], // 多目标语种
  },
});
```

`targets` 是数组，支持多语种同时翻译。loader 会校验 `targets` 不含 `source`、无重复项。

### Q: generate 中途失败会污染语言文件吗？

不会。`generate` 采用事务式写入：先把全部源文件的 transform 结果保留在内存，**所有文件都成功**才会落盘源码并更新语言文件。任一阶段失败立即抛错，语言文件保持原状，可安全修复后重试。

具体阶段：
1. **transform 到内存** —— AST 失败（最常见）在此拦截，源码与语言文件均未变更
2. **写源码** —— IO 失败在此拦截，语言文件未变更
3. **更新语言文件** —— 仅当前两步全部成功才执行
4. **prettier 格式化** —— 美化步骤，单个失败仅警告不影响正确性

### Q: 分桶导出后单文件流程还能用吗？

可以。不配置 `buckets` 时所有行为完全等同——`<lang>.json` 单文件输出。配置 `buckets` 后，generate/merge/export 会自动按规则分桶；语言文件的物理结构变成 `<lang>/<bucket>.json`（或 `<bucket>/<lang>.json`），但内部 key 表示和 t() 调用方式不变。

### Q: dry-run 生成 plan 后，源文件被修改了怎么办？

`apply-plan` 阶段会重新计算每个源文件的 SHA-256 与 plan 记录的 hash 对比；
不一致直接拒绝执行，并打印出被改动的文件列表，**不会**用旧的 transform 结果
覆盖新内容。需要：

1. 决定保留哪一份变更（plan 内的转换结果 vs. 当前源文件）
2. 重新跑 `generate --dry-run` 生成新 plan
3. 重新 review 后 apply

设计上不提供"强制 apply"开关 —— 静默覆盖未审核内容的风险远高于多跑一次
dry-run 的成本。

### Q: doctor 报了 orphan-key，但其实是动态 key（`t(prefix + name)`）

工具的源码扫描基于静态正则，无法识别动态拼接的 key，因此动态 key 引用的
locale 条目会被误报为 orphan。当前策略：

- 默认仅 warning 级，不阻塞 CI
- 不提供 `--fix` 自动删除（明确建议"删除前请人工确认"）
- 后续可考虑加 `noOrphanCheck` 白名单配置

如果业务大量使用动态 key，建议把 `doctor` 当作 PR 的辅助 review 工具，
而非 CI 必经环节；或仅启用 `--ci` 关注 missing-key（仍是 error 级）。

### Q: 覆盖率指标里的"跳过/待人工"具体是哪些？

当前精确统计的是工具主动拒收的硬编码场景，归在 `comparison-operand` 等
分类下；落盘后可在 `.i18n-tools/logs/run-*.json` 的 `needsManual` 数组中
看到每条详情（含文件、行号、原文、原因、修复建议模板）。

`comparison-operand` 是典型例子：`status === '进行中'` 这种比较若被替换为
`t('xxx')`，运行时切语言后分支会永久不命中。工具主动跳过，由 `LocaleValueLinter`
进一步交叉 locale value 报"硬编码 ↔ i18n 文案"风险位置。
