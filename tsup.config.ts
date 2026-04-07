import { readFileSync } from 'fs';
import { defineConfig } from 'tsup';
import type { Options } from 'tsup';

interface TsupConfigOptions {
  /** CLI 入口路径，不传则不生成 CLI 配置 */
  cli?: string;
  /** 库入口，默认 { index: 'src/index.ts' } */
  entry?: Record<string, string>;
  /** 编译目标，默认 'es2022' */
  target?: string;
  /** 运行平台，默认 'node' */
  platform?: 'node' | 'browser';
}

/**
 * 创建 tsup 构建配置
 * @param options - 配置选项
 * @returns tsup 配置
 *
 * @description
 * 产物说明：
 * - ESM 格式，生成 .d.ts 类型声明
 * - 有 cli 时生成双入口（CLI 带 shebang + 库入口）
 * - 无 cli 时生成单入口
 * - external 自动读取 package.json 的 dependencies + peerDependencies
 */
export function createTsupConfig(options: TsupConfigOptions = {}) {
  const { cli, entry = { index: 'src/index.ts' }, target = 'es2022', platform = 'node' } = options;

  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
  const external = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ];

  const baseOptions: Options = {
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    minify: false,
    target,
    platform,
    external,
  };

  // 无 CLI：单入口配置
  if (!cli) {
    return defineConfig({
      ...baseOptions,
      entry,
      clean: true,
    });
  }

  // 有 CLI：双入口配置
  return defineConfig([
    {
      ...baseOptions,
      entry: { cli },
      clean: true,
      banner: { js: '#!/usr/bin/env node' },
    },
    {
      ...baseOptions,
      entry,
      clean: false, // 避免清理 CLI 的输出
    },
  ]);
}
