import path from 'node:path';
import { createNodeConfig } from '@kit/vitest-config';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  createNodeConfig({
    test: {
      // 服务端测试串行执行（共享端口/文件状态）
      fileParallelism: false,
      env: {
        NODE_ENV: 'test',
        // 存储根锚定到本包 storage/（已 gitignore），与启动 cwd 解耦——
        // 从仓库根跑 test:unit 时不再在根目录产生 storage/ 污染
        AIX_STORAGE_DIR: path.join(import.meta.dirname, 'storage'),
      },
      // 自带 setup（替换基座默认）
      setupFiles: ['./vitest.setup.ts'],
      // 独立运行时的覆盖率配置（被根 projects 引用时此为 root-only 选项、会被忽略，属预期）
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['node_modules/', 'dist/', '**/*.config.ts'],
      },
    },
  }),
);
