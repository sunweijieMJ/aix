import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      enabled: false,
      include: ['packages/*/src/**/*.{ts,vue}'],
      exclude: [
        '**/*.d.ts',
        '**/types.ts',
        '**/locale/**',
        '**/index.ts',
        '**/__test__/**',
        '**/stories/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
    // 单元测试项目直接引用各包自己的 vitest.config.ts（单一事实来源）：
    // 根口径与 turbo 包级口径跑的是同一份配置；项目名缺省取包目录名（全仓唯一）。
    // 无配置文件的包会被静默跳过——新建包务必带 vitest.config.ts（package-creator 模板已含）。
    projects: [
      'packages/*/vitest.config.ts',
      'kit/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'internal/*/vitest.config.ts',
      // Storybook 交互测试（真实浏览器），仅根口径存在；
      // 单测脚本用 --project '!storybook' 排除，stories 用 --project storybook 单跑
      {
        plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
        test: {
          name: 'storybook',
          // 全要素长文演示（FullInteractionFlow / StreamingLive）按真实打字机速度播放
          // 需 25s+，默认 15s 不够；play 内部各断言仍有独立的更短 waitFor 超时把关。
          testTimeout: 60_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: '.storybook/vitest.setup.ts',
        },
      },
    ],
  },
});
