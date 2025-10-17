import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.{test,spec}.{js,ts}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '../../packages/**',
      '../../**',
      '**/*.d.ts',
    ],
    setupFiles: [],
  },
});
