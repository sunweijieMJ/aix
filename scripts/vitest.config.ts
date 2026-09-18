import { defineConfig } from 'vitest/config';

// 仓库根脚本的单测。scripts/ 不是 workspace 包，拿不到 @kit/vitest-config，
// 也不需要它的 jsdom 基座——这里测的都是纯 Node 的文本与 AST 处理。
// name 必须显式给：根 vitest 的项目名默认取 package.json 的 name，本目录没有 package.json。
export default defineConfig({
  test: {
    name: 'scripts',
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
  },
});
