/**
 * @kit/ai-preset CLI 入口
 *
 * 命令:
 *   ai-preset init      交互式初始化 AI 编码规范
 *   ai-preset upgrade   升级预设到最新版本
 *   ai-preset add       追加模块或平台
 *   ai-preset remove    移除模块或平台
 *   ai-preset eject     退出自动升级管理
 *   ai-preset restore   恢复为预设版本
 *   ai-preset list      查看已安装的预设和文件
 *   ai-preset doctor    健康检查
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';

import { registerInitCommand } from './commands/init.js';
import { registerUpgradeCommand } from './commands/upgrade.js';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerEjectCommand } from './commands/eject.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerDiffCommand } from './commands/diff.js';
import { registerListCommand } from './commands/list.js';
import { registerDoctorCommand } from './commands/doctor.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program.name('ai-preset').description('跨 AI 平台的编码规范管理工具').version(version);

registerInitCommand(program);
registerUpgradeCommand(program);
registerAddCommand(program);
registerRemoveCommand(program);
registerEjectCommand(program);
registerRestoreCommand(program);
registerDiffCommand(program);
registerListCommand(program);
registerDoctorCommand(program);

program.parse();
