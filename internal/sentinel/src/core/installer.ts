/**
 * 安装编排器
 *
 * 组织各模块完成完整的安装流程：
 * 验证环境 → 写入 pipelines → 创建 labels → 补丁 CLAUDE.md → 检查 secrets
 */

import path from 'node:path';

import type {
  InstallConfig,
  InstallResult,
  PhaseConfig,
} from '../types/index.js';
import { DEFAULT_ALLOWED_PATHS, PHASE_CONFIGS } from '../types/index.js';
import {
  formatAllowedPathsDisplay,
  renderTemplate,
} from '../utils/template.js';
import { readTemplate, writeFile, ensureDir } from '../utils/file.js';
import { createPlatformAdapter } from '../platform/index.js';
import { validateEnvironment } from './validator.js';
import { writeWorkflows } from './workflow-writer.js';
import { createLabels } from './label-creator.js';
import { patchClaudeMd } from './claude-md-patcher.js';
import { checkSecrets } from './secrets-checker.js';
import { logger } from '../utils/logger.js';

/**
 * 执行完整安装流程
 */
export async function install(config: InstallConfig): Promise<InstallResult> {
  const adapter = createPlatformAdapter(config.platform);

  // 1. 环境预检
  logger.step('验证环境');
  const validation = await validateEnvironment(config, adapter);

  if (!validation.valid) {
    for (const error of validation.errors) {
      logger.error(error);
    }
    throw new Error('环境验证失败，请修复上述问题后重试');
  }

  // 2. 收集需要安装的阶段
  const phases: PhaseConfig[] = [...config.phases]
    .sort()
    .map((p) => PHASE_CONFIGS[p]);

  // 3. 写入 pipelines
  const allWorkflows: string[] = [];

  for (const phase of phases) {
    logger.step(`安装阶段 ${phase.phase}: ${phase.name}`);

    const workflows = await writeWorkflows(config, phase, adapter);
    allWorkflows.push(...workflows);
  }

  // 3.5 Phase 3: 输出 Sentry Worker 模板到目标仓库
  if (config.phases.includes(3)) {
    const workerDir = path.join(config.target, 'workers');
    const workerDest = path.join(workerDir, 'sentry-webhook.ts');

    const rawWorkerContent = await readTemplate('worker/sentry-webhook.ts');
    const workerVars: Record<string, string> = {};
    if (config.owner && config.repo) {
      workerVars.OWNER = config.owner;
      workerVars.REPO = config.repo;
    }
    const workerContent =
      Object.keys(workerVars).length > 0
        ? renderTemplate(rawWorkerContent, workerVars)
        : rawWorkerContent;

    if (config.dryRun) {
      logger.info(`[dry-run] 将写入: ${workerDest}`);
    } else {
      await ensureDir(workerDir);
      await writeFile(workerDest, workerContent);
      logger.debug(`已写入 Sentry Worker: ${workerDest}`);
    }
  }

  // 4. 创建 labels（先去重再调用，避免重复 API 请求）
  logger.step('创建 labels');
  const uniqueLabelNames = [...new Set(phases.flatMap((p) => p.labels))];
  const uniqueLabels = await createLabels(
    uniqueLabelNames,
    config.target,
    config.dryRun,
    adapter,
  );

  // 5. 补丁 CLAUDE.md
  logger.step('更新 CLAUDE.md');
  const allowedPaths = config.allowedPaths ?? DEFAULT_ALLOWED_PATHS;
  const claudeVars: Record<string, string> = {
    ALLOWED_PATHS_DISPLAY: formatAllowedPathsDisplay(allowedPaths),
  };
  const claudeMdPatched = await patchClaudeMd(
    config.target,
    config.dryRun,
    claudeVars,
  );

  // 6. 检查 secrets（汇总所有阶段的需求）
  logger.step('检查 secrets 和 variables');
  const secretsCheck = await checkSecrets(
    {
      secrets: [...new Set(phases.flatMap((p) => p.secrets))],
      variables: [...new Set(phases.flatMap((p) => p.variables))],
    },
    config.target,
    adapter,
  );

  // 7. 显示安装后提示（某些阶段可能需要额外配置）
  const postInstructions = adapter.getPostInstallInstructions(allWorkflows);
  if (postInstructions) {
    logger.warn(postInstructions);
  }

  return {
    workflows: allWorkflows,
    labels: uniqueLabels,
    claudeMdPatched,
    secretsOk: secretsCheck.ok,
  };
}
