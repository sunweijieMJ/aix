/**
 * @kit/visual-testing CLI 入口
 *
 * 命令:
 *   visual-test init            初始化配置
 *   visual-test sync            同步基准图
 *   visual-test test [targets]  运行视觉测试
 *   visual-test fidelity        设计还原度校验（Figma 节点 ↔ 页面）
 */

import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  registerFidelityCommand,
  registerInitCommand,
  registerSyncCommand,
  registerTestCommand,
} from './cli/commands';

/**
 * 读取自身 package.json 的版本号。
 *
 * src/cli.ts（tsx）与 dist/cli.js（构建产物）都在包根下一层，`../package.json` 对两者成立；
 * package.json 已在 files 中随包发布。读不到时回落 0.0.0，不让 --version 拖垮整个 CLI。
 */
function readVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf-8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('visual-test')
  .description('Visual regression testing and Figma design-fidelity checks')
  .version(readVersion());

// 注册子命令
registerInitCommand(program);
registerSyncCommand(program);
registerTestCommand(program);
registerFidelityCommand(program);

// 子命令 action 均为 async，必须用 parseAsync 才会 await 它们；
// 否则配置加载失败等逃逸异常会变成 unhandled rejection，且退出码不可靠（CI 误判）。
// 顶层 catch 统一兜底，输出友好错误并以非零码退出。
program.parseAsync().catch((error: unknown) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
