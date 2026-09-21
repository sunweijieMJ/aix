import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * 向上查找 .env 文件并加载环境变量（就近优先，只加载第一个命中的）。
 *
 * 爬升上界：git 仓库根（首个含 .git 的目录，含该层）——monorepo 子包自带 package.json，
 * 但共享的 .env 通常放仓库根，以 package.json 为界会永远读不到它。仅当整条链上没有
 * .git（不在任何 git 仓库内）时，才退回以「首个含 package.json 的目录」为界：无边界
 * 一路爬到文件系统根，会把用户主目录 / 其它项目的 .env 加载进来——静默用错无关项目的
 * LLM 凭证比读不到 .env 危险得多。
 *
 * @param startDir 起始目录，默认当前工作目录（参数仅为可测性存在，生产调用不传）
 */
export function loadEnv(startDir: string = process.cwd()): void {
  const chain: string[] = [];
  let dir = startDir;
  while (true) {
    chain.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const gitIdx = chain.findIndex((d) => fs.existsSync(path.join(d, '.git')));
  const pkgIdx = chain.findIndex((d) => fs.existsSync(path.join(d, 'package.json')));
  const boundary = gitIdx !== -1 ? gitIdx : pkgIdx;
  if (boundary === -1) return;

  for (const d of chain.slice(0, boundary + 1)) {
    const envPath = path.join(d, '.env');
    if (fs.existsSync(envPath)) {
      // CLI 的 --version/--help 必须保持机器可读，不能被 dotenv v17 的注入提示污染 stdout。
      dotenv.config({ path: envPath, quiet: true });
      return;
    }
  }
}
