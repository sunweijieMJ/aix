import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['__test__/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
