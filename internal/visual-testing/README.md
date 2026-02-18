# @kit/visual-testing

视觉比对测试系统，支持 Figma 设计稿作为基准图，对任意页面/组件进行像素级比对，结合 LLM 智能分析差异并生成修复建议。

## 特性

- **Figma MCP 集成** - 直接从 Figma 设计稿获取基准图
- **LLM 智能分析** - 支持 Anthropic Claude / OpenAI GPT-4o，自动识别差异类型并生成修复建议
- **成本控制** - 缓存 + 阈值过滤 + 调用次数限制
- **多格式报告** - HTML 可视化 / JSON 机器可读 / 结论报告
- **截图稳定性** - 动画禁用、网络空闲等待、一致性检测重试
- **并发控制** - p-limit 限制浏览器和 LLM 调用并发

## 安装

```bash
pnpm add -D @kit/visual-testing
```

## 快速开始

### 1. 初始化配置

```bash
npx visual-test init
```

生成 `visual-test.config.ts` 配置文件。

### 2. 同步基准图

```bash
npx visual-test sync
```

从配置的来源（本地文件 / Figma）下载基准图。

### 3. 运行测试

```bash
npx visual-test test
```

执行视觉比对测试，生成报告。

### 编程 API

```typescript
import { VisualTestOrchestrator } from '@kit/visual-testing';
import { loadConfig } from '@kit/visual-testing';

const config = await loadConfig();
const tester = new VisualTestOrchestrator(config);

// 运行所有测试
const results = await tester.runTests();

// 运行指定目标
const results = await tester.runTests(['button', 'input']);
```

## 配置

创建 `visual-test.config.ts`：

```typescript
import { defineConfig } from '@kit/visual-testing';

export default defineConfig({
  // 目录配置
  directories: {
    baselines: '.visual-test/baselines',
    actuals: '.visual-test/actuals',
    diffs: '.visual-test/diffs',
    reports: '.visual-test/reports',
  },

  // 服务器配置（截图目标）
  server: {
    url: 'http://localhost:5173',
  },

  // 截图配置
  screenshot: {
    viewport: { width: 1280, height: 720 },
    stability: {
      disableAnimations: true,
      extraDelay: 500,
    },
  },

  // 比对配置
  comparison: {
    threshold: 0.01,     // 差异阈值 (0-1)
    antialiasing: true,  // 忽略抗锯齿差异
  },

  // 基准图来源
  baseline: {
    provider: 'local',   // 'local' | 'figma-mcp' | 'figma-api' | 'remote'
  },

  // LLM 分析
  llm: {
    enabled: true,
    provider: 'anthropic',  // 'anthropic' | 'openai' | 'custom'
    costControl: {
      maxCallsPerRun: 50,
      diffThreshold: 5,  // 差异 <5% 时跳过 LLM
    },
  },

  // 测试目标
  targets: [
    {
      name: 'button',
      type: 'component',
      variants: [
        {
          name: 'primary',
          url: 'http://localhost:5173/button/primary',
          baseline: './baselines/button-primary.png',
        },
        {
          name: 'secondary',
          url: 'http://localhost:5173/button/secondary',
          baseline: './baselines/button-secondary.png',
        },
      ],
    },
  ],

  // 报告格式
  report: {
    formats: ['html', 'json'],
    conclusion: true,
  },
});
```

### Figma MCP 基准图

```typescript
export default defineConfig({
  baseline: {
    provider: 'figma-mcp',
    figma: {
      fileKey: 'your-figma-file-key',
    },
  },
  targets: [
    {
      name: 'button',
      variants: [
        {
          name: 'primary',
          url: 'http://localhost:5173/button',
          baseline: {
            type: 'figma-mcp',
            source: '123:456', // Figma node ID
            fileKey: 'your-file-key',
          },
        },
      ],
    },
  ],
});
```

## 报告

### 结论报告 (conclusion.json)

结构化的测试总结，包含：

| 字段 | 说明 |
|------|------|
| `summary.overallScore` | 0-100 评分 |
| `summary.grade` | A/B/C/D/F 等级 |
| `issues` | 问题清单（按严重性排序） |
| `fixPlan` | 修复计划（含工时估算） |
| `nextActions` | 下一步行动建议 |

### HTML 报告 (report.html)

可视化报告，支持：
- 图片三列对比（Baseline / Actual / Diff）
- 点击放大查看
- 筛选通过/失败用例
- 图片使用相对路径引用（报告与截图目录需保持相对位置）

### JSON 报告 (report.json)

机器可读的完整测试数据，适合 CI/CD 集成。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `visual-test init` | 生成配置文件 |
| `visual-test sync` | 同步基准图 |
| `visual-test test` | 运行视觉测试 |
| `visual-test test --target button` | 指定目标 |
| `visual-test test --update` | 更新失败用例的基准图 |
| `visual-test test --ci` | CI 模式（失败时 exit code 1） |
| `visual-test test --no-llm` | 禁用 LLM 分析 |

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | 使用 Claude 时 |
| `OPENAI_API_KEY` | OpenAI API Key | 使用 GPT-4 时 |
| `FIGMA_TOKEN` | Figma 访问令牌 | 使用 Figma API 时 |

## 架构

```
src/
├── core/
│   ├── baseline/          # 基准图提供器 (Local, Figma MCP)
│   ├── screenshot/        # 截图引擎 (Playwright)
│   ├── comparison/        # 比对引擎 (pixelmatch)
│   ├── llm/               # LLM 分析器 (Anthropic, 规则引擎)
│   ├── report/            # 报告生成器 (JSON, HTML, 结论)
│   ├── config/            # 配置系统 (Zod Schema)
│   └── orchestrator.ts    # 核心编排器
├── cli/                   # CLI 命令
├── utils/                 # 工具函数
└── types/                 # 类型定义
```

## 开发

```bash
# 运行测试
pnpm test

# 构建
pnpm build

# 开发模式
pnpm dev
```
