import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 定位本包根目录（含 package.json 的那一层）
 *
 * 必须运行时向上查找，不能写死相对层级：源码运行（tsx）时模块在 `src/<sub>/` 下，
 * tsdown 打包后全部被压到 `dist/`，两种形态的层级不同。
 * 历史上 create.ts 里写死的 `require('../../package.json')` 就是因此在 dist 下报
 * 「Cannot find module」——凡是要定位包内资源（templates-override/、package.json）的地方，一律走这里。
 */
export function findPackageRoot(fromUrl: string): string {
  const start = path.dirname(fileURLToPath(fromUrl));
  let dir = start;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start, '..');
    dir = parent;
  }
  return dir;
}

/** 读取本包 package.json 的 version，用于模板兼容性校验 */
export function readCliVersion(fromUrl: string): string {
  const pkgPath = path.join(findPackageRoot(fromUrl), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}
