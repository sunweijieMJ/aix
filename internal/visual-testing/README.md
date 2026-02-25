# @kit/visual-testing

视觉回归测试系统，支持 Storybook 自动发现、Figma 设计稿作为基准图、像素级比对，结合 LLM 智能分析差异并生成修复建议。

## 特性

- **Storybook 自动发现** - 从 `/index.json` 自动发现所有 Story，无需逐一配置测试目标
- **Figma MCP 集成** - 直接从 Figma 设计稿获取基准图，对比实现与设计的像素级差异
- **LLM 智能分析** - 支持 Anthropic Claude / OpenAI GPT-4o，自动识别差异类型并生成修复建议
- **多分辨率测试** - 配置多个 viewport，同一 story 自动在所有分辨率下测试
- **多浏览器测试** - 支持 Chromium / Firefox / WebKit 并发测试
- **成本控制** - 缓存 + 阈值过滤 + 调用次数限制，避免 LLM 费用失控
- **多格式报告** - HTML 可视化 / JSON 机器可读 / 结论报告（含评分和修复计划）
- **截图稳定性** - 动画禁用、网络空闲等待、一致性检测重试，确保截图可复现
- **并发控制** - `p-limit` 限制浏览器和 LLM 调用并发，防止资源耗尽
- **服务器自动启动** - 可配置自动启动 Storybook/Dev Server，测试结束后自动关闭

---

## 安装

### Monorepo（workspace）

```json
// package.json
{
  "devDependencies": {
    "@kit/visual-testing": "workspace:*"
  }
}
```

### 独立安装

```bash
pnpm add -D @kit/visual-testing
```

### 可选对等依赖

根据使用场景按需安装：

```bash
# 使用 Playwright 截图（必须）
pnpm add -D playwright
npx playwright install chromium  # 至少安装一个浏览器

# 使用 Anthropic Claude 分析
pnpm add -D @anthropic-ai/sdk

# 使用 OpenAI GPT-4o 分析
pnpm add -D openai

# 使用 Figma MCP 获取基准图
pnpm add -D @modelcontextprotocol/sdk
```

---

## 快速开始

### 1. 初始化配置

```bash
npx visual-test init
```

交互式填写项目配置，生成 `visual-test.config.ts` 和目录结构。

跳过交互直接使用默认值：

```bash
npx visual-test init --yes
```

### 2. 捕获初始基准图

首次运行时，还没有基准图，使用 `--update` 将当前截图保存为基准：

```bash
npx visual-test test --update
```

### 3. 运行视觉回归测试

后续每次修改后运行：

```bash
npx visual-test test
```

有差异时查看生成的 HTML 报告（默认在 `.visual-test/reports/report.html`）。

---

## 配置参考

创建 `visual-test.config.ts`（支持 TypeScript 类型提示）：

