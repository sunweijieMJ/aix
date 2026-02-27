/**
 * sentinel install - 安装 AI sentinel workflows
 *
 * 交互式或静默安装指定阶段的 workflow 到目标仓库
 */

import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';

import type { InstallConfig, Phase, Platform } from '../../types/index.js';
import { PHASE_CONFIGS, VALID_PLATFORMS } from '../../types/index.js';
import { install } from '../../core/installer.js';
import { logger } from '../../utils/logger.js';

/**
 * 注册 install 命令
 */
export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Install AI sentinel workflows into target repository')
    .option('--phase <phase>', 'Phase to install (1-4)', undefined)
    .option('--all', 'Install all phases (shorthand for --phase 4)')
    .option('--target <path>', 'Target repository directory', process.cwd())
    .option('--platform <platform>', 'CI platform (github)', 'github')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('--dry-run', 'Dry run mode - preview without writing')
    .option('--node-version <ver>', 'Node.js version for workflows', '20')
    .option('--reviewers <list>', 'GitHub PR reviewers (comma-separated)')
    .option(
      '--deploy-workflow <name>',
      'Deploy workflow name for post-deploy trigger',
      'Deploy Production',
    )
    .option('--phases <list>', 'Comma-separated phases to install (e.g., 1,4)')
    .option(
      '--allowed-paths <patterns>',
      'Comma-separated bash regex patterns for allowed file paths',
    )
    .action(async (options) => {
      await runInstall(options);
    });
}

interface InstallOptions {
  phase?: string;
  all?: boolean;
  target: string;
  platform: string;
  yes?: boolean;
  dryRun?: boolean;
  nodeVersion: string;
  reviewers?: string;
  deployWorkflow: string;
  phases?: string;
  allowedPaths?: string;
}

async function runInstall(options: InstallOptions): Promise<void> {
  const target = path.resolve(options.target);

  // 验证平台
  const platform = options.platform as Platform;
  if (!VALID_PLATFORMS.includes(platform)) {
    logger.error(
      `无效的平台: ${options.platform}\n  支持的平台: ${VALID_PLATFORMS.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  // 解析选择性阶段列表
  let selectivePhases: Phase[] | undefined;
  if (options.phases) {
    const parsed = options.phases.split(',').map((p) => {
      const n = Number.parseInt(p.trim(), 10);
      if (n < 1 || n > 4 || Number.isNaN(n)) {
        logger.error(`无效的阶段值: ${p.trim()}，阶段必须为 1-4 之间的整数`);
        process.exitCode = 1;
        return 0 as Phase;
      }
      return n as Phase;
    });
    if (parsed.includes(0 as Phase)) return;
    selectivePhases = parsed;
  }

  // 确定安装阶段
  let phase: Phase;

  if (selectivePhases) {
    // 选择性模式：phase 取最大值（用于兼容 InstallConfig.phase 字段）
    phase = Math.max(...selectivePhases) as Phase;
  } else if (options.all) {
    phase = 4;
  } else if (options.phase) {
    const parsed = Number.parseInt(options.phase, 10);
    if (parsed < 1 || parsed > 4 || Number.isNaN(parsed)) {
      logger.error('阶段必须为 1-4 之间的整数');
      process.exitCode = 1;
      return;
    }
    phase = parsed as Phase;
  } else if (options.yes) {
    // --yes 模式默认安装阶段 1
    phase = 1;
  } else {
    // 交互式选择
    const answer = await inquirer.prompt<{ phase: Phase }>([
      {
        type: 'list',
        name: 'phase',
        message: '选择要安装的阶段:',
        choices: ([1, 2, 3, 4] as Phase[]).map((p) => ({
          name: `Phase ${p}: ${PHASE_CONFIGS[p].name} - ${PHASE_CONFIGS[p].description}`,
          value: p,
        })),
      },
    ]);
    phase = answer.phase;
  }

  // 确认安装
  if (!options.yes && !options.dryRun) {
    console.log();
    if (selectivePhases) {
      const phaseList = [...selectivePhases].sort().join(', ');
      console.log(chalk.bold(`将安装 Phase ${phaseList} (平台: ${platform}):`));
      for (const p of [...selectivePhases].sort()) {
        const pc = PHASE_CONFIGS[p];
        console.log(chalk.gray(`  ${p}. ${pc.name}: ${pc.description}`));
      }
    } else {
      console.log(chalk.bold(`将安装 Phase 1-${phase} (平台: ${platform}):`));
      for (let i = 1; i <= phase; i++) {
        const pc = PHASE_CONFIGS[i as Phase];
        console.log(chalk.gray(`  ${i}. ${pc.name}: ${pc.description}`));
      }
    }
    console.log(chalk.gray(`  目标: ${target}`));
    console.log();

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

  const config: InstallConfig = {
    phase,
    target,
    yes: options.yes ?? false,
    dryRun: options.dryRun ?? false,
    nodeVersion: options.nodeVersion,
    reviewers: options.reviewers,
    deployWorkflow: options.deployWorkflow,
    platform,
    phases: selectivePhases,
    allowedPaths: options.allowedPaths
      ? options.allowedPaths.split(',').map((p) => p.trim())
      : undefined,
  };

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
    console.log(chalk.bold(`安装摘要 (${platform}):`));
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
