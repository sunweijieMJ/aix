import autoprefixer from 'autoprefixer';
import postcssImport from 'postcss-import';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import postcss from 'rollup-plugin-postcss';

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

const esbuildPlugin = esbuild({ target: 'es2020' });

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
    external: [],
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
]);
