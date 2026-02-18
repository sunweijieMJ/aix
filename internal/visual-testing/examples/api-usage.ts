/**
 * @kit/visual-testing API 使用示例
 *
 * 以下示例展示如何在代码中使用视觉测试系统。
 */

import { defineConfig, VisualTestOrchestrator } from '@kit/visual-testing';

// ---- 示例 1: 快速开始（自动搜索配置文件） ----

export async function quickStart() {
  const tester = await VisualTestOrchestrator.create();
  const results = await tester.runTests();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed`);
}

// ---- 示例 2: 从指定配置文件创建 ----

export async function fromConfigFile() {
  const tester = await VisualTestOrchestrator.create('./visual-test.config.ts');
  const results = await tester.runTests();

  for (const result of results) {
    console.log(
      `${result.target}/${result.variant}: ${result.passed ? 'PASS' : 'FAIL'} (${result.mismatchPercentage.toFixed(2)}%)`,
    );
  }
}

// ---- 示例 3: 运行特定目标 ----

export async function runSpecificTargets() {
  const tester = await VisualTestOrchestrator.create();

  // 只运行 button 和 input 组件的测试
  const results = await tester.runTests(['button', 'input']);

  for (const result of results) {
    if (!result.passed && result.analysis) {
      console.log(`\n${result.target}/${result.variant}:`);
      for (const diff of result.analysis.differences) {
        console.log(
          `  [${diff.severity}] ${diff.location}: ${diff.description}`,
        );
      }
    }
  }
}

// ---- 示例 4: 直接传入配置对象 ----

export async function withInlineConfig() {
  const tester = await VisualTestOrchestrator.create({
    server: {
      url: 'http://localhost:6006',
    },
    comparison: {
      threshold: 0.05,
    },
    llm: {
      enabled: true,
      model: 'claude-sonnet-4-20250514',
    },
    targets: [
      {
        name: 'button',
        type: 'component',
        variants: [
          {
            name: 'primary',
            url: 'http://localhost:6006/iframe.html?id=button--primary&viewMode=story',
            baseline: {
              type: 'local',
              source: './baselines/button-primary.png',
            },
            selector: '#storybook-root > *',
          },
        ],
      },
    ],
  });

  const results = await tester.runTests();
  console.log(`Done: ${results.length} tests`);
}

// ---- 示例 5: 使用 defineConfig 获取类型提示 ----

export const config = defineConfig({
  name: 'my-project',
  server: {
    url: 'http://localhost:6006',
    command: 'pnpm storybook:dev --no-open',
    waitOn: 'http://localhost:6006',
  },
  screenshot: {
    viewport: { width: 1280, height: 720 },
    stability: {
      disableAnimations: true,
      extraDelay: 1000,
    },
  },
  targets: [
    {
      name: 'dashboard',
      type: 'page',
      variants: [
        {
          name: 'desktop',
          url: 'http://localhost:3000/dashboard',
          baseline: './baselines/dashboard-desktop.png',
        },
        {
          name: 'mobile',
          url: 'http://localhost:3000/dashboard',
          baseline: './baselines/dashboard-mobile.png',
          viewport: { width: 375, height: 812 },
        },
      ],
    },
  ],
});
