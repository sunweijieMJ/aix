/**
 * init 命令 — 交互式初始化 AI 编码规范
 */

import { createRequire } from 'node:module';
import type { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'node:path';

import type {
  AIPlatform,
  DomainPreset,
  FrameworkPreset,
  InitConfig,
  ResourceType,
  RuleSource,
  UserConfig,
} from '../types.js';
import { ALL_DOMAINS, ALL_PLATFORMS } from '../types.js';
import { existsSync, getPresetsDir, readProjectName } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { detectPlatforms } from '../core/detector.js';
import { loadRuleSources, resolvePresetNames } from '../core/resolver.js';
import { writeOutputFiles } from '../core/writer.js';
import { buildLockFile, readLockFile, writeLockFile } from '../core/lock.js';
import { initConfigToPersisted, writeConfig } from '../core/config.js';
import { getAvailablePlatforms } from '../adapters/index.js';
import { generateAllPlatformFiles } from '../core/generator.js';

const req = createRequire(import.meta.url);

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('交互式初始化 AI 编码规范')
    .option('--platform <platforms>', '目标 AI 平台（逗号分隔）', '')
    .option('--framework <name>', '框架预设 (vue3/react)')
    .option('--domain <domains>', '领域模块（逗号分隔）', '')
    .option('--prefix <prefix>', 'CSS 类名前缀', '')
    .option('--scope <scope>', 'npm 包 scope', '')
    .option('--target <dir>', '目标项目目录', process.cwd())
    .option('--detect', '自动检测并选择所有已存在的 AI 平台', false)
    .option('--yes', '非交互模式，使用默认值', false)
    .option('--dry-run', '预览模式，不实际写入文件', false)
    .action(async (opts) => {
      try {
        await runInit(opts);
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

interface InitOptions {
  platform: string;
  framework: string;
  domain: string;
  prefix: string;
  scope: string;
  target: string;
  detect: boolean;
  yes: boolean;
  dryRun: boolean;
}

async function runInit(opts: InitOptions): Promise<void> {
  const projectRoot = path.resolve(opts.target);

  // 检查目标目录
  if (!existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error(`目标目录 ${projectRoot} 中未找到 package.json`);
  }

  // 读取项目名称
  const projectName = readProjectName(projectRoot);

  // 检测已有平台
  const detectedPlatforms = detectPlatforms(projectRoot);
  const availablePlatforms = getAvailablePlatforms();

  let config: InitConfig;
  let excludeRules: string[] = [];

  if (opts.yes) {
    // 非交互模式
    config = buildConfigFromFlags(opts, projectName, detectedPlatforms);
  } else {
    // 交互模式
    const result = await collectConfigInteractively(
      projectName,
      detectedPlatforms,
      availablePlatforms,
    );
    config = result.config;
    excludeRules = result.exclude;
  }

  // 显示配置预览
  printConfigPreview(config, excludeRules);

  // 非交互模式跳过确认
  if (!opts.yes) {
    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: '确认安装?',
        default: true,
      },
    ]);
    if (!confirmed) {
      logger.info('已取消');
      return;
    }
  }

  logger.blank();
  logger.resetSteps();

  // 执行安装
  await executeInit(config, {
    projectRoot,
    dryRun: opts.dryRun,
    userConfig: excludeRules.length > 0 ? { exclude: excludeRules } : undefined,
  });
}

/** 从命令行参数构建配置 */
function buildConfigFromFlags(
  opts: InitOptions,
  projectName: string,
  detected: AIPlatform[],
): InitConfig {
  let platforms: AIPlatform[];
  if (opts.platform) {
    const available = getAvailablePlatforms();
    platforms = opts.platform.split(',').map((p) => {
      const trimmed = p.trim() as AIPlatform;
      if (!available.includes(trimmed)) {
        throw new Error(`平台 "${trimmed}" 尚未支持。可用: ${available.join(', ')}`);
      }
      return trimmed;
    });
  } else if (opts.detect && detected.length > 0) {
    platforms = detected;
    logger.info(
      `自动检测到 ${detected.length} 个平台: ${detected.map(getPlatformLabel).join(', ')}`,
    );
  } else if (detected.length > 0) {
    platforms = detected;
  } else {
    platforms = ['claude'];
  }

  return {
    platforms,
    framework: (opts.framework as FrameworkPreset) || undefined,
    domains: opts.domain ? (opts.domain.split(',') as DomainPreset[]) : [],
    projectName,
    variables: {
      ...(opts.prefix ? { componentPrefix: opts.prefix } : {}),
      ...(opts.scope ? { packageScope: opts.scope } : {}),
    },
  };
}

/** 交互式收集配置 */
async function collectConfigInteractively(
  projectName: string,
  detected: AIPlatform[],
  available: AIPlatform[],
): Promise<{ config: InitConfig; exclude: string[] }> {
  console.log();
  console.log(chalk.bold('  🤖 AI Preset 初始化'));
  console.log();

  // 1. 选择平台
  const platformChoices = ALL_PLATFORMS.map((p) => ({
    name: `${getPlatformLabel(p)}${detected.includes(p) ? chalk.gray(' (已检测到)') : ''}${!available.includes(p) ? chalk.gray(' (即将支持)') : ''}`,
    value: p,
    checked: detected.includes(p) || (detected.length === 0 && p === 'claude'),
    disabled: !available.includes(p) ? ('即将支持' as const) : false,
  }));

  const { platforms } = await inquirer.prompt<{ platforms: AIPlatform[] }>([
    {
      type: 'checkbox',
      name: 'platforms',
      message: '选择 AI 工具 (可多选)',
      choices: platformChoices,
      validate: (input: AIPlatform[]) => input.length > 0 || '至少选择一个平台',
    },
  ]);

  // 2. 选择框架
  const { framework } = await inquirer.prompt<{
    framework: FrameworkPreset | '';
  }>([
    {
      type: 'select',
      name: 'framework',
      message: '选择框架',
      choices: [
        { name: 'Vue 3', value: 'vue3' },
        { name: 'React', value: 'react' },
        { name: '不选择框架', value: '' },
      ],
    },
  ]);

  // 3. 选择领域
  const domainChoices = ALL_DOMAINS.map((d) => ({
    name: getDomainLabel(d),
    value: d,
  }));

  const { domains } = await inquirer.prompt<{ domains: DomainPreset[] }>([
    {
      type: 'checkbox',
      name: 'domains',
      message: '选择领域模块 (可多选，可跳过)',
      choices: domainChoices,
    },
  ]);

  // 4. 变量收集
  const variables: Record<string, string> = {};
  if (framework === 'vue3') {
    const { prefix } = await inquirer.prompt<{ prefix: string }>([
      {
        type: 'input',
        name: 'prefix',
        message: '组件 CSS 类名前缀',
        default: 'app',
      },
    ]);
    variables.componentPrefix = prefix;
  }

  // 5. 规则精选（按 resourceType 分组展示）
  const tempConfig: InitConfig = {
    platforms,
    framework: framework || undefined,
    domains,
    projectName,
    variables,
  };

  const exclude = await collectRuleSelections(tempConfig);

  return {
    config: tempConfig,
    exclude,
  };
}

/** 资源类型标签 */
const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  rules: '📄 编码规范',
  agent: '🤖 Agents',
  command: '⚡ Commands',
  skill: '🔧 Skills',
};

