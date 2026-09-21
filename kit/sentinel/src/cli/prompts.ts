/**
 * 交互式安装向导 - 分步收集用户配置
 */

import { checkbox, confirm, input, number, select } from '@inquirer/prompts';

import type { InstallConfig, Phase, PackageManager, ScheduledCheck } from '../types/index.js';
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
  const phaseConfig = await promptPhaseConfig(phases, base.target, base.packageManager);
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
  return checkbox<Phase>({
    message: '选择要安装的阶段:',
    choices: ([1, 2, 3, 4] as Phase[]).map((p) => ({
      name: `Phase ${p}: ${PHASE_CONFIGS[p].name} — ${PHASE_CONFIGS[p].description}`,
      value: p,
      checked: p === 1,
    })),
    validate: (selected) => selected.length > 0 || '至少选择一个阶段',
  });
}

async function promptBaseConfig(defaults: Partial<InstallConfig>) {
  // 先收集 target，以便后续检测包管理器
  const target = await input({
    message: '目标仓库目录:',
    default: defaults.target ?? process.cwd(),
  });

  const detectedPm = detectPackageManager(target);

  const platform = await select<InstallConfig['platform']>({
    message: 'CI 平台:',
    choices: VALID_PLATFORMS,
    default: 'github',
  });

  const packageManager = await select<PackageManager>({
    message: `包管理器 (检测到 ${detectedPm}):`,
    choices: ['pnpm', 'npm', 'yarn'],
    default: detectedPm,
  });

  const nodeVersion = await input({
    message: 'Node.js 版本:',
    default: '22',
  });

  const allowedPathsInput = await input({
    message: '允许 AI 修改的路径模式 (逗号分隔):',
    default: DEFAULT_ALLOWED_PATHS.join(', '),
  });

  const reviewers = await input({
    message: 'PR reviewers (逗号分隔，可留空):',
    default: '',
  });

  return {
    target,
    platform,
    packageManager,
    nodeVersion,
    allowedPaths: allowedPathsInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    reviewers: reviewers || undefined,
  };
}

async function promptPhaseConfig(phases: Phase[], target: string, packageManager: PackageManager) {
  const config: Partial<InstallConfig> = {};

  // Phase 2 配置
  if (phases.includes(2)) {
    config.smokeTestCmd = await input({
      message: '[Phase 2] 冒烟测试命令:',
      default: `${buildRunCmd(packageManager)} test:smoke`,
    });
  }

  // Phase 3 配置
  if (phases.includes(3)) {
    const remote = parseGitRemote(target);
    config.owner = await input({
      message: '[Phase 3] 仓库 owner:',
      default: remote?.owner ?? '',
    });
    config.repo = await input({
      message: '[Phase 3] 仓库名称:',
      default: remote?.repo ?? '',
    });
  }

  // Phase 4 配置
  if (phases.includes(4)) {
    config.cronExpression = await input({
      message: '[Phase 4] Cron 表达式:',
      default: DEFAULT_CRON,
    });
    config.checks = await checkbox<ScheduledCheck>({
      message: '[Phase 4] 定时检查项:',
      choices: ALL_SCHEDULED_CHECKS.map((c) => ({
        name: c,
        value: c,
        checked: true,
      })),
    });

    // 自定义命令
    if (config.checks.length > 0) {
      const customize = await confirm({
        message: '[Phase 4] 是否自定义检查命令?',
        default: false,
      });

      if (customize) {
        const customCommands: Record<string, string> = {};
        for (const check of config.checks) {
          customCommands[check] = await input({
            message: `  ${check} 命令:`,
            default: getDefaultCheckCmd(check, packageManager),
          });
        }
        config.customCommands = customCommands;
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
  const configure = await confirm({
    message: '是否配置高级选项?',
    default: false,
  });

  if (!configure) return {};

  const model = await input({
    message: 'Claude 模型:',
    default: DEFAULT_MODEL,
  });

  // number 允许留空，空值回落到默认常量
  const maxTurns = await number({
    message: '最大轮次:',
    default: DEFAULT_MAX_TURNS,
  });

  const prDailyLimit = await number({
    message: '每日 PR 上限:',
    default: DEFAULT_PR_DAILY_LIMIT,
  });

  return {
    model,
    maxTurns: maxTurns ?? DEFAULT_MAX_TURNS,
    prDailyLimit: prDailyLimit ?? DEFAULT_PR_DAILY_LIMIT,
  };
}
