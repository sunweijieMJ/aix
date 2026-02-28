/**
 * 交互式安装向导 - 分步收集用户配置
 */

import inquirer from 'inquirer';

import type {
  InstallConfig,
  Phase,
  PackageManager,
  ScheduledCheck,
} from '../types/index.js';
import {
  PHASE_CONFIGS,
  VALID_PLATFORMS,
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_MODEL,
  DEFAULT_PR_DAILY_LIMIT,
  DEFAULT_CRON,
  DEFAULT_MAX_TURNS,
  ALL_SCHEDULED_CHECKS,
} from '../types/index.js';
import { parseGitRemote } from '../utils/git.js';
import { buildRunCmd, detectPackageManager } from '../utils/package-manager.js';

/**
 * 交互式收集安装配置
 */
export async function collectInstallConfig(
  defaults: Partial<InstallConfig>,
): Promise<InstallConfig> {
  const phases = await promptPhases();
  const base = await promptBaseConfig(defaults);
  const phaseConfig = await promptPhaseConfig(
    phases,
    base.target,
    base.packageManager,
  );
  const advanced = await promptAdvanced();

  return {
    phases,
    target: base.target,
    yes: false,
    dryRun: defaults.dryRun ?? false,
    platform: base.platform,
    nodeVersion: base.nodeVersion,
    packageManager: base.packageManager,
    allowedPaths: base.allowedPaths,
    reviewers: base.reviewers,
    ...phaseConfig,
    ...advanced,
  };
}

async function promptPhases(): Promise<Phase[]> {
  const { phases } = await inquirer.prompt<{ phases: Phase[] }>([
    {
      type: 'checkbox',
      name: 'phases',
      message: '选择要安装的阶段:',
      choices: ([1, 2, 3, 4] as Phase[]).map((p) => ({
        name: `Phase ${p}: ${PHASE_CONFIGS[p].name} — ${PHASE_CONFIGS[p].description}`,
        value: p,
        checked: p === 1,
      })),
      validate: (input: Phase[]) => input.length > 0 || '至少选择一个阶段',
    },
  ]);
  return phases;
}

async function promptBaseConfig(defaults: Partial<InstallConfig>) {
  // 先收集 target，以便后续检测包管理器
  const { target } = await inquirer.prompt([
    {
      type: 'input',
      name: 'target',
      message: '目标仓库目录:',
      default: defaults.target ?? process.cwd(),
    },
  ]);

  const detectedPm = detectPackageManager(target as string);

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'platform',
      message: 'CI 平台:',
      choices: VALID_PLATFORMS,
      default: 'github',
    },
    {
      type: 'list',
      name: 'packageManager',
      message: `包管理器 (检测到 ${detectedPm}):`,
      choices: ['pnpm', 'npm', 'yarn'],
      default: detectedPm,
    },
    {
      type: 'input',
      name: 'nodeVersion',
      message: 'Node.js 版本:',
      default: '20',
    },
    {
      type: 'input',
      name: 'allowedPathsInput',
      message: '允许 AI 修改的路径模式 (逗号分隔):',
      default: DEFAULT_ALLOWED_PATHS.join(', '),
    },
    {
      type: 'input',
      name: 'reviewers',
      message: 'PR reviewers (逗号分隔，可留空):',
      default: '',
    },
  ]);

  return {
    target: target as string,
    platform: answers.platform as InstallConfig['platform'],
    packageManager: answers.packageManager as PackageManager,
    nodeVersion: answers.nodeVersion as string,
    allowedPaths: (answers.allowedPathsInput as string)
      .split(',')
      .map((p: string) => p.trim())
      .filter(Boolean),
    reviewers: (answers.reviewers as string) || undefined,
  };
}

async function promptPhaseConfig(
  phases: Phase[],
  target: string,
  packageManager: PackageManager,
) {
  const config: Partial<InstallConfig> = {};

  // Phase 2 配置
  if (phases.includes(2)) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'deployWorkflow',
        message: '[Phase 2] 部署 workflow 名称:',
        default: 'Deploy Production',
      },
      {
        type: 'input',
        name: 'smokeTestCmd',
        message: '[Phase 2] 冒烟测试命令:',
        default: `${buildRunCmd(packageManager)} test:smoke`,
      },
    ]);
    config.deployWorkflow = answers.deployWorkflow as string;
    config.smokeTestCmd = answers.smokeTestCmd as string;
  }

  // Phase 3 配置
  if (phases.includes(3)) {
    const remote = parseGitRemote(target);
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'owner',
        message: '[Phase 3] 仓库 owner:',
        default: remote?.owner ?? '',
      },
      {
        type: 'input',
        name: 'repo',
        message: '[Phase 3] 仓库名称:',
        default: remote?.repo ?? '',
      },
    ]);
    config.owner = answers.owner as string;
    config.repo = answers.repo as string;
  }

  // Phase 4 配置
  if (phases.includes(4)) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'cronExpression',
        message: '[Phase 4] Cron 表达式:',
        default: DEFAULT_CRON,
      },
      {
        type: 'checkbox',
        name: 'checks',
        message: '[Phase 4] 定时检查项:',
        choices: ALL_SCHEDULED_CHECKS.map((c) => ({
          name: c,
          value: c,
          checked: true,
        })),
      },
    ]);
    config.cronExpression = answers.cronExpression as string;
    config.checks = answers.checks as ScheduledCheck[];

    // 自定义命令
    if (config.checks && config.checks.length > 0) {
      const { customize } = await inquirer.prompt<{ customize: boolean }>([
        {
          type: 'confirm',
          name: 'customize',
          message: '[Phase 4] 是否自定义检查命令?',
          default: false,
        },
      ]);

      if (customize) {
        const cmdAnswers = await inquirer.prompt(
          config.checks.map((check) => ({
            type: 'input',
            name: check,
            message: `  ${check} 命令:`,
            default: getDefaultCheckCmd(check, packageManager),
          })),
        );
        config.customCommands = cmdAnswers as Record<string, string>;
      }
    }
  }

  return config;
}

function getDefaultCheckCmd(check: ScheduledCheck, pm: PackageManager): string {
  const run = buildRunCmd(pm);
  const defaults: Record<ScheduledCheck, string> = {
    lint: `${run} lint`,
    typecheck: `${run} type-check`,
    test: `${run} test`,
  };
  return defaults[check];
}

async function promptAdvanced() {
  const { configure } = await inquirer.prompt<{ configure: boolean }>([
    {
      type: 'confirm',
      name: 'configure',
      message: '是否配置高级选项?',
      default: false,
    },
  ]);

  if (!configure) return {};

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'model',
      message: 'Claude 模型:',
      default: DEFAULT_MODEL,
    },
    {
      type: 'number',
      name: 'maxTurns',
      message: '最大轮次:',
      default: DEFAULT_MAX_TURNS,
    },
    {
      type: 'number',
      name: 'prDailyLimit',
      message: '每日 PR 上限:',
      default: DEFAULT_PR_DAILY_LIMIT,
    },
  ]);

  return {
    model: answers.model as string,
    maxTurns: answers.maxTurns as number,
    prDailyLimit: answers.prDailyLimit as number,
  };
}
