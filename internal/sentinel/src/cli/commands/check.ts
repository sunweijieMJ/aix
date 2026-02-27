/**
 * sentinel check - 检查安装状态
 *
 * 显示当前仓库的 sentinel 安装状态：pipelines、secrets、CLAUDE.md
 */

import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';

import type { Phase, Platform } from '../../types/index.js';
import { PHASE_CONFIGS, VALID_PLATFORMS } from '../../types/index.js';
import { createPlatformAdapter } from '../../platform/index.js';
import { pathExists, readFile } from '../../utils/file.js';
import { logger } from '../../utils/logger.js';

/**
 * 注册 check 命令
 */
export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Check sentinel installation status')
    .option('--target <path>', 'Target repository directory', process.cwd())
    .option('--platform <platform>', 'CI platform (github)', 'github')
    .action(async (options: { target: string; platform: string }) => {
      await runCheck(options);
    });
}

async function runCheck(options: {
  target: string;
  platform: string;
}): Promise<void> {
  const target = path.resolve(options.target);
  const platform = options.platform as Platform;

  if (!VALID_PLATFORMS.includes(platform)) {
    logger.error(
      `无效的平台: ${options.platform}\n  支持的平台: ${VALID_PLATFORMS.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const adapter = createPlatformAdapter(platform);
  const pipelineDir = adapter.getPipelineDir(target);

  console.log(chalk.bold(`Sentinel 安装状态检查 (${platform})`));
  console.log(chalk.gray(`目标: ${target}`));
  console.log();

  // 检查 pipeline 文件（从 PHASE_CONFIGS 动态构建映射）
  console.log(chalk.bold('Pipelines:'));

  const phaseFileMap: Record<string, Phase> = {};
  for (const [phaseKey, pc] of Object.entries(PHASE_CONFIGS)) {
    for (const workflow of pc.workflows) {
      const destFileName = adapter.getDestFileName(workflow);
      phaseFileMap[destFileName] = Number(phaseKey) as Phase;
    }
  }

  for (const [file, phase] of Object.entries(phaseFileMap)) {
    const filePath = path.join(pipelineDir, file);
    const exists = await pathExists(filePath);
    const phaseName = PHASE_CONFIGS[phase].name;
    const status = exists ? chalk.green('已安装') : chalk.gray('未安装');
    console.log(`  Phase ${phase} (${phaseName}): ${status} - ${file}`);
  }

  console.log();

  // 检查 secrets 和 variables
  console.log(chalk.bold('Secrets & Variables:'));
  try {
    const secrets = await adapter.listSecrets(target);
    const variables = await adapter.listVariables(target);

    const requiredSecrets = [
      ...new Set(Object.values(PHASE_CONFIGS).flatMap((pc) => pc.secrets)),
    ];
    const requiredVariables = [
      ...new Set(Object.values(PHASE_CONFIGS).flatMap((pc) => pc.variables)),
    ];

    for (const name of requiredSecrets) {
      const exists = secrets.includes(name);
      const status = exists ? chalk.green('已配置') : chalk.yellow('未配置');
      console.log(`  Secret  ${name}: ${status}`);
    }

    for (const name of requiredVariables) {
      const exists = variables.includes(name);
      const status = exists ? chalk.green('已配置') : chalk.yellow('未配置');
      console.log(`  Variable ${name}: ${status}`);
    }
  } catch {
    logger.warn('无法获取 secrets/variables 信息（需要平台 CLI 登录）');
  }

  console.log();

  // 检查 CLAUDE.md
  console.log(chalk.bold('CLAUDE.md:'));
  const claudeMdPath = path.join(target, 'CLAUDE.md');

  if (await pathExists(claudeMdPath)) {
    const content = await readFile(claudeMdPath);
    const hasMarker = content.includes('<!-- sentinel:start -->');
    const status = hasMarker
      ? chalk.green('已注入 sentinel 规范')
      : chalk.yellow('存在但未注入 sentinel 规范');
    console.log(`  ${status}`);
  } else {
    console.log(`  ${chalk.gray('CLAUDE.md 不存在')}`);
  }

  console.log();
}
