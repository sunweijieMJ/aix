import { createVueConfig } from '@kit/vitest-config';
import Vue from 'unplugin-vue/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  createVueConfig({
    // 本包用 unplugin-vue 编译 SFC（替换基座默认的 @vitejs/plugin-vue）
    plugins: [Vue()],
    // 自带 setup（替换基座共享 setup）
    test: { setupFiles: ['./__test__/setup.ts'] },
  }),
);
