/**
 * 视觉测试配置 Zod Schema
 *
 * 定义所有配置选项的类型验证规则和默认值。
 */

import { z } from 'zod';

// ---- 子 Schema ----

const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const namedViewportSchema = viewportSchema.extend({
  name: z.string().min(1),
});

const waitStrategySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('selector'),
    selector: z.string(),
    state: z.enum(['visible', 'hidden']).optional(),
  }),
  z.object({
    type: z.literal('network'),
    value: z.enum(['idle', 'load']),
  }),
  z.object({
    type: z.literal('timeout'),
    duration: z.number().positive(),
  }),
]);

const replaceSelectorSchema = z.object({
  selector: z.string(),
  replacement: z.string(),
});

const retrySchema = z.object({
  /** 重试次数 */
  attempts: z.number().int().min(1).default(1),
  /** 连续截图间隔 (ms) */
  compareInterval: z.number().positive().default(200),
  /** 一致性阈值 */
  consistencyThreshold: z.number().min(0).max(1).default(0.001),
});

const stabilitySchema = z.object({
  waitForNetworkIdle: z.boolean().default(true),
  waitForAnimations: z.boolean().default(true),
  extraDelay: z.number().min(0).default(500),
  disableAnimations: z.boolean().default(true),
  hideSelectors: z.array(z.string()).default([]),
  retry: retrySchema.optional(),
  maskSelectors: z.array(z.string()).optional(),
  replaceSelectors: z.array(replaceSelectorSchema).optional(),
  waitStrategies: z.array(waitStrategySchema).optional(),
});

const browserSchema = z.object({
  type: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  headless: z.boolean().default(true),
  channel: z.string().optional(),
});

const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
});

/** BrowserContext 级配置：登录态注入、区域/时区固定，保证截图可复现 */
const browserContextSchema = z.object({
  /** Playwright storageState 文件路径（登录态） */
  storageState: z.string().optional(),
  /** 直接注入的 Cookie 列表 */
  cookies: z.array(cookieSchema).default([]),
  /** 附加请求头（如 Authorization） */
  extraHTTPHeaders: z.record(z.string(), z.string()).optional(),
  locale: z.string().default('zh-CN'),
  timezoneId: z.string().default('Asia/Shanghai'),
  /** 通过媒体查询让页面自行关闭动画，比注入 CSS 更早生效 */
  reducedMotion: z.enum(['reduce', 'no-preference']).default('reduce'),
});

const screenshotSchema = z.object({
  viewport: viewportSchema.default({ width: 1280, height: 720 }),
  viewports: z.array(namedViewportSchema).default([]),
  /**
   * 设备像素比。Figma 位图导出的 scale 跟随此值，保证基线与截图尺寸一致。
   * 默认 1；需要更清晰的裁图时可设 2（像素数 ×4）。
   */
  deviceScaleFactor: z.number().positive().max(4).default(1),
  context: browserContextSchema.default(browserContextSchema.parse({})),
  stability: stabilitySchema.default(stabilitySchema.parse({})),
  browsers: z.array(browserSchema).default([browserSchema.parse({})]),
});

const comparisonSchema = z.object({
  threshold: z.number().min(0).max(1).default(0.01),
  antialiasing: z.boolean().default(true),
});

const figmaConfigSchema = z.object({
  accessToken: z.string().optional(),
  fileKey: z.string().optional(),
});

const baselineSchema = z.object({
  /**
   * 默认基准图来源。
   * - local：本地文件
   * - figma-api：Figma REST API（推荐）
   * - figma-mcp：已废弃，通过 MCP 子进程下载，下个 major 移除
   */
  provider: z.enum(['figma-api', 'figma-mcp', 'local']).default('local'),
  figma: figmaConfigSchema.optional(),
});

const costControlSchema = z.object({
  maxCallsPerRun: z.number().int().positive().default(50),
  /** 差异百分比低于此值时跳过 LLM 分析（默认 5%） */
  diffThreshold: z.number().min(0).max(100).default(5),
  cacheEnabled: z.boolean().default(true),
  cacheTTL: z.number().positive().default(3600),
  /** 可选：单次运行最大预算（USD），累计预估成本达到后停止调用 LLM */
  maxBudget: z.number().positive().optional(),
});

const fallbackSchema = z.object({
  onError: z.enum(['skip', 'retry', 'rule-based']).default('skip'),
  retryAttempts: z.number().int().min(0).default(2),
  timeout: z.number().positive().default(30000),
  fallbackToRuleBase: z.boolean().default(true),
});

/** 单个 LLM 端点配置 */
const llmEndpointSchema = z.object({
  /** API 密钥 */
  apiKey: z.string().optional(),
  /** 模型名称 */
  model: z.string().optional(),
  /** API 端点 URL（支持 OpenAI 兼容厂商、Azure 等） */
  baseURL: z.string().optional(),
  /** 最大输出 token 数 */
  maxTokens: z.number().positive().optional(),
  /** 请求超时（毫秒） */
  timeout: z.number().positive().optional(),
  /** 最大重试次数 */
  maxRetries: z.number().int().min(0).optional(),
  /** 温度参数 */
  temperature: z.number().min(0).max(2).optional(),
});

