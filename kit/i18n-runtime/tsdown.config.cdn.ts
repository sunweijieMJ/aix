import { defineConfig } from 'tsdown';

/**
 * script 标签接入场景的 IIFE 构建，独立于主 tsdown.config.ts（ESM only）。
 * clean: false——主构建（package.json build 脚本里先跑）已经清过 dist/，
 * 这里再 clean 会把主构建刚产出的 index.js/plugin.js 一起删掉。
 * 产物文件名是 i18n-runtime.global.iife.js（tsdown 对非 ESM 格式默认追加 .iife 后缀
 * 做命名消歧，尝试用 outExtensions 覆盖无效，属于工具默认行为，直接接受）。
 */
export default defineConfig({
  entry: { 'i18n-runtime.global': 'src/standalone/index.ts' },
  format: ['iife'],
  platform: 'browser',
  target: 'es2020',
  outDir: 'dist',
  minify: true,
  sourcemap: true,
  dts: false,
  clean: false,
});