```typescript
import { defineConfig } from '@kit/visual-testing';

export default defineConfig({
  // 项目名称（出现在报告中）
  name: 'my-project',

  // 目录配置
  directories: {
    baselines: '.visual-test/baselines',  // 基准图
    actuals:   '.visual-test/actuals',    // 当次截图
    diffs:     '.visual-test/diffs',      // 差异图
    reports:   '.visual-test/reports',    // 报告
  },

  // 服务器配置
  server: {
    url: 'http://localhost:6006',          // 目标服务地址
    autoStart: false,                      // 是否自动启动服务
    command: 'pnpm storybook:dev',         // autoStart 时的启动命令
    waitOn: 'http://localhost:6006',       // 等待该 URL 可访问后开始测试
    timeout: 60_000,                       // 启动超时 (ms)
  },

  // Storybook 自动发现
  storybook: {
    enabled: false,                        // 开启后自动发现所有 Story
    url: 'http://localhost:6006',          // Storybook 地址（默认用 server.url）
    include: ['**'],                       // glob 过滤：包含
    exclude: ['**/Docs/**'],              // glob 过滤：排除
    defaultSelector: '#storybook-root',   // 截图 CSS 选择器
    baselineDir: 'storybook',            // 基准图子目录前缀
  },

  // 截图配置
  screenshot: {
    viewport: { width: 1280, height: 720 },  // 默认分辨率
    viewports: [                              // 多分辨率（会展开为多个测试任务）
      { name: 'mobile',  width: 375,  height: 812 },
      { name: 'tablet',  width: 768,  height: 1024 },
      { name: 'desktop', width: 1440, height: 900 },
    ],
    browsers: [                               // 多浏览器（默认仅 Chromium）
      { type: 'chromium', headless: true },
      // { type: 'firefox', headless: true },
      // { type: 'webkit',  headless: true },
    ],
    stability: {
      waitForNetworkIdle: true,              // 等待网络空闲
      waitForAnimations: true,               // 等待动画完成
      disableAnimations: true,               // 禁用 CSS/JS 动画
      extraDelay: 500,                       // 截图前额外等待 (ms)
      hideSelectors: [],                     // 截图时隐藏的元素（动态内容）
      maskSelectors: [],                     // 截图时遮罩的元素（如时间戳）
      retry: {
        attempts: 3,                         // 一致性检测重试次数
        compareInterval: 200,               // 两次截图间隔 (ms)
        consistencyThreshold: 0.001,        // 一致性阈值
      },
      waitStrategies: [                      // 自定义等待策略
        // { type: 'selector', selector: '.loaded', state: 'visible' }
        // { type: 'network',  value: 'idle' }
        // { type: 'timeout',  duration: 1000 }
      ],
    },
  },

  // 像素比对配置
  comparison: {
    threshold: 0.01,    // 差异阈值（0-1），超过则失败
    antialiasing: true, // 忽略抗锯齿差异
  },

  // 基准图来源
  baseline: {
    provider: 'local',  // 'local' | 'figma-mcp'
    figma: {
      fileKey: process.env.FIGMA_FILE_KEY,
    },
  },

  // LLM 分析配置
  llm: {
    enabled: false,                  // 是否启用 LLM 分析
    model: 'gpt-4o',                 // 默认模型
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: undefined,              // 自定义 API 端点（支持兼容厂商）

    // 视觉分析专用配置（覆盖以上默认值）
    analyze: {
      model: 'claude-opus-4-6',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },

    // 修复建议专用配置（可使用较便宜的模型）
    suggestFix: {
      model: 'claude-haiku-4-5-20251001',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },

    // 成本控制
    costControl: {
      maxCallsPerRun: 50,            // 每次运行最大 LLM 调用次数
      diffThreshold: 5,              // 差异 < 5% 时跳过 LLM 分析
      cacheEnabled: true,            // 启用结果缓存
      cacheTTL: 3600,               // 缓存有效期 (秒)
    },

    // 错误回退策略
    fallback: {
      onError: 'skip',               // 'skip' | 'retry' | 'rule-based'
      retryAttempts: 2,
      timeout: 30_000,
      fallbackToRuleBase: true,      // LLM 失败时回退到规则引擎
    },
  },

  // 手动测试目标（与 storybook 自动发现可同时使用）
  targets: [
    {
      name: 'button',
      type: 'component',             // 'component' | 'page' | 'element'
      variants: [
        {
          name: 'primary',
          url: 'http://localhost:6006/iframe.html?id=button--primary',
          baseline: '.visual-test/baselines/button/primary.png',
          selector: '#storybook-root > *',  // 截图 CSS 选择器
          threshold: 0.005,                 // 覆盖全局阈值
          viewport: { width: 800, height: 600 },
          theme: 'light',
        },
      ],
    },
  ],

  // 报告配置
  report: {
    formats: ['html', 'json'],  // 生成的报告格式
    conclusion: true,           // 生成结论报告（含评分、问题清单、修复计划）
  },

  // CI 配置
  ci: {
    failOnDiff: true,
    failOnSeverity: 'major',  // 'critical' | 'major' | 'minor' | 'trivial'
  },

  // 性能配置
  performance: {
    timeout: 120_000,          // 单个测试任务超时 (ms)
    concurrent: {
      maxBrowsers: 3,          // 最大并发浏览器数
      maxTargets: 10,          // 最大并发测试目标数
      poolSize: 5,             // 浏览器 Page 池大小
    },
  },

  // 日志配置
  logging: {
    level: 'info',  // 'debug' | 'info' | 'warn' | 'error'
  },
});
```

