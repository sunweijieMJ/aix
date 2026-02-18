/**
 * Figma 集成示例 - 从设计稿获取基准图
 *
 * 适用场景：
 * - 设计师使用 Figma 设计组件
 * - 需要确保实现与设计稿一致
 * - 启用 LLM 分析差异
 */

import { defineConfig } from '@kit/visual-testing';

export default defineConfig({
  server: {
    url: 'http://localhost:5173',
  },

  screenshot: {
    viewport: { width: 1280, height: 720 },
    stability: {
      disableAnimations: true,
      waitForNetworkIdle: true,
      extraDelay: 500,
    },
  },

  comparison: {
    threshold: 0.02, // Figma 导出可能有细微差异，适当放宽阈值
    antialiasing: true,
  },

  // 🔥 Figma MCP 基准图
  baseline: {
    provider: 'figma-mcp',
    figma: {
      // 从环境变量读取
      fileKey: process.env.FIGMA_FILE_KEY,
    },
  },

  // 🔥 启用 LLM 分析
  llm: {
    enabled: true,
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,

    // 成本控制
    costControl: {
      maxCallsPerRun: 20, // 最多调用 20 次 LLM
      diffThreshold: 5, // 差异 < 5% 时不调用 LLM
      cacheEnabled: true, // 启用缓存
      cacheTTL: 3600, // 缓存 1 小时
    },
  },

  // 测试目标（使用 Figma 节点 ID 作为基准图）
  targets: [
    {
      name: 'button',
      type: 'component',
      variants: [
        {
          name: 'primary',
          url: 'http://localhost:5173/components/button?variant=primary',
          baseline: {
            type: 'figma-mcp',
            source: '123:456', // Figma 节点 ID
            fileKey: process.env.FIGMA_FILE_KEY,
          },
        },
        {
          name: 'secondary',
          url: 'http://localhost:5173/components/button?variant=secondary',
          baseline: {
            type: 'figma-mcp',
            source: '123:789',
            fileKey: process.env.FIGMA_FILE_KEY,
          },
        },
      ],
    },
  ],

  report: {
    formats: ['html', 'json'],
    conclusion: true, // 启用结论报告（包含 LLM 分析结果）
  },
});
