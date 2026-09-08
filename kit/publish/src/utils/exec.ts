/**
 * 命令执行。
 *
 * 一律用 execFileSync 数组传参，不拼 shell 字符串：
 * 版本号、标签、废弃原因等都来自命令行 / 终端输入，
 * 走 shell 会被 $ 与反引号解释（"升级到 $LATEST" 会变成 "升级到 "）。
 */

import { execFileSync, spawn } from 'child_process';
import { logInfo } from './logger';

/** 命令执行失败时抛出的错误：额外带上 stderr / status / reason 供调用方判定失败原因 */
export interface ExecError extends Error {
  stderr?: string;
  status?: number | null;
  /** 「命令执行失败: ...」那一句本身，不含 stderr */
  reason?: string;
}

const display = (file: string, args: readonly string[]): string => [file, ...args].join(' ');

/**
 * echoed = true 表示 stderr 已经由调用方实时打到终端了，此时不再把它拼进 message：
 * 否则顶层错误处理（cli.ts）会把同一份 stderr 原样再打一遍 —— npm publish 实测
 * 33KB / 657 行，失败时终端上就是两屏一模一样的 npm notice。
 *
 * stderr 字段照旧保留：npm.ts 的失败原因判定（errorText）读的是字段而不是 message。
 */
const execError = (
  command: string,
  error: unknown,
  { echoed = false }: { echoed?: boolean } = {},
): ExecError => {
  const raw = error as { status?: number | null; stderr?: unknown } | undefined;
  const status = raw?.status;
  const stderr = raw?.stderr ? String(raw.stderr).trim() : '';
  const suffix = status != null ? ` (exit code: ${status})` : '';
  const reason = `命令执行失败: ${command}${suffix}`;

  const wrapped = new Error(`${reason}${stderr && !echoed ? `\n${stderr}` : ''}`, {
    cause: error,
  }) as ExecError;
  wrapped.stderr = stderr;
  wrapped.status = status;
  // message 可能附带整份 stderr，而失败原因判定（npm.ts 的 errorText）只该看我们自己
  // 这一句与 npm 的报错行。单独留一份，免得调用方靠「取 message 的第一行」去还原它
  wrapped.reason = reason;
  return wrapped;
};

/** 静默执行并返回 stdout（用于查询类命令） */
export const exec = (file: string, args: readonly string[] = [], cwd?: string): string => {
  try {
    return execFileSync(file, args as string[], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    })
      .toString()
      .trim();
  } catch (error) {
    throw execError(display(file, args), error);
  }
};

/** 继承 stdio 执行（用于构建等需要实时输出的命令） */
export const run = (file: string, args: readonly string[] = [], cwd?: string): void => {
  try {
    execFileSync(file, args as string[], { stdio: 'inherit', cwd });
  } catch (error) {
    throw execError(display(file, args), error);
  }
};

/**
 * stdout 实时输出、stderr 收集后回显：
 * 需要按 stderr 内容判断失败原因（如区分网络抖动与鉴权失败）时使用。
 *
 * 异步（spawn 而非 spawnSync）是必须的，不只是风格问题：npm publish 上传一个近 20MB 的包
 * 要十几分钟，期间得打心跳日志证明自己还活着，而 spawnSync 会把事件循环整个阻塞住，
 * 定时器一个都发不出来 —— 终端上只能看到十几分钟的空白，分不清是在传还是卡死了。
 */
export const runCapturingStderr = (
  file: string,
  args: readonly string[] = [],
  cwd?: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args as string[], { stdio: ['ignore', 'inherit', 'pipe'], cwd });
    let stderr = '';

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    // spawn 本身失败（命令不存在等）走 error，其后 close 仍会以 status = null 再触发一次；
    // Promise 只认第一次结算，多余的那次是空操作
    child.on('error', (error) => reject(execError(display(file, args), error)));
    child.on('close', (status) => {
      if (stderr) process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`);
      if (status === 0) resolve();
      // 上面刚把 stderr 原样回显过，别让它再从 message 里出来一遍
      else reject(execError(display(file, args), { status, stderr }, { echoed: true }));
    });
  });

/** 秒数 → 「11m20s」/「45s」，只在日志里露面 */
export const formatDuration = (seconds: number): string =>
  seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;

/**
 * 长耗时命令的心跳，返回停止函数（调用后给出总用时，单位秒）。
 *
 * 传大包时 npm publish 十几分钟不输出任何东西，终端上看不出它是在传还是已经卡死 ——
 * 只能靠 ps 查子进程才能确认它还活着，这对一个交互式发布工具来说不合格。
 */
export const heartbeat = (label: string, intervalMs = 30000): (() => number) => {
  const startedAt = Date.now();
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000);

  const timer = setInterval(
    () => logInfo(`${label} 进行中… 已用时 ${formatDuration(elapsed())}`),
    intervalMs,
  );
  // 心跳不该成为进程活着的理由
  timer.unref?.();

  return () => {
    clearInterval(timer);
    return elapsed();
  };
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
