import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * 向上查找 .env 文件并加载环境变量。
 *
 * 爬升上界是「首个含 package.json 或 .git 的目录」（含该层，越过即停）：无边界一路爬到
 * 文件系统根，会把用户主目录 / 其它项目的 .env 加载进来 —— 拿到的是无关项目的 LLM 凭证，
 * 静默用错 key 比读不到 .env 危险得多。
 *
 * @param startDir 起始目录，默认当前工作目录（参数仅为可测性存在，生产调用不传）
 */
export function loadEnv(startDir: string = process.cwd()): void {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      // CLI 的 --version/--help 必须保持机器可读，不能被 dotenv v17 的注入提示污染 stdout。
      dotenv.config({ path: envPath, quiet: true });
      return;
    }
    // 项目边界：本层已查过 .env，到此为止不再上溯。
    if (fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, '.git'))) {
      return;
    }
    dir = path.dirname(dir);
  }
}