---

## Storybook 自动发现

开启后，系统自动从 Storybook 的 `/index.json` 端点获取所有 Story，无需手动配置 `targets`：

```typescript
export default defineConfig({
  server: {
    url: 'http://localhost:6006',
  },

  storybook: {
    enabled: true,
    // 仅测试 Button 和 Input 组件的 Story
    include: ['Button/**', 'Input/**'],
    // 排除文档类 Story
    exclude: ['**/Docs/**'],
    defaultSelector: '#storybook-root',
    baselineDir: 'storybook',
  },

  llm: { enabled: false },
});
```

自动发现规则：
- 过滤 `type === 'story'` 的条目（排除文档页）
- 按 `title` 分组为 target（对应组件）
- 每个 `name` 为该 target 的一个 variant
- URL 格式：`{storybookUrl}/iframe.html?id={storyId}&viewMode=story`

---

## 多分辨率测试

配置 `screenshot.viewports` 后，系统为每个 variant 在所有分辨率下分别创建测试任务：

```typescript
export default defineConfig({
  screenshot: {
    viewports: [
      { name: 'mobile',  width: 375,  height: 812 },
      { name: 'desktop', width: 1440, height: 900 },
    ],
  },
  targets: [
    {
      name: 'button',
      variants: [{ name: 'primary', url: '...', baseline: 'btn.png' }],
    },
  ],
});
```

实际执行的测试任务：
- `button/primary@mobile`  → 基准图 `btn@mobile.png`
- `button/primary@desktop` → 基准图 `btn@desktop.png`

---

## 多浏览器测试

```typescript
export default defineConfig({
  screenshot: {
    browsers: [
      { type: 'chromium', headless: true },
      { type: 'firefox',  headless: true },
      { type: 'webkit',   headless: true },
    ],
  },
});
```

多浏览器时，任务 ID 格式：`{target}/{variant}@{browser}`

> 注意：Firefox 和 WebKit 需要单独安装：`npx playwright install firefox webkit`

---

## 基准图管理

### 本地基准图

```bash
# 首次运行：截图并保存为基准图
npx visual-test test --update

# 日常测试：比对当前截图与基准图
npx visual-test test

# 发现差异后接受新截图为新基准图
npx visual-test test --update
```

### Figma MCP 基准图

从 Figma 设计稿自动拉取，确保实现与设计 100% 一致：

```typescript
export default defineConfig({
  baseline: {
    provider: 'figma-mcp',
    figma: {
      fileKey: process.env.FIGMA_FILE_KEY,
    },
  },
  targets: [
    {
      name: 'button',
      variants: [
        {
          name: 'primary',
          url: 'http://localhost:6006/iframe.html?id=button--primary',
          baseline: {
            type: 'figma-mcp',
            source: '123:456',              // Figma 节点 ID
            fileKey: process.env.FIGMA_FILE_KEY,
          },
        },
      ],
    },
  ],
});
```

同步基准图：

```bash
npx visual-test sync
npx visual-test sync --target button  # 仅同步 button
```

---

## LLM 分析

### 使用 Claude（Anthropic）

```typescript
export default defineConfig({
  llm: {
    enabled: true,
    model: 'claude-sonnet-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY,
    costControl: {
      maxCallsPerRun: 30,
      diffThreshold: 5,    // 差异 < 5% 不调用 LLM
    },
  },
});
```

### 使用 GPT-4o（OpenAI）

```typescript
export default defineConfig({
  llm: {
    enabled: true,
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY,
  },
});
```

### 分析与修复建议使用不同模型

