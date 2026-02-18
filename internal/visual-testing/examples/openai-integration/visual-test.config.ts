/**
 * OpenAI 集成示例 - 使用 GPT-4o 进行视觉分析
 *
 * 适用场景：
 * - 希望降低 LLM 成本（比 Claude 便宜 17%）
 * - 已有 OpenAI API 额度
 * - 企业仅允许使用 OpenAI
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
    threshold: 0.01,
    antialiasing: true,
  },

  baseline: {
    provider: 'local',
  },

  // 🔥 使用 OpenAI GPT-4o
  llm: {
    enabled: true,
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY,

    // 可选：为修复建议使用更便宜的模型
    // suggestFix: { model: 'gpt-4o-mini' },

    // 成本控制
    costControl: {
      maxCallsPerRun: 20,
      diffThreshold: 5, // 差异 < 5% 时不调用 LLM
      cacheEnabled: true,
      cacheTTL: 3600,
    },
  },

  targets: [
    {
      name: 'button',
      type: 'component',
      variants: [
        {
          name: 'primary',
          url: 'http://localhost:5173/components/button?variant=primary',
          baseline: './baselines/button-primary.png',
        },
      ],
    },
  ],

  report: {
    formats: ['html', 'json'],
    conclusion: true,
  },
});
