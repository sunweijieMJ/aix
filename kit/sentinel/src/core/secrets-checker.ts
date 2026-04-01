/**
 * Secrets / Variables 检查
 *
 * 验证仓库是否已配置所需的 secrets 和 variables
 */

import type { PlatformAdapter } from '../platform/index.js';
import { logger } from '../utils/logger.js';

interface SecretsRequirement {
  secrets: string[];
  variables: string[];
}

interface SecretsCheckResult {
  ok: boolean;
  missing: {
    secrets: string[];
    variables: string[];
  };
}

/**
 * 检查所需的 secrets 和 variables 是否已配置
 */
export async function checkSecrets(
  requirement: SecretsRequirement,
  cwd: string,
  adapter: PlatformAdapter,
): Promise<SecretsCheckResult> {
  let existingSecrets: string[] = [];
  let existingVariables: string[] = [];
  try {
    existingSecrets = await adapter.listSecrets(cwd);
    existingVariables = await adapter.listVariables(cwd);
  } catch {
    logger.warn(
      '无法读取 secrets/variables 列表（未登录或权限不足），跳过自动检查',
    );
    return {
      ok: false,
      missing: {
        secrets: requirement.secrets,
        variables: requirement.variables,
      },
    };
  }

  const missingSecrets = requirement.secrets.filter(
    (s) => !existingSecrets.includes(s),
  );
  const missingVariables = requirement.variables.filter(
    (v) => !existingVariables.includes(v),
  );

  const ok = missingSecrets.length === 0 && missingVariables.length === 0;

  if (!ok) {
    if (missingSecrets.length > 0) {
      logger.warn(
        `缺少 secrets: ${missingSecrets.join(', ')}\n  请在仓库 CI 设置中配置`,
      );
    }
    if (missingVariables.length > 0) {
      logger.warn(
        `缺少 variables: ${missingVariables.join(', ')}\n  请在仓库 CI 设置中配置`,
      );
    }
  }

  return {
    ok,
    missing: {
      secrets: missingSecrets,
      variables: missingVariables,
    },
  };
}
