/**
 * @kit/visual-testing CLI 入口
 *
 * 命令:
 *   visual-test init            初始化配置
 *   visual-test sync            同步基准图
 *   visual-test test [targets]  运行视觉测试
 */

import { Command } from 'commander';
import {
  registerInitCommand,
  registerSyncCommand,
  registerTestCommand,
} from './cli/commands';

const program = new Command();

program
  .name('visual-test')
  .description('Visual regression testing with Figma baseline and LLM analysis')
  .version('0.1.0');

// 注册子命令
registerInitCommand(program);
registerSyncCommand(program);
registerTestCommand(program);

program.parse();
