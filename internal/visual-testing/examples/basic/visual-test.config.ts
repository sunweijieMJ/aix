/**
 * 基础示例 - 最简配置
 *
 * 适用场景：
 * - 本地开发环境
 * - 基准图已准备好（存放在 baselines/ 目录）
 * - 无需 LLM 分析
 */

import { defineConfig } from '@kit/visual-testing';

export default defineConfig({
  // 服务器配置（截图目标）
  server: {
    url: 'http://localhost:5173',
  },

  // 截图配置
  screenshot: {
    viewport: { width: 1280, height: 720 },
    stability: {
      disableAnimations: true,
      waitForNetworkIdle: true,
      extraDelay: 500,
    },
  },

  // 比对配置
  comparison: {
    threshold: 0.01, // 1% 差异以内视为通过
    antialiasing: true,
  },

  // 基准图来源（本地文件）
  baseline: {
    provider: 'local',
  },

  // LLM 分析（禁用以节省成本）
  llm: {
    enabled: false,
  },

  // 测试目标
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
        {
          name: 'secondary',
          url: 'http://localhost:5173/components/button?variant=secondary',
          baseline: './baselines/button-secondary.png',
        },
      ],
    },
    {
      name: 'input',
      type: 'component',
      variants: [
        {
          name: 'default',
          url: 'http://localhost:5173/components/input',
          baseline: './baselines/input-default.png',
        },
      ],
    },
  ],

  // 报告格式
  report: {
    formats: ['html', 'json'],
    conclusion: false, // 不生成结论报告（无 LLM 分析时用处不大）
  },
});
