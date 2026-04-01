import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Node.js 环境 - 用于测试 Playwright、文件系统、Git 等 API
    environment: 'node',
    include: ['__test__/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/**', 'dist/**', '**/*.d.ts'],
  },
});
