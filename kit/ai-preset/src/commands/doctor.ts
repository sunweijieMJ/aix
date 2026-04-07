/**
 * doctor 命令 — 健康检查
 */

import { createRequire } from 'node:module';
import type { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';

const req = createRequire(import.meta.url);

import type { CheckStatus, DoctorCheck, DoctorResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { existsSync } from '../utils/fs.js';
import { checkFileStatus, readLockFile } from '../core/lock.js';
import { detectPlatforms } from '../core/detector.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('健康检查')
    .option('--target <dir>', '目标项目目录', process.cwd())
    .action(async (opts: { target: string }) => {
      try {
        const result = await runDoctor(path.resolve(opts.target));
        if (!result.ok) {
          process.exit(1);
        }
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

async function runDoctor(projectRoot: string): Promise<DoctorResult> {
  console.log();
  console.log(chalk.bold('🔍 AI Preset 健康检查'));
  console.log();

  const checks: DoctorCheck[] = [];

  // 1. lock.json 检查
  const lock = await readLockFile(projectRoot);
  checks.push({
    name: 'lock.json',
    status: lock ? 'pass' : 'fail',
    message: lock
      ? '.ai-preset/lock.json 完整'
      : '.ai-preset/lock.json 不存在，请运行 ai-preset init',
  });

  if (!lock) {
    printChecks(checks);
    return { ok: false, checks };
  }

  // 2. 文件完整性检查
  const statusMap = await checkFileStatus(projectRoot, lock);
  const managedCount = [...statusMap.values()].filter((s) => s === 'managed').length;
  const modifiedCount = [...statusMap.values()].filter((s) => s === 'modified').length;
  const ejectedCount = [...statusMap.values()].filter((s) => s === 'ejected').length;
  const totalCount = statusMap.size;

  const missingFiles: string[] = [];
  for (const [filePath, status] of statusMap) {
    // ejected 文件由用户自行管理，不检查存在性
    if (status === 'ejected') continue;
    if (!existsSync(path.join(projectRoot, filePath))) {
      missingFiles.push(filePath);
    }
  }

  if (missingFiles.length > 0) {
    checks.push({
      name: '文件完整性',
      status: 'fail',
      message: `${missingFiles.length} 个文件缺失: ${missingFiles.join(', ')}`,
    });
  } else {
    checks.push({
      name: '文件完整性',
      status: modifiedCount > 0 ? 'warn' : 'pass',
      message:
        `${totalCount} 个文件: ${managedCount} managed` +
        (modifiedCount > 0 ? `, ${modifiedCount} modified` : '') +
        (ejectedCount > 0 ? `, ${ejectedCount} ejected` : ''),
    });
  }

  // 3. 平台一致性检查
  const detected = detectPlatforms(projectRoot);
  const configPlatforms = lock.config.platforms;
  const missingPlatforms = configPlatforms.filter((p) => !detected.includes(p));

  checks.push({
    name: '平台一致性',
    status: missingPlatforms.length > 0 ? 'warn' : 'pass',
    message:
      missingPlatforms.length > 0
        ? `配置了 ${missingPlatforms.join(', ')} 但未检测到对应平台目录`
        : `平台配置与检测结果一致`,
  });

  // 4. 版本检查
  const { version: currentVersion } = req('../../package.json') as {
    version: string;
  };
  const lockVersion = lock.cliVersion;
  const versionMismatch = lockVersion !== currentVersion;
  checks.push({
    name: '版本信息',
    status: versionMismatch ? 'warn' : 'pass',
    message: versionMismatch
      ? `CLI 已更新 (${lockVersion} → ${currentVersion})，建议运行 ai-preset upgrade`
      : `CLI 版本: ${currentVersion}`,
  });

  printChecks(checks);

  const ok = checks.every((c) => c.status !== 'fail');
  return { ok, checks };
}

function printChecks(checks: DoctorCheck[]): void {
  for (const check of checks) {
    const icon = getStatusIcon(check.status);
    console.log(`${icon} ${check.message}`);
  }
  console.log();
}

function getStatusIcon(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return chalk.green('✅');
    case 'warn':
      return chalk.yellow('⚠️ ');
    case 'fail':
      return chalk.red('❌');
  }
}
