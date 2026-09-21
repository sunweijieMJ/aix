/**
 * dist 产物扫描：从产物反推「真正外部化的依赖」，供 manifest.ts 推导 dependencies 使用。
 *
 * 目录遍历本身在 utils/fs-walk.ts —— 它不该被本模块顶层的 WASM 初始化连累。
 */

import fs from 'fs';
import path from 'path';
import { builtinModules } from 'module';
import { init, parse } from 'es-module-lexer';
import { listJsFiles } from '../utils/fs-walk';

/**
 * es-module-lexer 的 WASM 需要初始化。放在模块顶层 await：
 * 调用方（同步的 writeManifest）不必因此改成异步，ESM 会在依赖图求值阶段替我们等待。
 */
await init;

const BUILTINS = new Set(builtinModules);

// 说明符 → 包名：@scope/name/sub → @scope/name，name/sub → name
const packageOf = (specifier: string): string => {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
};

// 裸说明符：排除相对/绝对路径、URL 与 node: 等带协议的写法（含 http(s):、data:）
const isBare = (specifier: string): boolean =>
  !/^[./#]/.test(specifier) && !specifier.includes(':');

/**
 * 扫描 dist，收集仍以裸说明符形式引用的包名 —— 即真正没有被打进产物、
 * 需要由消费方安装的依赖。
 *
 * 之所以从产物反推而不是照搬根 package.json 的 dependencies：
 * 打包配置里 external 往往只有 vue 之类的一两个，其余依赖全部打进了产物，
 * 照搬会让消费方白装几十个已在 bundle 里的包。external 配置变了，这里自动跟着变。
 *
 * 用 es-module-lexer 而非正则：产物是 terser 压缩后的 ESM，一行几十万字符，
 * 靠正则匹配 import 语句要靠「把语句中段限制为 import 子句合法字符」这类技巧
 * 才能保证不跨越字符串字面量（否则 Array.from("...") 之类会被误判成依赖），
 * 而那套推理的前提是 terser 的输出形态。真解析器不受压缩形态影响，
 * 且天然覆盖 `export ... from` 与动态 import。
 */
export const collectExternalImports = (distPath: string): Set<string> => {
  const packages = new Set<string>();

  for (const filePath of listJsFiles(distPath)) {
    let imports;
    try {
      [imports] = parse(fs.readFileSync(filePath, 'utf-8'), filePath);
    } catch (error) {
      // 产物的模块语法坏掉时必须失败，而不是当成「没有依赖」继续把包发出去
      throw new Error(
        `解析产物失败 ${path.relative(distPath, filePath)}（模块语法异常，产物可能已损坏）: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    for (const { n: specifier } of imports) {
      // 动态 import 的说明符不是字符串字面量时 n 为 undefined，无从判断依赖
      if (!specifier || !isBare(specifier)) continue;

      const name = packageOf(specifier);
      if (!BUILTINS.has(name)) packages.add(name);
    }
  }

  return packages;
};
