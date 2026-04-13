import fs from 'node:fs';
import path from 'node:path';

/**
 * 自动检测业务仓库使用的语言
 *
 * 检测规则：
 * 1. 存在 tsconfig.json 或 tsconfig.app.json → TypeScript
 * 2. package.json devDependencies 包含 typescript → TypeScript
 * 3. 以上均不满足 → JavaScript
 */
export function detectLanguage(cwd: string): 'ts' | 'js' {
  // 规则 1：检测 tsconfig 文件
  if (
    fs.existsSync(path.join(cwd, 'tsconfig.json')) ||
    fs.existsSync(path.join(cwd, 'tsconfig.app.json'))
  ) {
    return 'ts';
  }

  // 规则 2：检测 package.json 中的 typescript 依赖
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
        return 'ts';
      }
    } catch {
      // package.json 解析失败，忽略
    }
  }

  return 'js';
}

/**
 * 检测是否在项目根目录（package.json 是否存在）
 */
export function isProjectRoot(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'package.json'));
}
