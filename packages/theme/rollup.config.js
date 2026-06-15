import autoprefixer from 'autoprefixer';
import postcssImport from 'postcss-import';
import { defineConfig } from 'rollup';
import { dts } from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import postcss from 'rollup-plugin-postcss';
import { isStyleId, stripStyleImports } from '../../rollup.config.js';

// CSS 入口配置
const cssEntries = [
  // 全量引入（内联 @import）
  {
    input: 'src/vars/index.css',
    output: 'dist/vars/index.css',
    useImport: true,
  },
  // 按需引入
  { input: 'src/vars/base-tokens.css', output: 'dist/vars/base-tokens.css' },
  {
    input: 'src/vars/semantic-tokens-light.css',
    output: 'dist/vars/light.css',
  },
  { input: 'src/vars/semantic-tokens-dark.css', output: 'dist/vars/dark.css' },
  // compat 版（:where() 低特异性）
  {
    input: 'src/vars/index.compat.css',
    output: 'dist/vars/index.compat.css',
    useImport: true,
  },
];

const createCssConfig = ({ input, output, useImport }) => ({
  input,
  output: { file: output, format: 'es' },
  plugins: [
    postcss({
      extract: true,
      minimize: true,
      sourceMap: false,
      plugins: [...(useImport ? [postcssImport()] : []), autoprefixer()],
    }),
  ],
});

const esbuildPlugin = esbuild({ target: 'es2018' });

export default defineConfig([
  // CSS Token 构建
  ...cssEntries.map(createCssConfig),
  // TypeScript 工具函数（ESM + CJS）
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.js', format: 'esm' },
      { file: 'dist/index.cjs', format: 'cjs' },
    ],
    plugins: [esbuildPlugin],
    // vue 必须外部化：打进产物会导致消费端双 Vue 实例（inject/reactive 跨实例失效）
    external: ['vue', /^vue\//],
  },
  // CLI 工具（aix-theme-export）
  {
    input: 'src/cli.ts',
    output: {
      file: 'dist/cli.js',
      format: 'esm',
      banner: '#!/usr/bin/env node',
    },
    plugins: [esbuildPlugin],
    external: ['fs/promises', 'path'],
  },
  // 类型声明（dual-package 修复）：tsc 产出的 dist/*.d.ts → bundle 成单文件
  // dist/index.d.ts（内联无扩展名相对引用，修 node16 internal resolution）+ 派生
  // dist/index.d.cts 给 CJS 入口（修 masquerading）。须在 build:types 之后运行，
  // 故 build 顺序为 gen:css → build:types → rollup -c（本段）。
  {
    input: 'dist/index.d.ts',
    output: [
      { file: 'dist/index.d.ts', format: 'es' },
      { file: 'dist/index.d.cts', format: 'es' },
    ],
    external: (id) => /^vue($|\/)/.test(id) || isStyleId(id),
    plugins: [dts({ respectExternal: true }), stripStyleImports()],
    onwarn(warning, warn) {
      if (warning.code !== 'CIRCULAR_DEPENDENCY') warn(warning);
    },
  },
]);
