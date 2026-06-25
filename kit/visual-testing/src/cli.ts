/**
 * @kit/visual-testing CLI 入口
 *
 * 命令:
 *   visual-test init            初始化配置
 *   visual-test sync            同步基准图
 *   visual-test test [targets]  运行视觉测试
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { registerInitCommand, registerSyncCommand, registerTestCommand } from './cli/commands';

const program = new Command();

program
  .name('visual-test')
  .description('Visual regression testing with Figma baseline and LLM analysis')
  .version('0.1.0');

// 注册子命令
registerInitCommand(program);
registerSyncCommand(program);
registerTestCommand(program);

// 子命令 action 均为 async，必须用 parseAsync 才会 await 它们；
// 否则配置加载失败等逃逸异常会变成 unhandled rejection，且退出码不可靠（CI 误判）。
// 顶层 catch 统一兜底，输出友好错误并以非零码退出。
program.parseAsync().catch((error: unknown) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
