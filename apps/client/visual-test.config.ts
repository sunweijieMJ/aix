/**
 * AIX Client 视觉测试配置
 *
 * 针对实际 Demo 页面进行视觉回归测试：
 * - 启动 Dev Server：pnpm dev（端口 5173）
 * - 首次运行：pnpm visual-test:update（捕获基准图）
 * - 日常测试：pnpm visual-test
 */

import { defineConfig } from '@kit/visual-testing';

const BASE_URL = 'http://localhost:5173';

export default defineConfig({
  name: 'aix-client',

  directories: {
    baselines: '.visual-test/baselines',
    actuals: '.visual-test/actuals',
    diffs: '.visual-test/diffs',
    reports: '.visual-test/reports',
  },

  server: {
    url: BASE_URL,
  },

  screenshot: {
    viewport: { width: 1280, height: 720 },
    stability: {
      waitForNetworkIdle: true,
      waitForAnimations: true,
      disableAnimations: true,
      extraDelay: 500,
    },
  },

  comparison: {
    threshold: 0.0005, // 0.05% 以内视为通过
    antialiasing: true,
  },

  baseline: {
    provider: 'local',
  },

  targets: [
    {
      name: 'button-demo',
      type: 'component',
      variants: [
        {
          name: 'default',
          url: `${BASE_URL}/?tab=button`,
          baseline: 'component/button-demo/default.png',
          selector: '.el-tab-pane:not([style]) .demo-page',
        },
      ],
    },
    {
      name: 'icons-demo',
      type: 'component',
      variants: [
        {
          name: 'default',
          url: `${BASE_URL}/?tab=icons`,
          baseline: 'component/icons-demo/default.png',
          selector: '.el-tab-pane:not([style]) .demo-page',
        },
      ],
    },
    {
      name: 'pdf-viewer-demo',
      type: 'component',
      variants: [
        {
          name: 'default',
          url: `${BASE_URL}/?tab=pdf-viewer`,
          baseline: 'component/pdf-viewer-demo/default.png',
          selector: '.el-tab-pane:not([style]) .demo-page',
        },
      ],
    },
    {
      name: 'subtitle-demo',
      type: 'component',
      variants: [
        {
          name: 'default',
          url: `${BASE_URL}/?tab=subtitle`,
          baseline: 'component/subtitle-demo/default.png',
          selector: '.el-tab-pane:not([style]) .demo-page',
        },
      ],
    },
    {
      name: 'video-demo',
      type: 'component',
      variants: [
        {
          name: 'default',
          url: `${BASE_URL}/?tab=video`,
          baseline: 'component/video-demo/default.png',
          selector: '.el-tab-pane:not([style]) .demo-page',
        },
      ],
    },
  ],

  llm: {
    enabled: false,
  },

  performance: {
    concurrent: {
      maxBrowsers: 1,
      maxTargets: 3,
    },
  },

  report: {
    formats: ['html', 'json'],
    conclusion: false,
  },

  ci: {
    failOnDiff: true,
    failOnSeverity: 'major',
  },
});
