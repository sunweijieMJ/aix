/**
 * Label 创建
 *
 * 为 sentinel 工作流创建所需的平台 labels
 */

import type { PlatformAdapter } from '../platform/index.js';
import { logger } from '../utils/logger.js';

/**
 * Label 颜色映射
 */
const LABEL_COLORS: Record<string, string> = {
  sentinel: '0E8A16',
  bot: 'BFDADC',
  sentry: 'D93F0B',
  'post-deploy': 'D93F0B',
  urgent: 'B60205',
  maintenance: 'FEF2C0',
};

/**
 * Label 描述映射
 */
const LABEL_DESCRIPTIONS: Record<string, string> = {
  sentinel: 'AI sentinel workflow trigger',
  bot: 'Created by automated process',
  sentry: 'Sentry production error auto-fix',
  'post-deploy': 'Post-deployment issue',
  urgent: 'Urgent issue requiring immediate attention',
  maintenance: 'Maintenance and quality task',
};

/**
 * 创建指定的 labels
 *
 * @param labels - 需要创建的 label 名称列表（应已去重）
 * @returns 已创建的 label 名称列表
 */
export async function createLabels(
  labels: string[],
  cwd: string,
  dryRun: boolean,
  adapter: PlatformAdapter,
): Promise<string[]> {
  const createdLabels: string[] = [];

  for (const labelName of labels) {
    const color = LABEL_COLORS[labelName] ?? '666666';
    const description = LABEL_DESCRIPTIONS[labelName] ?? '';

    if (dryRun) {
      logger.info(`[dry-run] 将创建 label: ${labelName} (#${color})`);
      createdLabels.push(labelName);
      continue;
    }

    try {
      await adapter.createLabel(labelName, color, description, cwd);
      createdLabels.push(labelName);
      logger.debug(`已创建 label: ${labelName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`创建 label "${labelName}" 失败: ${message}`);
    }
  }

  return createdLabels;
}