const llmSchema = z.object({
  /** 是否启用 LLM 分析。默认关闭：测试工具不应默认发起付费外部调用 */
  enabled: z.boolean().default(false),
  /** 默认 API 密钥（analyze/suggestFix 未指定时使用） */
  apiKey: z.string().optional(),
  /** 默认模型（analyze/suggestFix 未指定时使用） */
  model: z.string().default('gpt-4o'),
  /** 默认 API 端点 */
  baseURL: z.string().optional(),
  /** 视觉分析专用配置（覆盖默认值） */
  analyze: llmEndpointSchema.default(llmEndpointSchema.parse({})),
  /** 修复建议专用配置（覆盖默认值，可使用更便宜的模型） */
  suggestFix: llmEndpointSchema.default(llmEndpointSchema.parse({})),
  costControl: costControlSchema.default(costControlSchema.parse({})),
  fallback: fallbackSchema.default(fallbackSchema.parse({})),
});

const baselineSourceSchema = z.union([
  z.string(),
  z.object({
    type: z.enum(['figma-api', 'figma-mcp', 'local']),
    source: z.string(),
    fileKey: z.string().optional(),
    /**
     * 多 viewport 时每个 viewport 对应的 Figma 节点 ID（key 为 viewport.name）。
     * 未配置的 viewport 回落到 source。
     */
    perViewport: z.record(z.string(), z.string()).optional(),
  }),
]);

const variantSchema = z.object({
  name: z.string().min(1),
  url: z.string(),
  baseline: baselineSourceSchema,
  selector: z.string().optional(),
  waitFor: z.string().optional(),
  threshold: z.number().min(0).max(1).optional(),
  viewport: viewportSchema.optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

const targetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['component', 'page', 'element']).default('component'),
  variants: z.array(variantSchema),
});

const reportSchema = z.object({
  formats: z.array(z.enum(['html', 'json'])).default(['html', 'json']),
  conclusion: z.boolean().default(true),
});

const ciSchema = z.object({
  failOnDiff: z.boolean().default(true),
  /**
   * 门禁判定依据。
   * - pixel（默认）：像素比对未通过即失败，确定性
   * - severity：按 LLM / 规则引擎给出的 severity 是否达到 failOnSeverity 判定（旧行为，非确定性）
   */
  gate: z.enum(['pixel', 'severity']).default('pixel'),
  failOnSeverity: z.enum(['critical', 'major', 'minor', 'trivial']).default('major'),
});

// ---- Fidelity（设计还原度）配置 ----

const fidelityTolerancesSchema = z.object({
  /** 位置 x / y 容差 (px) */
  position: z.number().min(0).default(2),
  /** 尺寸 width / height 容差 (px) */
  size: z.number().min(0).default(2),
  /** 颜色 ΔE2000 容差 */
  colorDeltaE: z.number().min(0).default(3),
  /** 颜色 ΔE2000 超过此值升为 major */
  colorDeltaEMajor: z.number().min(0).default(6),
  /** 位置 / 尺寸偏差超过此值升为 major (px) */
  geometryMajor: z.number().min(0).default(8),
  /** padding / gap 容差 (px) */
  spacing: z.number().min(0).default(2),
  /** 圆角容差 (px) */
  radius: z.number().min(0).default(2),
  /** 行高容差 (px) */
  lineHeight: z.number().min(0).default(1),
  /** 字距容差 (px) */
  letterSpacing: z.number().min(0).default(1),
  /** 描边宽度容差 (px) */
  borderWidth: z.number().min(0).default(0.5),
  /** 透明度容差 */
  opacity: z.number().min(0).max(1).default(0.05),
});

