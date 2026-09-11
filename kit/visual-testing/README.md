# @kit/visual-testing

视觉回归测试 + 设计还原度校验。两条独立流程：

| 流程 | 命令 | 基线 | 回答的问题 | 消费者 |
|---|---|---|---|---|
| **回归测试** | `visual-test test` | 上一次截图 | 什么变了 | CI / 人 |
| **还原度校验** | `visual-test fidelity` | Figma 节点树 + 位图 | 离设计差在哪个属性 | AI agent（读报告 → 改代码 → 重跑） |

设计文档：[docs/fidelity-architecture.md](docs/fidelity-architecture.md)

## 特性

- **设计还原度校验（fidelity）** - Figma 节点树 vs DOM computed style 的属性级比对，输出选择器 + 期望值 + 实际值的结构化差异清单，供 AI 自检回路消费；像素比对只做区域定位与裁图，LLM 仅在开启时描述结构化无法解释的区域
- **Storybook 自动发现** - 从 `/index.json` 自动发现所有 Story，无需逐一配置测试目标
- **Figma REST 基准图** - 直接通过 Figma REST API 拉取节点位图，按文件版本缓存，倍率与截图 DPR 自动对齐
- **LLM 智能分析（可选，默认关闭）** - 支持 Anthropic Claude / OpenAI GPT-4o，对回归差异做分类说明
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
    "@kit/visual-testing": "workspace:^"
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

# Figma 基准图 / fidelity：走 REST API，不需要额外依赖，只需 FIGMA_TOKEN（或 FIGMA_API_KEY）
# （已废弃的 figma-mcp provider 才需要 @modelcontextprotocol/sdk）
```

---

## 快速开始

### 1. 初始化配置

```bash
npx visual-test init
```

交互式填写项目名、基准图 provider（`local` 或 `figma-api`）与是否启用 LLM 分析，生成
`visual-test.config.ts` 和 `.visual-test/`（含 `fidelity/`）目录结构。选 `figma-api` 时可
顺带填 Figma fileKey；access token 一律走环境变量 `FIGMA_TOKEN`（也接受 Figma MCP server 用的 `FIGMA_API_KEY`），init 不会把任何密钥写进配置文件。

生成的配置已包含 `screenshot.deviceScaleFactor`、`ci.gate: 'pixel'` 和 `fidelity` 段，
按需取消注释即可。

跳过交互直接使用默认值（`local` provider + 关闭 LLM）：

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

### 4. 对照 Figma 校验还原度（开发阶段）

```bash
export FIGMA_TOKEN=figd_xxx   # Figma → Settings → Security → Personal access tokens

npx visual-test fidelity \
  --figma "https://www.figma.com/design/<fileKey>/<name>?node-id=12-34" \
  --url http://localhost:5173/hero
