/**
 * 安装配置预览面板
 */

import chalk from 'chalk';

import type { InstallConfig } from '../types/index.js';
import {
  PHASE_CONFIGS,
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_MODEL,
  DEFAULT_MAX_TURNS,
  DEFAULT_PR_DAILY_LIMIT,
  DEFAULT_CRON,
} from '../types/index.js';

/**
 * 打印安装配置预览
 */
export function printConfigPreview(config: InstallConfig): void {
  console.log();
  console.log(chalk.bold.cyan('📋 安装配置预览'));
  console.log(chalk.gray('─'.repeat(50)));

  // 阶段
  console.log(chalk.bold('\n阶段:'));
  for (const p of [...config.phases].sort()) {
    const pc = PHASE_CONFIGS[p];
    console.log(chalk.green(`  ✔ Phase ${p}: ${pc.name}`));
  }

  // 基础配置
  console.log(chalk.bold('\n基础配置:'));
  console.log(`  目标目录:   ${chalk.white(config.target)}`);
  console.log(`  CI 平台:    ${chalk.white(config.platform)}`);
  console.log(`  包管理器:   ${chalk.white(config.packageManager)}`);
  console.log(`  Node.js:    ${chalk.white(config.nodeVersion)}`);
  const paths = config.allowedPaths ?? DEFAULT_ALLOWED_PATHS;
  console.log(`  允许路径:   ${chalk.white(paths.join(', '))}`);
  if (config.reviewers) {
    console.log(`  Reviewers:  ${chalk.white(config.reviewers)}`);
  }

  // 阶段配置
  const hasPhaseConfig =
    config.phases.includes(2) || config.phases.includes(3) || config.phases.includes(4);
  if (hasPhaseConfig) {
    console.log(chalk.bold('\n阶段配置:'));

    if (config.phases.includes(2)) {
      console.log(
        `  冒烟测试:      ${chalk.white(config.smokeTestCmd ?? `${config.packageManager} test:smoke`)}`,
      );
    }

    if (config.phases.includes(3)) {
      console.log(`  Owner/Repo:    ${chalk.white(`${config.owner ?? ''}/${config.repo ?? ''}`)}`);
    }

    if (config.phases.includes(4)) {
      console.log(`  Cron:          ${chalk.white(config.cronExpression ?? DEFAULT_CRON)}`);
      if (config.checks) {
        console.log(`  检查项:        ${chalk.white(config.checks.join(', '))}`);
      }
      if (config.customCommands) {
        for (const [key, cmd] of Object.entries(config.customCommands)) {
          console.log(`    ${key}: ${chalk.gray(cmd)}`);
        }
      }
    }
  }

  // 高级设置
  const hasAdvanced =
    (config.model && config.model !== DEFAULT_MODEL) ||
    (config.maxTurns && config.maxTurns !== DEFAULT_MAX_TURNS) ||
    (config.prDailyLimit && config.prDailyLimit !== DEFAULT_PR_DAILY_LIMIT);
  if (hasAdvanced) {
    console.log(chalk.bold('\n高级设置:'));
    if (config.model && config.model !== DEFAULT_MODEL) {
      console.log(`  模型:      ${chalk.white(config.model)}`);
    }
    if (config.maxTurns && config.maxTurns !== DEFAULT_MAX_TURNS) {
      console.log(`  最大轮次:  ${chalk.white(String(config.maxTurns))}`);
    }
    if (config.prDailyLimit && config.prDailyLimit !== DEFAULT_PR_DAILY_LIMIT) {
      console.log(`  PR 上限:   ${chalk.white(String(config.prDailyLimit))}`);
    }
  }

  // 将写入的文件
  // TODO: 扩展新平台时，路径应从 PlatformAdapter.getPipelineDir() 获取
  console.log(chalk.bold('\n将写入文件:'));
  for (const p of [...config.phases].sort()) {
    const pc = PHASE_CONFIGS[p];
    for (const wf of pc.workflows) {
      console.log(chalk.gray(`  .github/workflows/${wf}`));
    }
    if (pc.extraFiles) {
      for (const extra of pc.extraFiles) {
        console.log(chalk.gray(`  ${extra.dest}`));
      }
    }
  }
  console.log(chalk.gray('  CLAUDE.md (补丁)'));

  console.log(chalk.gray('\n' + '─'.repeat(50)));
}
