import { defineConfig } from 'tsdown';

interface TsdownConfigOptions {
  /** CLI 入口路径，不传则不生成 CLI 配置 */
  cli?: string;
  /** 库入口，默认 { index: 'src/index.ts' } */
  entry?: Record<string, string>;
  /** 编译目标，默认 'es2018' */
  target?: string;
  /** 运行平台，默认 'node' */
  platform?: 'node' | 'browser';
}

/**
 * 创建 tsdown 构建配置（替代旧的 createTsupConfig，Rolldown 驱动、更快）。
 *
 * 产物说明：
 * - ESM-only，生成 .d.ts 类型声明（dts 内置 rolldown-plugin-dts）
 * - 强制 `.js` / `.d.ts` 扩展名（tsdown 默认出 `.mjs` / `.d.mts`，但各包 package.json 的
 *   main/bin/types 字段均为 `.js`，故用 outExtensions 对齐，避免改动各包字段）
 * - 有 cli 时生成双入口（CLI 带 shebang + 库入口），tsdown 另会自动 chmod +x
 * - external：tsdown 默认外部化 package.json 的 dependencies / peerDependencies
 */
export function createTsdownConfig(options: TsdownConfigOptions = {}) {
  const { cli, entry = { index: 'src/index.ts' }, target = 'es2018', platform = 'node' } = options;

  const base = {
    format: ['esm' as const],
    dts: true,
    sourcemap: true,
    target,
    platform,
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  };

  // 无 CLI：单入口配置
  if (!cli) {
    return defineConfig({ ...base, entry, clean: true });
  }

  // 有 CLI：双入口配置（cli 带 shebang banner；clean=false 避免两入口并行清理竞态）
  return defineConfig([
    { ...base, entry: { cli }, clean: false, banner: { js: '#!/usr/bin/env node' } },
    { ...base, entry, clean: false },
  ]);
}
