/**
 * sentinel install - 安装 AI sentinel workflows
 *
 * 交互式向导或静默安装 workflow 到目标仓库
 */

import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';

import type { InstallConfig } from '../../types/index.js';
import { install } from '../../core/installer.js';
import { logger } from '../../utils/logger.js';
import { detectPackageManager } from '../../utils/package-manager.js';
import { collectInstallConfig } from '../prompts.js';
import { printConfigPreview } from '../preview.js';

/**
 * 构建默认配置（--yes 模式）
 */
export function buildDefaultConfig(
  target: string,
  dryRun = false,
): InstallConfig {
  return {
    phases: [1],
    target,
    yes: true,
    dryRun,
    nodeVersion: '20',
    platform: 'github',
    packageManager: detectPackageManager(target),
  };
}

/**
 * 注册 install 命令
 */
export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Install AI sentinel workflows into target repository')
    .option('--target <path>', 'Target repository directory', process.cwd())
    .option('-y, --yes', 'Skip confirmation, use defaults')
    .option('--dry-run', 'Dry run mode - preview without writing')
    .action(async (options) => {
      await runInstall(options);
    });
}

interface InstallOptions {
  target: string;
  yes?: boolean;
  dryRun?: boolean;
}

async function runInstall(options: InstallOptions): Promise<void> {
  const target = path.resolve(options.target);
  let config: InstallConfig;

  if (options.yes) {
    // 非交互模式：使用默认配置
    config = buildDefaultConfig(target, options.dryRun);
  } else {
    // 交互式向导
    config = await collectInstallConfig({
      target,
      dryRun: options.dryRun ?? false,
      platform: 'github',
    });

    // 预览配置
    printConfigPreview(config);

    // 确认安装
    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: '确认安装?',
        default: true,
      },
    ]);

    if (!confirmed) {
      logger.info('已取消安装');
      return;
    }
  }

  if (config.dryRun) {
    logger.warn('干跑模式 - 不会实际写入文件');
    console.log();
  }

  const spinner = ora('正在安装 sentinel workflows...').start();

  try {
    logger.resetSteps();
    const result = await install(config);
    spinner.succeed('安装完成');

    // 显示安装摘要
    console.log();
    console.log(chalk.bold(`安装摘要 (${config.platform}):`));
    console.log(chalk.green(`  Pipelines: ${result.workflows.length} 个文件`));
    for (const wf of result.workflows) {
      console.log(chalk.gray(`    - ${wf}`));
    }

    console.log(chalk.green(`  Labels: ${result.labels.length} 个`));
    for (const label of result.labels) {
      console.log(chalk.gray(`    - ${label}`));
    }

    console.log(
      chalk.green(
        `  CLAUDE.md: ${result.claudeMdPatched ? '已更新' : '未变更'}`,
      ),
    );
    console.log(
      result.secretsOk
        ? chalk.green('  Secrets: 全部就绪')
        : chalk.yellow('  Secrets: 有缺失项，请手动配置'),
    );
    console.log();
  } catch (error) {
    spinner.fail('安装失败');
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exitCode = 1;
  }
}