/** 规则精选：加载所有规则，按 resourceType 分组展示 */
async function collectRuleSelections(config: InitConfig): Promise<string[]> {
  const presetsRoot = getPresetsDir();
  const presetNames = resolvePresetNames(config);
  const allRules = await loadRuleSources(presetsRoot, presetNames);

  if (allRules.length === 0) return [];

  // 按 resourceType 分组
  const grouped = new Map<ResourceType, RuleSource[]>();
  for (const rule of allRules) {
    const type = rule.meta.resourceType || 'rules';
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(rule);
  }

  // 只有 rules 类型且数量少于 3 条时跳过精选
  if (grouped.size === 1 && grouped.has('rules') && allRules.length < 3) {
    return [];
  }

  const { wantCustomize } = await inquirer.prompt<{ wantCustomize: boolean }>([
    {
      type: 'confirm',
      name: 'wantCustomize',
      message: `共加载 ${allRules.length} 条规则，是否需要精选? (默认全部安装)`,
      default: false,
    },
  ]);

  if (!wantCustomize) return [];

  const excludeIds: string[] = [];

  // 按分组让用户选择
  for (const [type, rules] of grouped) {
    const label = RESOURCE_TYPE_LABELS[type] || type;
    const choices = rules.map((r) => ({
      name: `${r.meta.title || r.meta.id} ${chalk.gray(`(${r.meta.id})`)}`,
      value: r.meta.id,
      checked: true,
    }));

    const { selected } = await inquirer.prompt<{ selected: string[] }>([
      {
        type: 'checkbox',
        name: 'selected',
        message: `${label} — 取消勾选不需要的`,
        choices,
      },
    ]);

    const selectedSet = new Set(selected);
    for (const rule of rules) {
      if (!selectedSet.has(rule.meta.id)) {
        excludeIds.push(rule.meta.id);
      }
    }
  }

  if (excludeIds.length > 0) {
    logger.info(`已排除 ${excludeIds.length} 条规则`);
  }

  return excludeIds;
}

