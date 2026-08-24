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
      // 组件包 + 工具包 + 内部基础设施：三处都有单测投入，覆盖率口径应一致
      include: ['packages/*/src/**/*.{ts,vue}', 'kit/*/src/**/*.ts', 'internal/*/src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/types.ts',
        '**/locale/**',
        // 仅排除包入口的纯重导出 index.ts；嵌套 index.ts 可能含真实逻辑
        // （如 hooks/src/use-locale、subtitle/src/parsers），不能用 **/index.ts 全排
        'packages/*/src/index.ts',
        '**/__test__/**',
        '**/stories/**',
      ],
      // 防退化阈值：取当前实测水位下调约 1 个点，作用是"不许再掉"，而非"已经达标"。
      // 目标仍是 80%，但直接把 80 接进 CI 只会立刻红、然后被 continue-on-error 绕过。
      // 补测试拉高水位后，请同步上调这里的数字（实测口径：pnpm test:coverage）。
      // 实测于 2026-08-22：statements 73.67 / branches 67.38 / functions 72.68 / lines 74.77
      thresholds: {
        statements: 72.5,
        branches: 66,
        functions: 71.5,
        lines: 73.5,
      },
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
    // 单元测试项目直接引用各包自己的 vitest.config.ts（单一事实来源）：
    // 根口径与 turbo 包级口径跑的是同一份配置；项目名缺省取 package.json 的 name（全仓唯一）。
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
