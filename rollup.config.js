import fs from 'fs';
import path from 'path';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import url from '@rollup/plugin-url';
import autoprefixer from 'autoprefixer';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import postcss from 'rollup-plugin-postcss';
import vue from 'rollup-plugin-vue';
import * as sass from 'sass';

/**
 * 创建 Vue 3 组件库的 Rollup 配置
 * @param {string} dir - 组件包目录路径
 * @param {string} format - 输出格式 (esm/cjs/iife)
 * @param {string} outputDir - 输出目录
 * @param {string|null} outputFile - 输出文件路径 (用于 iife 格式)
 * @returns {object} Rollup 配置对象
 */
const createBaseConfig = (dir, format, outputDir, outputFile = null) => {
  const sourceMapEnabled = format !== 'iife' ? true : false;
  const minifyEnabled = format === 'iife' ? true : false;
  const styleExtensions = ['.css', '.scss', '.sass'];
  const extensions = ['.js', '.ts', '.vue'];
  const pkgPath = path.resolve(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const pkgName = pkg.name
    .replace(/^@.+\//, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return {
    input: 'src/index.ts',
    output: {
      format,
      sourcemap: sourceMapEnabled,
      ...(outputFile ? { file: outputFile } : { dir: outputDir }),
      name: outputFile ? pkgName : undefined, // 适用于 UMD/IIFE 格式
      exports: format === 'esm' ? undefined : 'named',
      preserveModules: !outputFile,
      preserveModulesRoot: 'src',
      globals: outputFile
        ? {
            vue: 'Vue',
          }
        : undefined,
    },
    plugins: [
      // Vue 插件必须放在前面
      vue({
        target: 'browser',
        preprocessStyles: true,
        // 提取 CSS 由 postcss 插件处理
        style: {
          preprocessOptions: {
            scss: {
              implementation: sass,
            },
          },
        },
      }),
      resolve({
        extensions,
        mainFields: ['main', 'module'],
      }),
      commonjs({
        include: /node_modules/,
        transformMixedEsModules: true,
      }),
      json(),
      url({
        limit: 8 * 1024, // 8 KB
        include: [
          '**/*.png',
          '**/*.jpg',
          '**/*.jpeg',
          '**/*.svg',
          '**/*.gif',
          '**/*.webp',
          '**/*.ttf',
          '**/*.woff',
          '**/*.woff2',
          '**/*.eot',
          '**/*.otf',
        ],
        emitFiles: true,
        fileName: '[dirname][name][extname]',
        publicPath: './',
      }),
      esbuild({
        sourceMap: sourceMapEnabled,
        target: 'esnext',
        minify: minifyEnabled,
        minifyIdentifiers: minifyEnabled,
        minifySyntax: minifyEnabled,
        minifyWhitespace: minifyEnabled,
        loaders: {
          '.vue': 'js',
        },
      }),
      postcss({
        modules: false,
        minimize: true,
        sourceMap: sourceMapEnabled,
        extract: true,
        extensions: styleExtensions,
        use: {
          sass,
        },
        plugins: [autoprefixer()],
      }),
    ],
    external: (id) => {
      if (outputFile) {
        // IIFE 格式只外部化 vue
        return id === 'vue' || id.startsWith('vue/');
      }
      // ESM 和 CJS 格式外部化所有依赖
      const dependencies = [
        ...Object.keys(pkg.peerDependencies || {}),
        ...Object.keys(pkg.dependencies || {}),
      ];
      return dependencies.some((dep) => id === dep || id.startsWith(`${dep}/`));
    },
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') {
        console.warn(`Circular dependency: ${warning.importer}`);
      } else {
        warn(warning);
      }
    },
  };
};

/**
 * 创建多格式 Rollup 配置
 * @param {string} dir - 组件包目录路径
 * @param {string[]} formats - 需要输出的格式数组，默认 ['esm', 'cjs']
 * @returns {object[]} Rollup 配置数组
 *
 * @example
 * // 在组件包的 rollup.config.js 中使用：
 * import { createRollupConfig } from '../../rollup.config.js';
 * export default createRollupConfig(import.meta.dirname);
 */
export function createRollupConfig(dir, formats = ['esm', 'cjs']) {
  const configMap = {
    esm: defineConfig(createBaseConfig(dir, 'esm', 'es')),
    cjs: defineConfig(createBaseConfig(dir, 'cjs', 'lib')),
    iife: defineConfig(createBaseConfig(dir, 'iife', 'dist', 'dist/index.js')),
  };

  return formats.map((format) => configMap[format]).filter(Boolean);
}
