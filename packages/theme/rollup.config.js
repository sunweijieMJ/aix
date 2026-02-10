import autoprefixer from 'autoprefixer';
import postcssImport from 'postcss-import';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import postcss from 'rollup-plugin-postcss';

export default defineConfig([
  // 构建主 CSS 文件（包含所有Token，内联 @import）
  {
    input: 'src/vars/index.css',
    output: {
      file: 'dist/index.css',
      format: 'es',
    },
    plugins: [
      postcss({
        extract: true,
        minimize: true,
        sourceMap: false,
        plugins: [postcssImport(), autoprefixer()],
      }),
    ],
  },
  // 按需引入入口：vars/index.css（内联所有 CSS）
  {
    input: 'src/vars/index.css',
    output: {
      file: 'dist/vars/index.css',
      format: 'es',
    },
    plugins: [
      postcss({
        extract: true,
        minimize: true,
        sourceMap: false,
        plugins: [postcssImport(), autoprefixer()],
      }),
    ],
  },
  // 按需引入：基础Token
  {
    input: 'src/vars/base-tokens.css',
    output: {
      file: 'dist/vars/base-tokens.css',
      format: 'es',
    },
    plugins: [
      postcss({
        extract: true,
        minimize: true,
        sourceMap: false,
        plugins: [autoprefixer()],
      }),
    ],
  },
  // 按需引入：亮色语义Token
  {
    input: 'src/vars/semantic-tokens-light.css',
    output: {
      file: 'dist/vars/light.css',
      format: 'es',
    },
    plugins: [
      postcss({
        extract: true,
        minimize: true,
        sourceMap: false,
        plugins: [autoprefixer()],
      }),
    ],
  },
  // 按需引入：暗色语义Token
  {
    input: 'src/vars/semantic-tokens-dark.css',
    output: {
      file: 'dist/vars/dark.css',
      format: 'es',
    },
    plugins: [
      postcss({
        extract: true,
        minimize: true,
        sourceMap: false,
        plugins: [autoprefixer()],
      }),
    ],
  },
  // 构建 TypeScript 文件（工具函数）
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'esm',
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
      },
    ],
    plugins: [
      esbuild({
        target: 'es2020',
      }),
    ],
    external: [],
  },
]);