/** 打印配置预览 */
function printConfigPreview(config: InitConfig, exclude: string[] = []): void {
  logger.blank();
  console.log(chalk.bold('  📋 配置预览:'));
  console.log(`    平台: ${config.platforms.map(getPlatformLabel).join(', ')}`);
  console.log(`    框架: ${config.framework || '无'}`);
  console.log(
    `    领域: ${config.domains.length > 0 ? config.domains.map(getDomainLabel).join(', ') : '无'}`,
  );
  if (Object.keys(config.variables).length > 0) {
    console.log(
      `    变量: ${Object.entries(config.variables)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    );
  }
  console.log(`    预设: ${resolvePresetNames(config).join(' + ')}`);
  if (exclude.length > 0) {
    console.log(`    排除: ${exclude.length} 条规则`);
  }
  logger.blank();
}

/** 执行安装流程 */
async function executeInit(
  config: InitConfig,
  options: { projectRoot: string; dryRun: boolean; userConfig?: UserConfig },
): Promise<void> {
  // 1. 生成所有平台文件
  const presetNames = resolvePresetNames(config);
  logger.step(`加载预设: ${presetNames.join(', ')}`);

  const allFiles = await generateAllPlatformFiles(config, {
    projectRoot: options.projectRoot,
    userConfig: options.userConfig,
  });
  logger.step(`生成了 ${allFiles.length} 个文件`);

  // 5. 读取现有 lock
  const existingLock = await readLockFile(options.projectRoot);

  // 6. 写入文件
  logger.step(`写入 ${allFiles.length} 个文件`);
  const writeResult = await writeOutputFiles(allFiles, existingLock, {
    projectRoot: options.projectRoot,
    dryRun: options.dryRun,
  });

  // 7. 生成 lock 文件
  const { version: cliVersion } = req('../package.json') as { version: string };
  const lockFile = buildLockFile(allFiles, writeResult, config, cliVersion, existingLock);
  if (!options.dryRun) {
    logger.step('更新 lock 文件');
    await writeLockFile(options.projectRoot, lockFile);

    // 8. 保存 config.json
    logger.step('保存配置');
    const persistedConfig = initConfigToPersisted(config, options.userConfig);
    await writeConfig(options.projectRoot, persistedConfig);
  }

  // 9. 摘要
  logger.blank();
  logger.success(
    `完成! 写入 ${writeResult.writtenFiles.length} 个文件` +
      (writeResult.skippedFiles.length > 0 ? `，跳过 ${writeResult.skippedFiles.length} 个` : ''),
  );

  if (options.dryRun) {
    logger.warn('(dry-run 模式，未实际写入文件)');
  }
}

function getPlatformLabel(p: AIPlatform): string {
  const labels: Record<AIPlatform, string> = {
    claude: 'Claude Code',
    cursor: 'Cursor',
    copilot: 'GitHub Copilot',
    codex: 'OpenAI Codex',
    windsurf: 'Windsurf',
    trae: 'Trae (字节)',
    tongyi: '通义灵码 (阿里)',
    qoder: 'Qoder (阿里)',
    gemini: 'Gemini CLI (Google)',
  };
  return labels[p] || p;
}

function getDomainLabel(d: DomainPreset): string {
  const labels: Record<DomainPreset, string> = {
    'component-lib': '组件库开发',
    admin: '中后台管理系统',
    mobile: '移动端 / H5',
    monorepo: 'Monorepo 管理',
    team: 'Team 多 Agent 协作',
    design: '设计稿还原 (Figma)',
  };
  return labels[d] || d;
}