```

输出 `.visual-test/fidelity/<nodeId>/fidelity.md`，按 Major → missing → Minor 列出每处属性差异。详见下方「设计还原度校验」。

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
    deviceScaleFactor: 1,                     // 设备像素比；Figma 位图导出倍率跟随此值
    context: {                                // BrowserContext：登录态与可复现性
      storageState: undefined,                // Playwright storageState 文件（登录态）
      cookies: [],                            // 或直接注入 Cookie
      extraHTTPHeaders: undefined,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      reducedMotion: 'reduce',
    },
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
    provider: 'local',  // 'local' | 'figma-api' | 'figma-mcp'（已废弃）
    figma: {
      fileKey: process.env.FIGMA_FILE_KEY,
      accessToken: process.env.FIGMA_TOKEN,  // 也可只设环境变量
    },
  },

  // LLM 分析配置（默认关闭）
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
    gate: 'pixel',            // 'pixel'（默认，像素比对未通过即失败，确定性）| 'severity'（按 LLM/规则 severity 判定）
    failOnSeverity: 'major',  // gate = 'severity' 时生效
  },

  // 设计还原度校验（fidelity 命令）
  fidelity: {
    rootSelector: undefined,           // 默认依次尝试 [data-figma=<rootId>]、#app > *、body > *
    viewport: 'frame',                 // 跟随 Figma Frame 尺寸，或 { width, height }
    tolerances: {
      position: 2, size: 2,            // px
      colorDeltaE: 3, colorDeltaEMajor: 6,
      geometryMajor: 8,
      spacing: 2, radius: 2, lineHeight: 1, borderWidth: 0.5, opacity: 0.05,
    },
    tokens: { cssFile: 'public/assets/theme.css', prefix: '--aix-' },  // 期望色 → CSS 变量名
    match: { textSimilarity: 0.9, geometryIoU: 0.6 },
    extract: { maxDepth: 12, maxNodes: 2000 },
    crops: { enabled: true, padding: 8 },
    vision: { enabled: false },        // 对未解释区域做 LLM 视觉描述（需 llm 配置）
    output: { dir: '.visual-test/fidelity', formats: ['md', 'json'] },
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

### Figma 基准图（REST API）

用 Figma 节点位图作为回归基线。位图导出倍率自动跟随 `screenshot.deviceScaleFactor`，
并按 Figma 文件版本缓存在 `.visual-test/cache/figma/`，文件未改动时不重复下载。

```typescript
export default defineConfig({
  baseline: {
    provider: 'figma-api',
    figma: {
      fileKey: process.env.FIGMA_FILE_KEY,
      accessToken: process.env.FIGMA_TOKEN,   // 或只设环境变量 FIGMA_TOKEN
    },
  },
  screenshot: {
    viewports: [
      { name: 'mobile',  width: 375,  height: 812 },
      { name: 'desktop', width: 1440, height: 900 },
    ],
  },
  targets: [
    {
      name: 'button',
      variants: [
        {
          name: 'primary',
          url: 'http://localhost:6006/iframe.html?id=button--primary',
          baseline: {
            type: 'figma-api',
            source: '123:456',                 // 默认节点
            perViewport: {                     // 多 viewport 时按名字映射到不同 Frame
              mobile: '123:900',
              desktop: '123:456',
            },
          },
        },
      ],
    },
  ],
});
```

Token 需要 `file_content:read`（节点与位图）和 `file_metadata:read`（版本缓存）两个 scope。

> `figma-mcp` provider 已废弃：它通过 `npx figma-developer-mcp` 子进程走 stdio 下载位图，
> 无法按版本缓存且参数随 server 实现变化，将在下个 major 移除。

同步基准图：

```bash
npx visual-test sync
npx visual-test sync --target button  # 仅同步 button
```

> 跨平台提示：macOS 与 Linux 的字体光栅化不同，本机录制的基线在 Linux CI 上会大面积失败。
> 需要在 CI 用像素基线时，请在与 CI 相同的 Docker 镜像（如 `mcr.microsoft.com/playwright`）内录制。

---

## 设计还原度校验（fidelity）

面向「AI 从 Figma 生成页面后自检」的开发阶段回路。它**不是门禁**：退出码 0 表示完成、2 表示配置/网络/页面错误，差异数不影响退出码。

### 原理

```
Figma REST 节点树 ──► DesignSpec（相对坐标、色值、字体、auto-layout）
                                           │
Playwright 渲染 ──► DOM getBoundingClientRect + getComputedStyle ──► RenderSpec
                                           │
                     NodeMatcher：data-figma 属性 → 文本 → 几何 IoU（一对一）
                                           │
                     PropertyDiffEngine：逐属性容差判定（ΔE2000 色差、px 容差）
                                           │
                     像素比对只用来定位差异区域并裁图；LLM 仅在 --llm-vision 时描述「结构化无法解释」的区域
                                           │
                     fidelity.md（面向 agent）+ fidelity.json
```

期望值来自 Figma 的精确数值，实际值来自 DOM 的精确数值，**不让 LLM 从像素里猜数字**。

### 命令

```bash
visual-test fidelity \
  --figma "https://www.figma.com/design/<key>/<name>?node-id=12-34" \   # 或 "<fileKey>:<nodeId>" / "<nodeId>"
  --url http://localhost:5173/hero \
  [--selector "#hero"]            # 根元素；默认 [data-figma=<nodeId>] → #app > * → body > *
  [--viewport frame|1440x900]     # 默认跟随 Frame 尺寸
  [--theme light|dark]
  [--out .visual-test/fidelity/hero]
  [--format md,json]
  [--refresh]                     # 忽略 Figma 缓存
  [--llm-vision]                  # 对未解释区域做一句话视觉描述（需 llm 配置）
  [--json]                        # stdout 只输出 JSON，供程序消费
```

### 报告样例

```markdown
# Fidelity Report: Hero (12:34) ↔ http://localhost:5173/hero

- Figma version 2145 · viewport 1200×400 @1x · matched 38/41 · major 3 · minor 7 · missing 2 · pixel mismatch 6.8%
- score 71（仅供趋势观察，不作判定）

