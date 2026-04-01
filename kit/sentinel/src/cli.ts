/**
 * @kit/sentinel CLI 入口
 *
 * 命令:
 *   sentinel install    安装 AI sentinel workflows
 *   sentinel check      检查安装状态
 *   sentinel uninstall  卸载 sentinel workflows
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';

import {
  registerInstallCommand,
  registerCheckCommand,
  registerUninstallCommand,
} from './cli/commands/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('sentinel')
  .description('Install AI sentinel workflows into your repository')
  .version(version);

// 注册子命令
registerInstallCommand(program);
registerCheckCommand(program);
registerUninstallCommand(program);

program.parse();
