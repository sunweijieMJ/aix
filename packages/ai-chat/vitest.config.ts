import { defineConfig } from 'vitest/config';
import Vue from 'unplugin-vue/vite';

export default defineConfig({
  plugins: [Vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__test__/setup.ts'],
  },
});
