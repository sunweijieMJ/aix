/**
 * visual-test sync - 同步基准图
 *
 * 加载配置，使用 BaselineProvider 批量下载/更新基准图。
 */

import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import pLimit from 'p-limit';
import { loadConfig, loadConfigFromFile } from '../../core/config/loader';
import {
  createBaselineProvider,
  type FetchBaselineOptions,
} from '../../core/baseline';
import { withSpinner } from '../ui/spinner';
import { formatSyncResult } from '../ui/formatter';
import { logger, LogLevel, parseLogLevel } from '../../utils/logger';

/**
 * 注册 sync 命令
 */
export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Sync baselines from configured provider')
    .option('-c, --config <path>', 'Config file path')
    .option('--debug', 'Enable debug logging')
    .option('-t, --target <names...>', 'Sync only specific targets')
    .action(
      async (options: {
        config?: string;
        debug?: boolean;
        target?: string[];
      }) => {
        await runSync(options);
      },
    );
}

async function runSync(options: {
  config?: string;
  debug?: boolean;
  target?: string[];
}): Promise<void> {
  // 加载配置
  const config = options.config
    ? await loadConfigFromFile(options.config)
    : await loadConfig();

  // 应用配置中的日志级别（--debug 覆盖配置）
  if (options.debug) {
    logger.setLevel(LogLevel.DEBUG);
  } else if (config.logging.level) {
    logger.setLevel(parseLogLevel(config.logging.level));
  }

  // 解析需要同步的目标
  let targets = config.targets;
  if (options.target && options.target.length > 0) {
    targets = targets.filter((t) => options.target!.includes(t.name));
  }

  if (targets.length === 0) {
    console.log(
      chalk.yellow(
        'No targets found to sync. Add targets to your config file.',
      ),
    );
    return;
  }

  // 构建同步任务列表
  const fetchOptions: FetchBaselineOptions[] = [];
  for (const target of targets) {
    for (const variant of target.variants) {
      fetchOptions.push({
        source: variant.baseline,
        outputPath: path.join(
          config.directories.baselines,
          target.name,
          `${variant.name}.png`,
        ),
      });
    }
  }

  // 创建提供器并批量同步
  const provider = createBaselineProvider(config);
  const startTime = Date.now();

  const limit = pLimit(config.performance.concurrent.maxTargets);
  const results = await withSpinner(
    `Syncing ${fetchOptions.length} baselines`,
    () =>
      Promise.all(
        fetchOptions.map((opts) => limit(() => provider.fetch(opts))),
      ),
  );

  // 清理资源
  await provider.dispose?.();

  // 统计结果
  const elapsed = Date.now() - startTime;
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(chalk.green('✓') + ' ' + formatSyncResult(succeeded, elapsed));

  if (failed > 0) {
    console.log(chalk.red(`✗ ${failed} baselines failed to sync:`));
    for (const result of results) {
      if (!result.success) {
        console.log(
          `  - ${chalk.gray(result.path)}: ${chalk.red(result.error?.message ?? 'Unknown error')}`,
        );
      }
    }
    process.exitCode = 1;
  }
}
