/**
 * Pipeline 文件写入
 *
 * 读取模板 → 渲染变量 → 写入目标目录
 */

import path from 'node:path';

import type { InstallConfig, PhaseConfig } from '../types/index.js';
import { DEFAULT_ALLOWED_PATHS } from '../types/index.js';
import type { PlatformAdapter } from '../platform/index.js';
import { readTemplate, writeFile, ensureDir } from '../utils/file.js';
import { getDefaultBranch } from '../utils/git.js';
import {
  formatAllowedPathsDisplay,
  renderTemplate,
} from '../utils/template.js';
import { logger } from '../utils/logger.js';

/**
 * 将阶段对应的 pipeline 模板写入目标仓库
 *
 * @returns 已写入的文件路径列表
 */
export async function writeWorkflows(
  config: InstallConfig,
  phase: PhaseConfig,
  adapter: PlatformAdapter,
): Promise<string[]> {
  const pipelineDir = adapter.getPipelineDir(config.target);
  const defaultBranch = getDefaultBranch(config.target);
  const writtenFiles: string[] = [];

  const reviewers = config.reviewers ?? '';
  const allowedPaths = config.allowedPaths ?? DEFAULT_ALLOWED_PATHS;
  const vars: Record<string, string> = {
    NODE_VERSION: config.nodeVersion,
    DEFAULT_BRANCH: defaultBranch,
    REVIEWERS: reviewers,
    REVIEWER_FLAG: reviewers ? `--reviewer "${reviewers}"` : '',
    DEPLOY_WORKFLOW: config.deployWorkflow ?? 'Deploy Production',
    ALLOWED_PATHS_REGEX: allowedPaths.join('|'),
    ALLOWED_PATHS_DISPLAY: formatAllowedPathsDisplay(allowedPaths),
  };

  for (const templateName of phase.workflows) {
    const templatePath = adapter.getTemplatePath(templateName);
    const destFileName = adapter.getDestFileName(templateName);
    const destPath = path.join(pipelineDir, destFileName);

    // 无论是否 dry-run 都读取并渲染模板，以验证模板语法和变量完整性
    const content = await readTemplate(templatePath);
    const rendered = renderTemplate(content, vars);

    if (config.dryRun) {
      logger.info(`[dry-run] 将写入: ${destPath}`);
      writtenFiles.push(destPath);
      continue;
    }

    await ensureDir(pipelineDir);
    await writeFile(destPath, rendered);

    writtenFiles.push(destPath);
    logger.debug(`已写入 pipeline: ${destPath}`);
  }

  return writtenFiles;
}
