import fs from 'fs';
import path from 'path';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import url from '@rollup/plugin-url';
import autoprefixer from 'autoprefixer';
import { defineConfig } from 'rollup';
import { dts } from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import postcss from 'rollup-plugin-postcss';
import Vue from 'unplugin-vue/rollup';

/**
 * 收集 package.json 中需外部化的依赖名（peer + runtime + optional）。
 * @param {object} pkg - 解析后的 package.json
 * @returns {string[]} 依赖名数组
 */
function collectExternalDeps(pkg) {
  return [
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ];
}

/**
 * 判断模块 id 是否命中某依赖（精确匹配或子路径，如 `katex/dist/...`）。
 * @param {string} id - 模块 id
 * @param {string[]} deps - 依赖名数组
 * @returns {boolean}
 */
function matchesDep(id, deps) {
  return deps.some((dep) => id === dep || id.startsWith(`${dep}/`));
}

/**
 * 判断 id 是否为样式文件。dts bundle 时需把它 external，否则会去解析
 * `.d.ts` 里残留的 `import './x.scss'`（vue-tsc 会保留 SFC 的副作用样式导入）而报错。
 * @param {string} id - 模块 id
 * @returns {boolean}
 */
export function isStyleId(id) {
  return /\.(css|scss|sass|less)$/.test(id);
}

/**
 * Rollup 输出插件：剔除 `.d.ts`/`.d.cts` 里残留的样式副作用导入行
 * （`import './x.scss';`）。类型声明里不需要样式导入，留着会让 node16 消费端
 * 解析失败。配合 isStyleId external 使用（先 external 让 bundle 不报错，再删除该行）。
 * @returns {import('rollup').Plugin}
 */
export function stripStyleImports() {
  return {
    name: 'strip-style-imports',
    renderChunk(code) {
      return {
        code: code.replace(
          /^\s*import\s+['"][^'"]+\.(?:css|scss|sass|less)['"];?[ \t]*\r?\n?/gm,
          '',
        ),
        map: null,
      };
    },
  };
}

/**
 * 创建 Vue 3 组件库的 Rollup 配置
 * @param {string} dir - 组件包目录路径
 * @param {string} format - 输出格式 (esm/cjs/iife)
 * @param {string} outputDir - 输出目录
 * @param {string|null} outputFile - 输出文件路径 (用于 iife 格式)
 * @returns {object} Rollup 配置对象
 */
