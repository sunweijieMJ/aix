import { cpSync } from 'fs';
import { join } from 'path';
import autoprefixer from 'autoprefixer';
import { defineConfig } from 'rollup';
import postcss from 'rollup-plugin-postcss';
import * as sass from 'sass';

// 构建后复制 SCSS mixins 文件
function copyScss() {
  return {
    name: 'copy-scss',
    buildEnd() {
      cpSync(
        join(process.cwd(), 'src/mixins'),
        join(process.cwd(), 'dist/mixins'),
        { recursive: true },
      );
      console.log('✅ SCSS mixins copied to dist/mixins');
    },
  };
}

export default defineConfig([
  // 构建主 CSS 文件（包含所有变量和样式）
  {
    input: 'src/index.scss',
    output: {
      file: 'dist/index.css',
      format: 'es',
    },
    plugins: [
      copyScss(),
      postcss({
        extract: true,
        minimize: true,
        sourceMap: false,
        use: {
          sass: {
            implementation: sass,
          },
        },
        plugins: [autoprefixer()],
      }),
    ],
  },
  // 单独构建变量文件（允许按需引入）
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
        plugins: [autoprefixer()],
      }),
    ],
  },
  {
    input: 'src/vars/light.css',
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
  {
    input: 'src/vars/dark.css',
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
  {
    input: 'src/vars/size.css',
    output: {
      file: 'dist/vars/size.css',
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
]);
