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
 * 输出插件：向 outDir 写入空模块声明 style.d.ts，供 exports["./style"].types 引用。
 * 让开启 noUncheckedSideEffectImports（TS 5.6+）的消费方能解析
 * `import '@aix/<pkg>/style'` 副作用导入；集中在构建期生成，各包无需手写。
 * 用 writeBundle + fs 而非 emitFile：theme 等 output.file 单文件模式下 emitFile 会报错。
 * @param {string} outDir - style.d.ts 的输出目录（相对包根）
 * @returns {import('rollup').Plugin}
 */
export function emitStyleDts(outDir) {
  return {
    name: 'emit-style-dts',
    writeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'style.d.ts'),
        '/** `./style` 纯 CSS 副作用入口的空模块声明（构建生成，见根 rollup.config.js 的 emitStyleDts）。 */\nexport {};\n',
      );
    },
  };
}

/** JS 中 import 的资源一律内联为 data URI，超过此上限即构建失败。 */
const ASSET_INLINE_LIMIT = 8 * 1024;

const ASSET_GLOBS = [
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
];

const ASSET_EXTENSION_RE = /\.(png|jpe?g|svg|gif|webp|ttf|woff2?|eot|otf)$/i;

/**
 * 拦下超过内联上限的资源导入。
 *
 * 放任不管的话 @rollup/plugin-url 会 emit 文件并产出 `"./assets/x.svg"` 这样的
 * 字符串——它是文档相对 URL，对从 node_modules 消费的库必然 404：下游打包器把它
 * 当普通字符串，不会搬运资源；浏览器又按页面地址而非包位置去解析。
 *
 * 必须排在 url() 之前，否则 load 钩子抢不到。
 *
 * @returns {import('rollup').Plugin}
 */
function assertAssetsInlinable() {
  return {
    name: 'assert-assets-inlinable',
    load(id) {
      const file = id.split('?')[0];
      if (!ASSET_EXTENSION_RE.test(file) || !fs.existsSync(file)) return null;

      const size = fs.statSync(file).size;
      if (size > ASSET_INLINE_LIMIT) {
        this.error(
          `资源 ${path.relative(process.cwd(), file)} 为 ${(size / 1024).toFixed(1)}KB，` +
            `超过 ${ASSET_INLINE_LIMIT / 1024}KB 内联上限。\n` +
            `组件库不能从 JS 产出资源 URL。请改用：\n` +
            `  1. 转成 Vue 组件（见 @aix/icons 的构建期生成）；\n` +
            `  2. 在 SCSS 中以 data URI 内联（见 ai-chat 的 Sender.vue）；\n` +
            `  3. 确需独立资源文件时，为该包挂 postcss-url 并改走 CSS url()。`,
        );
      }
      return null;
    },
  };
}

/**
 * 删除 CJS 产出的 CSS：与 es/ 那份逐字节相同，且样式统一经 `./style` 提供。
 * 之所以是「产出后删除」而非跳过 postcss——不跑 postcss 则 rollup 无法解析样式模块。
 *
 * @param {string} outDir - 待清理的输出目录
 * @returns {import('rollup').Plugin}
 */
function dropDuplicateCss(outDir) {
  return {
    name: 'drop-duplicate-css',
    writeBundle() {
      if (!fs.existsSync(outDir)) return;
      for (const file of fs.readdirSync(outDir)) {
        if (file.endsWith('.css') || file.endsWith('.css.map')) {
          fs.rmSync(path.join(outDir, file), { force: true });
        }
      }
    },
  };
}

/**
 * 删除 `es/` 里 vue-tsc 逐模块产出的 `.d.ts` 孤儿。
 *
 * 类型入口在 dts 段被 bundle 成自包含的 `es/index.d.ts`，vue-tsc 原先铺开的那批
 * 逐模块声明便无人引用；它们又带无扩展名的相对引用（`from './types'`），在
 * `moduleResolution: node16` 下本身是坏的。移除 `./es/*` 通配导出后它们已不可达，
 * 但仍占着 tarball，故在此清掉。
 *
 * 声明了通配导出的包（如 @aix/icons 的 `"./*"`）把逐模块 `.d.ts` 当作公开 API，
 * 必须整体跳过——删掉会让 `@aix/icons/General/Add` 失去类型。
 *
 * @param {string} outDir - 待清理的输出目录（仅 `es/`）
 * @param {object} pkg - 解析后的 package.json
 * @returns {import('rollup').Plugin}
 */
function dropOrphanDts(outDir, pkg) {
  return {
    name: 'drop-orphan-dts',
    writeBundle(options, bundle) {
      if (options.dir !== outDir) return;
      if (Object.keys(pkg.exports || {}).some((key) => key.includes('*'))) return;
      if (!fs.existsSync(outDir)) return;

      // 本次 dts bundle 实际产出的文件 + emitStyleDts 的空模块声明，都要留下
      const keep = new Set(
        [...Object.keys(bundle), 'style.d.ts'].map((f) => path.resolve(outDir, f)),
      );

      const walk = (currentDir) => {
        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
          const full = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            // 该目录若只装着孤儿声明，删完就空了，一并收走
            if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
          } else if (entry.name.endsWith('.d.ts') && !keep.has(path.resolve(full))) {
            fs.rmSync(full, { force: true });
          }
        }
      };
      walk(outDir);
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
  // CJS 的 sourcemap 与 ESM 那份重复，占发布体积三分之一，且浏览器调试只走 es/
  const sourceMapEnabled = format !== 'cjs';
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
      // 只发布映射、不发布源码：sourcesContent 会把整份 src 内联进 .map，
      // 占 es/ 体积的三到四成。调试者手上就有源码（或能从仓库取），无需随包分发。
      sourcemapExcludeSources: true,
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
        // unplugin-vue 默认取 process.env.NODE_ENV === 'production'，而构建链上无人设它，
        // 于是发布产物一直是 development 编译：__file 内联构建机绝对路径、devtools 元数据
        // 残留、inline template 被关闭导致每个 SFC 拆成两个模块。dev（watch）仍需保留这些。
        isProduction: !process.env.ROLLUP_WATCH,
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
      assertAssetsInlinable(),
      url({
        limit: ASSET_INLINE_LIMIT,
        include: ASSET_GLOBS,
        emitFiles: false,
      }),
      esbuild({
        sourceMap: sourceMapEnabled,
        // esbuild 不读 browserslist，需与根目录 .browserslistrc 手工保持一致
        target: ['chrome99', 'edge99', 'firefox97', 'safari15.4'],
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
        sourceMap: false,
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
      // 声明了 ./style CSS 导出的包，构建 es/ 时自动生成 es/style.d.ts（types 条件指向它）
      ...(format === 'esm' && pkg.exports?.['./style'] ? [emitStyleDts(outputDir)] : []),
      ...(format === 'cjs' ? [dropDuplicateCss(outputDir)] : []),
    ],
    external: (id) => {
      if (outputFile) {
        // UMD 格式打包所有依赖，只外部化 Vue
        return id === 'vue' || id.startsWith('vue/');
      }
      // ESM 和 CJS 格式外部化所有依赖
      return matchesDep(id, collectExternalDeps(pkg));
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
  // dts bundle 只是发布产物，dev 期间类型提示来自 IDE 语言服务（直读 src/），无需生成。
  if (formats.includes('cjs') && !process.env.ROLLUP_WATCH) {
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
        plugins: [dts({ respectExternal: true }), stripStyleImports(), dropOrphanDts('es', dtsPkg)],
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
