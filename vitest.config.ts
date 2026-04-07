import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Storybook 测试项目仅在根目录运行时启用（子包通过 turbo 运行时跳过，避免路径解析问题）
const isRunFromRoot = process.cwd() === dirname;

const projects: any[] = [
  // Project 1: 现有单元测试 (jsdom)
  {
    plugins: [vue()],
    test: {
      name: 'unit',
      globals: true,
      environment: 'jsdom',
      setupFiles: [path.resolve(dirname, 'vitest.setup.ts')],
      include: ['**/__test__/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/lib/**',
        '**/es/**',
      ],
    },
  },
];

// Project 2: Storybook 交互测试 (真实浏览器)
// storybookTest 会通过 Storybook viteFinal 注入 Vue 插件，无需手动添加
if (isRunFromRoot) {
  projects.push({
    plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
    test: {
      name: 'storybook',
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({}),
        instances: [{ browser: 'chromium' }],
      },
      setupFiles: '.storybook/vitest.setup.ts',
    },
  });
}

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
    projects,
  },
});