## Major

### Title：字号不一致（另 1 项）
- Figma: Title (12:36) · DOM: `.hero__title` · match: text (100%)
- [**major**] fontSize: 期望 28px，实际 24px（Δ -4）
- [minor] color: 期望 #1f2329 → `var(--aix-colorText)`，实际 #333333（ΔE 4.2）

### 未找到对应元素：Badge
- Figma: Badge (12:38) · bounds (320, 48) 96×24 · type INSTANCE · component 9:1
- 裁图: crops/region-2-design.png · crops/region-2-render.png

## Minor

### CTA：圆角不一致
- Figma: CTA (12:40) · DOM: `[data-figma="12:40"]` · match: attr
- [minor] borderRadius: 期望 8px 8px 8px 8px，实际 4px 4px 4px 4px（最大 Δ 4）

### 未找到对应元素（图标/图片）：Icon
- Figma: Icon (12:50) · bounds (1140, 48) 24×24 · type VECTOR

## 未解释的差异区域
- region-4 (880, 120) 64×64 · nodes 12:50 · 裁图 crops/region-4-design.png · crops/region-4-render.png
```

### 容差与 severity

| 属性 | 容差 | 超容差 | 备注 |
|---|---|---|---|
| x / y / width / height | ±2px | Δ > 8 major，否则 minor | 字体族失配时 TEXT 节点降为 minor |
| color / backgroundColor | ΔE2000 < 3 | ΔE > 6 major，否则 minor | 期望色命中 `tokens.cssFile` 中的变量时附 `var(--xxx)` 提示 |
| fontSize / fontWeight / text | 精确 | major | |
| fontFamily | Figma 字体族 ∈ CSS 字体栈 | minor | |
| borderRadius / padding / gap / lineHeight / letterSpacing / borderWidth / opacity / boxShadow 有无 | 见配置 | minor | Figma AUTO 行高、SPACE_BETWEEN 的 gap 跳过；gap 按主轴选 column-gap / row-gap；`border-radius: 50%` 按 min(w,h) 折算 |
| 颜色实际值为 transparent | — | minor | 背景可能由父元素提供，附提示 |
| 未匹配到 DOM 元素 | — | missing | 容器 / 文本缺失进 Major；图标等叶子缺失进 Minor，由像素裁图兜底 |

`score = 100 − major×5 − minor×1 − 容器缺失×8 − 叶子缺失×2`，仅供趋势观察。

### `data-figma` 约定（让匹配从「推断」变成「确定」）

生成代码时给每个对应 Figma 具名 FRAME / INSTANCE / COMPONENT 的元素加 `data-figma="<nodeId>"`（文本节点不需要，靠文本匹配）：

```vue
<section class="hero" data-figma="12:34">
  <h1 class="hero__title">欢迎使用管理后台</h1>
  <button class="hero__cta" data-figma="12:40">立即开始</button>
</section>
```

生产构建剥离：

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { stripFigmaAttrs } from '@kit/visual-testing/vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          nodeTransforms: mode === 'production' ? [stripFigmaAttrs()] : [],
        },
      },
    }),
  ],
}));
```

覆盖静态属性 `data-figma="…"` 与动态绑定 `:data-figma="…"`；不覆盖对象展开 `v-bind="{ 'data-figma': id }"` 和 TSX 组件。
`v-for` 渲染的列表项不要共用同一个 nodeId，重复的 `data-figma` 只会匹配第一个元素，报告会给出 warning。

### 接入 AI 自检回路

1. 针对 **mock 数据路由或组件预览路由**运行（接了真实接口后文案与设计稿不一致，文本匹配失效）
2. 需要登录的页面在 `screenshot.context.storageState` 或 `cookies` 里提供登录态
3. 对每个还原的 Frame 执行 `visual-test fidelity --json`
4. 按 Major → missing → Minor 顺序修改代码，重跑
5. `summary.major === 0 && summary.missing === 0` 或达到 3 轮即停止

### 已知限制

- `getComputedStyle` 拿到的是解析后的色值，**无法判断实现是否用了 CSS 变量**；报告只给「期望色对应变量 X」，是否使用变量交给 `pnpm checkCssVars`
- 设计字体本机未安装时，文本宽高差异不可靠；报告会把此类差异降为 minor
- Figma padding 在容器上、实现可能写在子元素 margin 上，会报 padding 差异，需按视觉间距核对
- 阴影只比有无，不比参数

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
| `fixPlan` | 修复计划（按优先级分组） |
| `nextActions` | 下一步行动建议 |

