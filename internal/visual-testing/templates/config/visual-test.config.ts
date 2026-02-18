/**
 * 视觉测试配置示例
 *
 * 复制此文件到项目根目录并重命名为 visual-test.config.ts
 */

import { defineConfig } from '@kit/visual-testing';

export default defineConfig({
  // 项目名称（可选，用于报告标题）
  name: 'my-project',

  // 目录配置
  directories: {
    baselines: '.visual-test/baselines', // 基准图存放目录
    actuals: '.visual-test/actuals', // 实际截图输出目录
    diffs: '.visual-test/diffs', // 差异图输出目录
    reports: '.visual-test/reports', // 报告输出目录
  },

  // 开发服务器配置
  server: {
    url: 'http://localhost:5173', // 页面基础 URL
    // command: 'pnpm dev',               // 可选：自动启动命令
    // waitOn: 'http://localhost:5173',    // 可选：等待服务就绪
    timeout: 60_000, // 启动超时 (ms)
  },

  // 截图配置
  screenshot: {
    viewport: { width: 1280, height: 720 }, // 默认视口尺寸
    // 多视口测试
    viewports: [
      // { name: 'mobile', width: 375, height: 667 },
      // { name: 'tablet', width: 768, height: 1024 },
    ],
    stability: {
      disableAnimations: true, // 禁用 CSS/JS 动画
      waitForNetworkIdle: true, // 等待网络空闲
      waitForAnimations: true, // 等待动画完成
      extraDelay: 500, // 额外等待 (ms)
      hideSelectors: [], // 隐藏动态元素（如时钟）
      // retry: {                          // 截图一致性重试
      //   attempts: 3,
      //   compareInterval: 200,
      //   consistencyThreshold: 0.001,
      // },
    },
  },

  // 像素比对配置
  comparison: {
    threshold: 0.01, // 差异阈值 (0-1, 1% = 0.01)
    antialiasing: true, // 忽略抗锯齿差异
  },

  // 基准图来源配置
  baseline: {
    provider: 'local', // 'local' | 'figma-mcp'
    // Figma 配置（使用 figma-mcp 或 figma-api 时需要）
    // figma: {
    //   accessToken: process.env.FIGMA_TOKEN,
    //   fileKey: 'your-figma-file-key',
    // },
  },

  // LLM 分析配置
  llm: {
    enabled: true, // 是否启用 LLM 分析
    model: 'gpt-4o', // 默认模型 (claude-* 自动使用 Anthropic，其他使用 OpenAI)
    // apiKey: process.env.OPENAI_API_KEY,  // 默认从环境变量读取
    // baseURL: 'https://...',             // 可选：自定义 API 端点（Azure、代理等）

    // 可选：为不同任务使用不同模型
    // analyze: { model: 'gpt-4o' },       // 视觉分析（需要 vision 能力）
    // suggestFix: { model: 'gpt-4o-mini' }, // 修复建议（纯文本，可用便宜模型）

    costControl: {
      maxCallsPerRun: 50, // 每次运行最大 LLM 调用数
      diffThreshold: 5, // 差异低于此百分比不调用 LLM
      cacheEnabled: true, // 缓存分析结果
      cacheTTL: 3600, // 缓存 TTL (秒)
    },
    fallback: {
      onError: 'skip', // LLM 失败策略: 'skip' | 'retry' | 'rule-based'
      retryAttempts: 2,
      timeout: 30_000,
      fallbackToRuleBase: true, // 降级到规则引擎
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
          url: 'http://localhost:5173/components/button/primary',
          baseline: './baselines/button-primary.png',
          // selector: '.aix-button',       // 可选：截取特定元素
          // waitFor: '.aix-button',        // 可选：等待元素出现
          // threshold: 0.05,               // 可选：覆盖全局阈值
          // viewport: { width: 375, height: 667 },  // 可选：覆盖视口
        },
      ],
    },
  ],

  // 报告配置
  report: {
    formats: ['html', 'json'], // 报告格式
    conclusion: true, // 生成结论报告
  },

  // CI 配置
  ci: {
    failOnDiff: true, // 有差异时 CI 失败
    failOnSeverity: 'major', // 失败的最低严重级别
  },
});
