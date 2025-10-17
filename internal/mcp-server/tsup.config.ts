import { readFileSync } from 'fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig([
  // CLI 入口配置 - 需要 shebang
  {
    entry: {
      cli: 'src/cli.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    minify: false,
    target: 'es2022',
    platform: 'node',
    external: Object.keys(pkg.dependencies || {}),
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // 其他入口配置 - 不需要 shebang
  {
    entry: {
      index: 'src/index.ts',
      server: 'src/server/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: false, // 避免清理 CLI 的输出
    splitting: false,
    sourcemap: true,
    minify: false,
    target: 'es2022',
    platform: 'node',
    external: Object.keys(pkg.dependencies || {}),
  },
]);
