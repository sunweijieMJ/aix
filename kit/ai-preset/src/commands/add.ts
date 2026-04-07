/**
 * add 命令 — 追加模块、规则或平台
 *
 * 用法:
 *   ai-preset add mobile           # 追加领域模块
 *   ai-preset add --platform cursor # 追加新平台
 */

import { createRequire } from 'node:module';
import type { Command } from 'commander';
import path from 'node:path';

import type { AIPlatform, DomainPreset } from '../types.js';
import { ALL_DOMAINS, DOMAIN_RECOMMENDED_FRAMEWORK } from '../types.js';
import { logger } from '../utils/logger.js';
import { readProjectName } from '../utils/fs.js';
import { readConfig, writeConfig, persistedToInitConfig } from '../core/config.js';
import { readLockFile, buildLockFile, writeLockFile } from '../core/lock.js';
import { writeOutputFiles } from '../core/writer.js';
import { getAvailablePlatforms } from '../adapters/index.js';
import { generateAllPlatformFiles } from '../core/generator.js';

const req = createRequire(import.meta.url);

export function registerAddCommand(program: Command): void {
  program
    .command('add [module]')
    .description('追加领域模块或平台')
    .option('--platform <name>', '追加新的 AI 平台')
    .option('--target <dir>', '目标项目目录', process.cwd())
    .option('--dry-run', '预览模式', false)
    .action(async (module: string | undefined, opts) => {
      try {
        await runAdd(module, opts);
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

interface AddOptions {
  platform?: string;
  target: string;
  dryRun: boolean;
}

async function runAdd(moduleName: string | undefined, opts: AddOptions): Promise<void> {
  const projectRoot = path.resolve(opts.target);

  const config = await readConfig(projectRoot);
  if (!config) {
    throw new Error('未找到 .ai-preset/config.json，请先运行 ai-preset init');
  }

  const lock = await readLockFile(projectRoot);

  let changed = false;

  // 追加平台
  if (opts.platform) {
    const platform = opts.platform as AIPlatform;
    const available = getAvailablePlatforms();
    if (!available.includes(platform)) {
      throw new Error(`平台 "${platform}" 尚未支持。可用: ${available.join(', ')}`);
    }
    if (config.platforms.includes(platform)) {
      logger.warn(`平台 ${platform} 已安装`);
    } else {
      config.platforms.push(platform);
      changed = true;
      logger.info(`追加平台: ${platform}`);
    }
  }

  // 追加领域模块
  if (moduleName) {
    if (!ALL_DOMAINS.includes(moduleName as DomainPreset)) {
      throw new Error(`未知模块 "${moduleName}"。可用: ${ALL_DOMAINS.join(', ')}`);
    }
    if (config.domains.includes(moduleName)) {
      logger.warn(`模块 ${moduleName} 已安装`);
    } else {
      // 检查推荐的框架依赖
      const recommended = DOMAIN_RECOMMENDED_FRAMEWORK[moduleName as DomainPreset];
      if (recommended && config.framework !== recommended) {
        logger.warn(
          `模块 "${moduleName}" 推荐搭配框架 "${recommended}" 使用` +
            (config.framework ? `（当前: ${config.framework}）` : '（当前未选择框架）'),
        );
      }
      config.domains.push(moduleName);
      changed = true;
      logger.info(`追加模块: ${moduleName}`);
    }
  }

  if (!changed) {
    logger.info('无变更');
    return;
  }

  // 重新生成
  logger.blank();
  logger.resetSteps();

  const projectName = readProjectName(projectRoot);

  const { initConfig, userConfig } = persistedToInitConfig(config, projectName);

  logger.step('加载预设并生成文件');
  const allFiles = await generateAllPlatformFiles(initConfig, {
    projectRoot,
    userConfig,
  });

  logger.step(`写入 ${allFiles.length} 个文件`);
  const writeResult = await writeOutputFiles(allFiles, lock, {
    projectRoot,
    dryRun: opts.dryRun,
  });

  if (!opts.dryRun) {
    const { version: cliVersion } = req('../package.json') as {
      version: string;
    };
    const newLock = buildLockFile(allFiles, writeResult, initConfig, cliVersion, lock);
    await writeLockFile(projectRoot, newLock);
    await writeConfig(projectRoot, config);
    logger.step('更新配置');
  }

  logger.blank();
  logger.success(`完成! 写入 ${writeResult.writtenFiles.length} 个文件`);
}
