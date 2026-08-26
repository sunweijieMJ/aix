import fs from 'node:fs';
import path from 'node:path';

/**
 * 检测是否在项目根目录（package.json 是否存在）
 */
export function isProjectRoot(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'package.json'));
}
