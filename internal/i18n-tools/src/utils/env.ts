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
      dotenv.config({ path: envPath });
      return;
    }
    dir = path.dirname(dir);
  }
}