const fidelitySchema = z.object({
  /** 根元素选择器；未指定时依次尝试 [data-figma=<rootId>]、#app > *、body > * */
  rootSelector: z.string().optional(),
  /** 视口：'frame' 跟随 Figma Frame 尺寸，或显式指定 */
  viewport: z.union([z.literal('frame'), viewportSchema]).default('frame'),
  tolerances: fidelityTolerancesSchema.default(fidelityTolerancesSchema.parse({})),
  /** 颜色 → CSS 变量映射来源 */
  tokens: z
    .object({
      cssFile: z.string().optional(),
      prefix: z.string().default('--'),
    })
    .default({ prefix: '--' }),
  match: z
    .object({
      /** 文本相似度阈值，低于视为未匹配 */
      textSimilarity: z.number().min(0).max(1).default(0.9),
      /** 几何匹配 IoU 阈值 */
      geometryIoU: z.number().min(0).max(1).default(0.6),
    })
    .default({ textSimilarity: 0.9, geometryIoU: 0.6 }),
  extract: z
    .object({
      maxDepth: z.number().int().positive().default(12),
      maxNodes: z.number().int().positive().default(2000),
    })
    .default({ maxDepth: 12, maxNodes: 2000 }),
  crops: z
    .object({
      enabled: z.boolean().default(true),
      padding: z.number().int().min(0).default(8),
    })
    .default({ enabled: true, padding: 8 }),
  /**
   * 多宽度健壮性探测：在更窄的视口重新测量，发现横向溢出、写死宽度、内容裁切。
   * 静态比对只在设计稿尺寸下进行，会奖励写死宽高的实现，这里做兜底。
   */
  responsive: z
    .object({
      enabled: z.boolean().default(true),
      /** 探测宽度；留空则由设计稿宽度自动推导（70% / 768 / 375） */
      widths: z.array(z.number().int().positive()).default([]),
    })
    .default({ enabled: true, widths: [] }),
  /** 交互反馈探测：真实 hover 每个可交互元素，报告毫无视觉反馈的 */
  interaction: z
    .object({
      enabled: z.boolean().default(true),
      maxElements: z.number().int().positive().default(40),
    })
    .default({ enabled: true, maxElements: 40 }),
  /** 对无法用结构化差异解释的区域做 LLM 视觉描述（默认关闭，需 llm 配置） */
  vision: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  output: z
    .object({
      dir: z.string().default('.visual-test/fidelity'),
      formats: z.array(z.enum(['md', 'json'])).default(['md', 'json']),
    })
    .default({ dir: '.visual-test/fidelity', formats: ['md', 'json'] }),
});

const concurrentSchema = z.object({
  maxBrowsers: z.number().int().positive().default(3),
  maxTargets: z.number().int().positive().default(10),
  poolSize: z.number().int().positive().default(5),
});

const performanceSchema = z.object({
  /** 单个测试任务的超时时间 (ms) */
  timeout: z.number().positive().default(120_000),
  concurrent: concurrentSchema.default(concurrentSchema.parse({})),
});

const loggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const directoriesSchema = z.object({
  baselines: z.string().default('.visual-test/baselines'),
  actuals: z.string().default('.visual-test/actuals'),
  diffs: z.string().default('.visual-test/diffs'),
  reports: z.string().default('.visual-test/reports'),
});

const serverSchema = z.object({
  url: z.string().default('http://localhost:6006'),
  command: z.string().optional(),
  waitOn: z.string().optional(),
  timeout: z.number().positive().default(60_000),
  autoStart: z.boolean().default(false),
});

const storybookSchema = z.object({
  /** 是否启用自动发现 */
  enabled: z.boolean().default(false),
  /** Storybook 服务地址（默认使用 server.url） */
  url: z.string().optional(),
  /** story ID 包含模式 (glob 风格) */
  include: z.array(z.string()).default(['**']),
  /** story ID 排除模式 */
  exclude: z.array(z.string()).default([]),
  /** 默认截图选择器 (Storybook 渲染容器) */
  defaultSelector: z.string().default('#storybook-root'),
  /** 为自动发现的 story 生成的 baseline 前缀目录 */
  baselineDir: z.string().default('storybook'),
});

// ---- 顶层 Schema ----

export const configSchema = z.object({
  /** 项目名称 */
  name: z.string().optional(),
  /** 目录配置 */
  directories: directoriesSchema.default(directoriesSchema.parse({})),
  /** 服务器配置 */
  server: serverSchema.default(serverSchema.parse({})),
  /** Storybook 自动发现配置 */
  storybook: storybookSchema.default(storybookSchema.parse({})),
  /** 截图配置 */
  screenshot: screenshotSchema.default(screenshotSchema.parse({})),
  /** 比对配置 */
  comparison: comparisonSchema.default(comparisonSchema.parse({})),
  /** 基准图配置 */
  baseline: baselineSchema.default(baselineSchema.parse({})),
  /** LLM 配置 */
  llm: llmSchema.default(llmSchema.parse({})),
  /** 测试目标 */
  targets: z.array(targetSchema).default([]),
  /** 报告配置 */
  report: reportSchema.default(reportSchema.parse({})),
  /** CI 配置 */
  ci: ciSchema.default(ciSchema.parse({})),
  /** 设计还原度校验配置（fidelity 命令） */
  fidelity: fidelitySchema.default(fidelitySchema.parse({})),
  /** 性能配置 */
  performance: performanceSchema.default(performanceSchema.parse({})),
  /** 日志配置 */
  logging: loggingSchema.default(loggingSchema.parse({})),
});

/** 从 Schema 推导的完整配置类型 */
export type VisualTestConfig = z.infer<typeof configSchema>;

/** 用户传入的配置类型（所有字段可选） */
export type VisualTestUserConfig = z.input<typeof configSchema>;
