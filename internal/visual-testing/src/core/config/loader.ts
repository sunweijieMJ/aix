/**
 * 配置加载器
 *
 * 使用 cosmiconfig 搜索配置文件，合并默认值，通过 Zod 验证。
 */

import { cosmiconfig } from 'cosmiconfig';
import {
  configSchema,
  type VisualTestConfig,
  type VisualTestUserConfig,
} from './schema';
import { logger } from '../../utils/logger';

const MODULE_NAME = 'visual-test';
const log = logger.child('config-loader');

/**
 * 加载并验证视觉测试配置
 *
 * 搜索顺序 (cosmiconfig 默认):
 * - visual-test.config.{ts,js,mjs,cjs}
 * - .visual-testrc.{json,yaml,yml,js,cjs}
 * - package.json 中的 "visual-test" 字段
 *
 * @param cwd - 搜索起始目录，默认为 process.cwd()
 * @returns 经过验证的完整配置对象
 */
export async function loadConfig(cwd?: string): Promise<VisualTestConfig> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      `${MODULE_NAME}.config.ts`,
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.config.mjs`,
      `${MODULE_NAME}.config.cjs`,
      `${MODULE_NAME}.config.json`,
      `.${MODULE_NAME}rc`,
      `.${MODULE_NAME}rc.json`,
      `.${MODULE_NAME}rc.yaml`,
      `.${MODULE_NAME}rc.yml`,
      `.${MODULE_NAME}rc.js`,
      `.${MODULE_NAME}rc.cjs`,
      'package.json',
    ],
  });

  const result = await explorer.search(cwd);

  const userConfig: VisualTestUserConfig = result?.config ?? {};

  const config = validateConfig(userConfig);

  // 配置逻辑验证（警告不会阻止运行）
  validateConfigLogic(config);

  return config;
}

/**
 * 从指定路径加载配置文件
 *
 * @param filePath - 配置文件路径
 * @returns 经过验证的完整配置对象
 */
export async function loadConfigFromFile(
  filePath: string,
): Promise<VisualTestConfig> {
  const explorer = cosmiconfig(MODULE_NAME);
  const result = await explorer.load(filePath);

  const userConfig: VisualTestUserConfig = result?.config ?? {};

  const config = validateConfig(userConfig);

  // 配置逻辑验证（警告不会阻止运行）
  validateConfigLogic(config);

  return config;
}

/**
 * 验证配置对象并填充默认值
 *
 * @param userConfig - 用户提供的配置（部分字段）
 * @returns 经过验证的完整配置对象
 * @throws {Error} 配置验证失败时抛出，包含详细错误信息
 */
export function validateConfig(
  userConfig: VisualTestUserConfig,
): VisualTestConfig {
  const result = configSchema.safeParse(userConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`配置验证失败:\n${errors}`);
  }

  return result.data;
}

/**
 * 配置逻辑验证（检测配置冲突和潜在问题）
 *
 * @param config - 完整配置对象
 */
export function validateConfigLogic(config: VisualTestConfig): void {
  const warnings: string[] = [];

  // 计算总测试任务数
  const totalVariants = config.targets.reduce(
    (sum, target) => sum + target.variants.length,
    0,
  );

  // 1. LLM 成本控制与总任务数冲突检测
  if (config.llm.enabled && config.llm.costControl.maxCallsPerRun) {
    const maxCalls = config.llm.costControl.maxCallsPerRun;

    if (totalVariants > maxCalls) {
      warnings.push(
        `⚠️  Total test variants (${totalVariants}) exceeds LLM call limit (${maxCalls}).\n` +
          `   Some failed tests won't get LLM analysis. Consider increasing 'llm.costControl.maxCallsPerRun'.`,
      );
    }
  }

  // 2. 截图稳定性配置冲突
  if (
    config.screenshot.stability.disableAnimations &&
    !config.screenshot.stability.waitForAnimations
  ) {
    warnings.push(
      `⚠️  'screenshot.stability.disableAnimations' is true but 'waitForAnimations' is false.\n` +
        `   Consider setting 'waitForAnimations: true' for better stability.`,
    );
  }

  // 3. 并发数与资源限制
  const maxTargets = config.performance?.concurrent?.maxTargets ?? 10;
  const maxBrowsers = config.performance?.concurrent?.maxBrowsers ?? 3;

  if (maxTargets > maxBrowsers * 3) {
    warnings.push(
      `⚠️  Concurrent targets (${maxTargets}) is much higher than browsers (${maxBrowsers}).\n` +
        `   This may cause browser resource exhaustion. Consider balancing these values.`,
    );
  }

  // 4. 目标配置检查（Storybook 自动发现模式下无需手动配置 targets）
  if (config.targets.length === 0 && !config.storybook.enabled) {
    warnings.push(
      `⚠️  No test targets defined. Add targets to 'targets' array.`,
    );
  }

  // 5. 多视口 + 本地基准图冲突检测
  if (
    config.screenshot.viewports.length > 0 &&
    config.baseline.provider === 'local'
  ) {
    const localBaselineTargets = config.targets.filter((t) =>
      t.variants.some((v) => typeof v.baseline === 'string'),
    );
    if (localBaselineTargets.length > 0) {
      warnings.push(
        `⚠️  Global viewports (${config.screenshot.viewports.length}) configured with local baselines.\n` +
          `   Each viewport variant will share the same baseline source, which may cause size mismatches.\n` +
          `   Consider providing viewport-specific baselines or using 'figma-mcp' provider.`,
      );
    }
  }

  // 7. 基准图提供器与目标配置冲突
  const figmaVariants = config.targets.flatMap((t) =>
    t.variants.filter(
      (v) => typeof v.baseline === 'object' && v.baseline.type === 'figma-mcp',
    ),
  );

  if (figmaVariants.length > 0 && config.baseline.provider === 'local') {
    warnings.push(
      `⚠️  Found ${figmaVariants.length} Figma baseline(s) but global provider is 'local'.\n` +
        `   Consider setting 'baseline.provider' to 'figma-mcp'.`,
    );
  }

  // 输出警告
  if (warnings.length > 0) {
    log.warn('Configuration warnings detected:\n' + warnings.join('\n\n'));
  } else {
    log.debug('Configuration validation passed');
  }
}

/**
 * defineConfig 辅助函数，提供类型提示
 *
 * @param config - 用户配置对象
 * @returns 原样返回配置对象
 */
export function defineConfig(
  config: VisualTestUserConfig,
): VisualTestUserConfig {
  return config;
}
