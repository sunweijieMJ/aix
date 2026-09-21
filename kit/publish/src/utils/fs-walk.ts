/**
 * 目录遍历。
 *
 * 与 core/dist-scan.ts 分开是为了不让调用方为用不上的东西付代价：那个模块顶层 await 了
 * es-module-lexer 的 WASM 初始化，而业务仓库的产物修复 hook 只需要遍历文件，
 * 不该跟着一起等（它从 @kit/publish 的公开入口拿 listJsFiles）。
 */

import fs from 'fs';
import path from 'path';

/**
 * JS 模块的扩展名。
 *
 * .mjs / .cjs 不能漏：vite 的 lib 模式按 formats 决定后缀，只收 .js 会让 dist-scan
 * 漏扫整份产物，派生出的 dependencies 随之少掉真正需要消费方安装的包。
 * .d.ts 之类不在其中 —— 它们不是运行时模块。
 */
const JS_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/** 递归收集目录下的全部 JS 文件（.js / .mjs / .cjs） */
export const listJsFiles = (dir: string): string[] => {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (JS_EXTENSIONS.includes(path.extname(entry.name))) found.push(filePath);
    }
  };
  walk(dir);
  return found;
};