const createBaseConfig = (dir, format, outputDir, outputFile = null) => {
  const sourceMapEnabled = true;
  const minifyEnabled = format === 'umd';
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
      entryFileNames: format === 'cjs' && !outputFile ? '[name].cjs' : undefined,
      preserveModules: !outputFile,
      preserveModulesRoot: 'src',
      globals: outputFile
        ? {
            vue: 'Vue',
          }
        : undefined,
    },
    plugins: [
      Vue({
        style: {
          preprocessLang: 'scss',
          preprocessOptions: {
            scss: {
              api: 'modern-compiler',
              silenceDeprecations: ['legacy-js-api'],
            },
          },
        },
      }),
      resolve({
        extensions,
        // 优先使用 ESM 格式，其次是 CJS，最后是浏览器字段
        mainFields: ['module', 'main', 'browser'],
      }),
      commonjs({
        include: /node_modules/,
        transformMixedEsModules: true,
      }),
      json(),
      url({
        limit: 8 * 1024,
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
        target: 'es2018',
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
          sass: {
            // 使用现代 Sass API
            api: 'modern-compiler',
            silenceDeprecations: ['legacy-js-api'],
          },
        },
        plugins: [autoprefixer()],
      }),
    ],
    external: (id) => {
      if (outputFile) {
        // UMD 格式打包所有依赖，只外部化 Vue
        return id === 'vue' || id.startsWith('vue/');
      }
      // ESM 和 CJS 格式外部化所有依赖
      return matchesDep(id, collectExternalDeps(pkg));
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
 * @param {string[]} formats - 需要输出的格式数组，默认 ['esm', 'cjs', 'umd']
 * @returns {object[]} Rollup 配置数组
 *
 * @description
 * 产物说明：
 * - ESM (es/): 保留模块结构，适合现代构建工具（Tree-shaking）
 * - CJS (lib/): CommonJS 格式，适合 Node.js 环境
 * - UMD (dist/): 通用格式，同时支持 AMD/CommonJS/全局变量
 *
 * CJS 类型声明（dual-package 类型修复）：当 formats 含 'cjs' 时**自动**追加一段 .d.ts bundle——
 * 把 vue-tsc/tsc 产出的 es/*.d.ts bundle 成单文件（内联无扩展名相对引用，修 node16 internal
 * resolution），并派生 lib/*.d.cts 给 CJS 入口（修 masquerading）。入口从 package.json exports
 * 自动推导（主入口 + 具名 JS 子路径），各包 rollup.config.js 无需任何额外配置。
 * 该段依赖 es/*.d.ts 已存在，故各包须把 build 顺序设为 `build:types` → `build:js`(含本段)。
 */
export function createRollupConfig(dir, formats = ['esm', 'cjs', 'umd']) {
  const configMap = {
    esm: defineConfig(createBaseConfig(dir, 'esm', 'es')),
    cjs: defineConfig(createBaseConfig(dir, 'cjs', 'lib')),
    umd: defineConfig(createBaseConfig(dir, 'umd', 'dist', 'dist/index.js')),
  };

  const configs = formats.map((format) => configMap[format]).filter(Boolean);

  // 输出 CJS 时自动生成类型声明：es/*.d.ts 单文件化 + 派生 lib/*.d.cts（dual-package 修复）
  if (formats.includes('cjs')) {
    // dts external 与 JS 一致地从 package.json 依赖推导：自身包名不在 deps 中，故不会被误当外部，
    // 避免 .d.cts 出现 `from '@aix/自己'` 的自引用；同时正确外部化 virtua / katex 等第三方类型。
    const dtsPkg = JSON.parse(fs.readFileSync(path.resolve(dir, 'package.json'), 'utf8'));
    const dtsDeps = collectExternalDeps(dtsPkg);
    configs.push(
      defineConfig({
        input: deriveDtsEntries(dir),
        output: [
          { dir: 'es', format: 'es', entryFileNames: '[name].d.ts' },
          { dir: 'lib', format: 'es', entryFileNames: '[name].d.cts' },
        ],
        external: (id) =>
          id === 'vue' || id.startsWith('vue/') || isStyleId(id) || matchesDep(id, dtsDeps),
        plugins: [dts({ respectExternal: true }), stripStyleImports()],
        // 类型 bundle 的循环引用是常态，与 JS 段保持一致地静默
        onwarn(warning, warn) {
          if (warning.code !== 'CIRCULAR_DEPENDENCY') warn(warning);
        },
      }),
    );
  }

  return configs;
}

/**
 * 从 package.json exports 自动推导 dts bundle 入口：主入口 + 具名 JS 子路径。
 * 跳过通配（如 ./* / ./es/*）与无对应 .d.ts 的子路径（如 ./style 等 CSS 导出）。
 * @param {string} dir - 组件包目录
 * @returns {Record<string, string>} 入口映射（产物名 → es/ 下的 .d.ts 源）
 */
function deriveDtsEntries(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(dir, 'package.json'), 'utf8'));
  const entries = { index: 'es/index.d.ts' };
  for (const key of Object.keys(pkg.exports || {})) {
    if (key === '.' || key === './package.json' || key.includes('*')) continue;
    const sub = key.slice(2);
    const src = `es/${sub}/index.d.ts`;
    // 仅纳入实际存在 .d.ts 的 JS 子路径（自动跳过 ./style 等 CSS 导出）
    if (fs.existsSync(path.resolve(dir, src))) entries[`${sub}/index`] = src;
  }
  return entries;
}
