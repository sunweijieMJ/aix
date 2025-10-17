import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [vue()],
  test: {
    globals: true, // 启用全局 API，如 expect
    environment: 'jsdom', // 使用 JSDOM 运行环境（适用于前端组件）
    coverage: {
      provider: 'v8', // 使用 v8 提供者
      reportsDirectory: 'coverage', // 代码覆盖率报告目录
      reporter: ['text', 'json', 'html'], // 代码覆盖率报告
    },
    setupFiles: resolve(__dirname, 'vitest.setup.ts'),
    include: ['packages/**/__test__/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/*/node_modules',
      '**/*/dist',
      '**/*/build',
      '**/*/coverage',
      '**/*/lib',
      '**/*/es',
      '**/*/stories',
    ],
  },
});