```typescript
export default defineConfig({
  llm: {
    enabled: true,
    // 视觉分析：使用强力模型
    analyze: {
      model: 'claude-opus-4-6',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    // 修复建议：使用快速便宜模型
    suggestFix: {
      model: 'claude-haiku-4-5-20251001',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
  },
});
```

### 自定义 API 端点

```typescript
export default defineConfig({
  llm: {
    enabled: true,
    model: 'your-model',
    baseURL: 'https://your-compatible-api.com/v1',
    apiKey: process.env.YOUR_API_KEY,
  },
});
```

---

## 报告说明

### HTML 报告（report.html）

可视化报告，包含：
- 测试总览（通过率、评分）
- 每个 variant 的三栏对比图：Baseline / Actual / Diff
- 点击放大查看细节
- 按通过/失败筛选

### JSON 报告（report.json）

机器可读的完整测试数据，适合 CI/CD 集成和自定义处理。

### 结论报告（conclusion.json）

LLM 分析后的结构化总结：

| 字段 | 说明 |
|------|------|
| `summary.overallScore` | 0-100 综合评分 |
| `summary.grade` | A/B/C/D/F 等级 |
| `issues` | 问题清单（按严重性排序） |
| `fixPlan` | 修复计划（含工时估算） |
| `nextActions` | 下一步行动建议 |

---

## CLI 命令

| 命令 | 说明 |
|------|------|
| `visual-test init` | 交互式初始化配置文件 |
| `visual-test init --yes` | 跳过交互，使用默认值 |
| `visual-test sync` | 从配置的 provider 同步基准图 |
| `visual-test sync --target button` | 仅同步指定 target |
| `visual-test test` | 运行所有视觉测试 |
| `visual-test test button input` | 仅测试指定 target |
| `visual-test test --update` | 测试后更新失败用例的基准图 |
| `visual-test test --ci` | CI 模式：失败时 exit code 1 |
| `visual-test test --no-llm` | 禁用本次运行的 LLM 分析 |
| `visual-test test --debug` | 开启 debug 日志 |
| `visual-test test -c custom.config.ts` | 使用指定配置文件 |

---

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | 使用 Claude 时 |
| `OPENAI_API_KEY` | OpenAI API Key | 使用 GPT-4o 时 |
| `FIGMA_FILE_KEY` | Figma 文件 Key | 使用 Figma provider 时 |
| `FIGMA_TOKEN` | Figma 访问令牌 | 使用 Figma API 时 |

---

## 编程 API

### 快速使用

```typescript
import { VisualTestOrchestrator } from '@kit/visual-testing';

// 从配置文件路径创建（支持自动搜索）
const tester = await VisualTestOrchestrator.create();                    // 自动搜索配置文件
const tester = await VisualTestOrchestrator.create('./config.ts');       // 指定配置文件
const tester = await VisualTestOrchestrator.create({ targets: [...] }); // 传入配置对象

// 运行测试
const results = await tester.runTests();              // 运行所有测试
const results = await tester.runTests(['button']);    // 仅运行指定 target

// 更新失败用例的基准图
const failed = results.filter(r => !r.passed);
await tester.updateBaselines(failed);

// 获取 LLM 统计
const stats = tester.getLLMStats();
console.log(`LLM 调用 ${stats.callCount} 次`);
```

### 使用独立模块

```typescript
import {
  PixelComparisonEngine,
  PlaywrightScreenshotEngine,
  LLMAnalyzer,
  createBaselineProvider,
  loadConfig,
  discoverStories,
} from '@kit/visual-testing';

// 单独使用截图引擎
const config = await loadConfig();
const engine = new PlaywrightScreenshotEngine(config);
await engine.initialize();
await engine.capture({
  url: 'http://localhost:6006/iframe.html?id=button--primary',
  outputPath: './screenshot.png',
  selector: '#storybook-root',
});
await engine.close();

// 单独使用比对引擎
const comparator = new PixelComparisonEngine();
const result = await comparator.compare({
  baselinePath: './baseline.png',
  actualPath: './actual.png',
  diffPath: './diff.png',
  threshold: 0.01,
});
console.log(`差异: ${result.mismatchPercentage.toFixed(2)}%`);

// 从 Storybook 发现 Story 列表
const stories = await discoverStories(config);
console.log(`发现 ${stories.length} 个测试目标`);
```

