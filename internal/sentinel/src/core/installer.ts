/**
 * 安装编排器
 *
 * 组织各模块完成完整的安装流程：
 * 验证环境 → 写入 pipelines → 创建 labels → 补丁 CLAUDE.md → 检查 secrets
 */

import type {
  InstallConfig,
  InstallResult,
  Phase,
  PhaseConfig,
} from '../types/index.js';
import { DEFAULT_ALLOWED_PATHS, PHASE_CONFIGS } from '../types/index.js';
import { formatAllowedPathsDisplay } from '../utils/template.js';
import { createPlatformAdapter } from '../platform/index.js';
import { validateEnvironment } from './validator.js';
import { writeWorkflows } from './workflow-writer.js';
import { createLabels } from './label-creator.js';
import { patchClaudeMd } from './claude-md-patcher.js';
import { checkSecrets } from './secrets-checker.js';
import { logger } from '../utils/logger.js';

/**
 * 执行完整安装流程
 *
 * 安装指定阶段（含该阶段之前所有阶段的累积）的 pipeline、labels 等
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
  const allPhaseKeys = (
    Object.keys(PHASE_CONFIGS).map(Number) as Phase[]
  ).sort();
  let phases: PhaseConfig[];
  if (config.phases && config.phases.length > 0) {
    // 选择性模式：只安装指定阶段
    phases = [...config.phases].sort().map((p) => PHASE_CONFIGS[p]);
  } else {
    // 累积模式：安装 1..config.phase
    phases = allPhaseKeys
      .filter((p) => p <= config.phase)
      .map((p) => PHASE_CONFIGS[p]);
  }

  // 3. 写入 pipelines
  const allWorkflows: string[] = [];

  for (const phase of phases) {
    logger.step(`安装阶段 ${phase.phase}: ${phase.name}`);

    const workflows = await writeWorkflows(config, phase, adapter);
    allWorkflows.push(...workflows);
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
