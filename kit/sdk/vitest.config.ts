import { createVueConfig } from '@kit/vitest-config';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  // 复用 Vue 基座的 jsdom + 共享 setup，但不需要 SFC 编译插件
  createVueConfig({ plugins: [] }),
);
