import fs from 'node:fs';
import path from 'node:path';
import { CreateAppError } from './errors';

/**
 * 检测是否在项目根目录（package.json 是否存在）
 */
export function isProjectRoot(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'package.json'));
}

/**
 * 不在项目根目录就抛错（供 override 子命令共用）
 *
 * 走 CreateAppError 而不是就地 `console.error + exit`：全 CLI 只有 handleError 一个出口，
 * 只有它会打 `[错误码]`、打 suggestion、在 DEBUG 下吐 cause——第二套习语会让这条路径
 * 在 CI 日志里长得跟别的失败完全不一样，也没法按错误码断言。
 */
export function assertProjectRoot(cwd: string): void {
  if (isProjectRoot(cwd)) return;
  throw new CreateAppError(
    'E_NOT_PROJECT_ROOT',
    '未检测到 package.json，请在项目根目录执行',
    `当前目录：${cwd}\n请先 cd 到项目根目录（含 package.json 的那一级）后重试`,
  );
}