### Fidelity 报告（fidelity.md / fidelity.json）

见「设计还原度校验」一节。

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
| `visual-test test --ci` | CI 模式：失败时 exit code 1（判定依据见 `ci.gate`） |
| `visual-test test --no-llm` | 禁用本次运行的 LLM 分析 |
| `visual-test test --debug` | 开启 debug 日志 |
| `visual-test test -c custom.config.ts` | 使用指定配置文件 |
| `visual-test fidelity --figma <ref> --url <url>` | 设计还原度校验，输出 fidelity.md / fidelity.json |
| `visual-test fidelity ... --json` | 只向 stdout 输出结果 JSON |
| `visual-test fidelity ... --refresh` | 忽略 Figma 缓存 |
| `visual-test fidelity ... --llm-vision` | 对未解释区域做 LLM 视觉描述 |

---

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | 使用 Claude 时 |
| `OPENAI_API_KEY` | OpenAI API Key | 使用 GPT-4o 时 |
| `FIGMA_FILE_KEY` | Figma 文件 Key（配置里 `baseline.figma.fileKey` 的常见来源） | 基线用纯 nodeId 引用时 |
| `FIGMA_TOKEN` | Figma Personal Access Token（scope：`file_content:read`、`file_metadata:read`）。也接受 `FIGMA_ACCESS_TOKEN` / `FIGMA_API_KEY`，后者是 Figma MCP server 的约定 | `figma-api` provider 与 `fidelity` 命令 |

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

### 设计还原度校验

```typescript
import { FidelityOrchestrator, loadConfig } from '@kit/visual-testing';

const config = await loadConfig();
const fidelity = new FidelityOrchestrator(config);

const { result, reports } = await fidelity.run({
  figma: 'https://www.figma.com/design/KEY/Name?node-id=12-34',
  url: 'http://localhost:5173/hero',
});

console.log(result.summary);      // { total, matched, missing, major, minor, info, score }
for (const m of result.matches) {
  if (!m.render) console.log('missing', m.design.name);
  for (const d of m.diffs) console.log(m.render?.selector, d.property, d.expected, d.actual, d.severity);
}
console.log(reports.md);          // .visual-test/fidelity/12-34/fidelity.md
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
.visual-test/fidelity/

# 基准图：提交到 git 以追踪设计变化
# .visual-test/baselines/  <- 不要忽略
```

---

## 架构

```
src/
├── core/
│   ├── baseline/          # 基准图提供器
│   │   ├── local-provider.ts     # 本地文件读取
│   │   ├── figma-api-provider.ts # Figma REST（推荐，按版本缓存）
│   │   └── figma-mcp-provider.ts # Figma MCP（已废弃）
│   ├── figma/             # Figma REST 客户端（provider 与 fidelity 共用）
│   │   ├── client.ts             # 鉴权、错误归类、429 退避、位图下载
│   │   └── url.ts                # 解析 figma.com URL / fileKey:nodeId
│   ├── fidelity/          # 设计还原度校验
│   │   ├── orchestrator.ts       # FidelityOrchestrator
│   │   ├── figma-spec-extractor.ts  # 节点树 → DesignSpec
│   │   ├── dom-extractor.ts / .browser.ts  # DOM → RenderSpec（浏览器内脚本以字符串注入）
│   │   ├── node-matcher.ts       # attr → text → geometry 三级匹配
│   │   ├── property-diff.ts      # 容差 + severity + token 提示
│   │   ├── token-mapper.ts       # 色值 → CSS 变量名
│   │   └── crop.ts               # 差异区域裁图与节点关联
│   ├── screenshot/        # 截图引擎
│   │   ├── playwright-engine.ts  # Playwright 截图（capture / withPage）
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
│   │   ├── conclusion-reporter.ts # 结论报告（评分/修复计划）
│   │   └── fidelity-reporter.ts   # fidelity.md / fidelity.json
│   ├── config/            # 配置系统（Zod Schema）
│   ├── storybook/         # Storybook 自动发现
│   ├── server/            # 开发服务器管理
│   └── orchestrator.ts    # 回归测试编排器
├── cli/                   # CLI 命令（init/sync/test/fidelity）
├── vite/                  # @kit/visual-testing/vite：stripFigmaAttrs 编译期剥离
├── utils/                 # 工具函数（logger/cache/image/color）
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
