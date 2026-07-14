import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * 向上查找 .env 文件并加载环境变量
 */
export function loadEnv(): void {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      // CLI 的 --version/--help 必须保持机器可读，不能被 dotenv v17 的注入提示污染 stdout。
      dotenv.config({ path: envPath, quiet: true });
      return;
    }
    dir = path.dirname(dir);
  }
}