### TypeScript 类型

```typescript
import type {
  VisualTestConfig,      // 完整配置类型（Zod 解析后）
  VisualTestUserConfig,  // 用户输入配置类型（所有字段可选）
  TestResult,            // 单个测试结果
  ConclusionReport,      // 结论报告结构
  CompareResult,         // 像素比对结果
  AnalyzeResult,         // LLM 分析结果
} from '@kit/visual-testing';
```

---

## CI/CD 集成

### GitHub Actions

```yaml
# .github/workflows/visual-test.yml
name: Visual Regression Tests

on:
  pull_request:
    branches: [main, develop]

jobs:
  visual-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: npx playwright install chromium --with-deps

      - name: Build packages
        run: pnpm build

      - name: Start Storybook
        run: pnpm storybook:dev &
        # 或使用 server.autoStart 配置，由 visual-test 自动启动

      - name: Wait for Storybook
        run: npx wait-on http://localhost:6006 --timeout 60000

      - name: Run visual tests
        run: npx visual-test test --ci
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}  # 可选

      - name: Upload visual test reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-test-reports
          path: .visual-test/reports/
          retention-days: 30

      - name: Upload diff screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: visual-test-diffs
          path: .visual-test/diffs/
          retention-days: 7
```

### 使用 `server.autoStart` 简化 CI

```typescript
export default defineConfig({
  server: {
    url: 'http://localhost:6006',
    autoStart: true,
    command: 'pnpm storybook:dev --ci --quiet',
    waitOn: 'http://localhost:6006',
    timeout: 120_000,
  },
});
```

---

## .gitignore 建议

```gitignore
# 视觉测试产物（基准图需要提交到 git，其他不需要）
.visual-test/actuals/
.visual-test/diffs/
.visual-test/reports/
.visual-test/cache/

# 基准图：提交到 git 以追踪设计变化
# .visual-test/baselines/  <- 不要忽略
```

---

## 架构

```
src/
├── core/
│   ├── baseline/          # 基准图提供器
│   │   ├── local-provider.ts    # 本地文件读取
│   │   └── figma-mcp-provider.ts # Figma MCP 调用
│   ├── screenshot/        # 截图引擎
│   │   ├── playwright-engine.ts  # Playwright 截图
│   │   ├── page-pool.ts          # 浏览器 Page 复用池
│   │   └── stability-handler.ts  # 截图稳定性处理
│   ├── comparison/        # 比对引擎
│   │   ├── pixel-engine.ts       # pixelmatch 像素比对
│   │   └── region-analyzer.ts    # 差异区域分析
│   ├── llm/               # LLM 分析器
│   │   ├── analyzer.ts           # 主分析器
│   │   ├── llm-client.ts         # 统一 LLM 客户端
│   │   ├── cost-controller.ts    # 成本控制（缓存/限流）
│   │   ├── adapters/             # LLM 适配器（Anthropic/OpenAI）
│   │   └── prompts/              # 分析 Prompt 模板
│   ├── report/            # 报告生成器
│   │   ├── json-reporter.ts
│   │   ├── html-reporter.ts
│   │   └── conclusion-reporter.ts # 结论报告（评分/修复计划）
│   ├── config/            # 配置系统（Zod Schema）
│   ├── storybook/         # Storybook 自动发现
│   ├── server/            # 开发服务器管理
│   └── orchestrator.ts    # 核心编排器（整合所有模块）
├── cli/                   # CLI 命令（init/sync/test）
├── utils/                 # 工具函数（logger/cache/image）
└── types/                 # 全局类型定义
```

---

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 开发模式（直接运行 CLI）
pnpm dev init
pnpm dev test

# 单元测试
pnpm test

# 代码检查
pnpm lint
```
