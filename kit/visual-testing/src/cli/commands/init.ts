/**
 * visual-test init - 初始化视觉测试配置
 *
 * 交互式收集项目配置，生成配置文件和目录结构。
 */

import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import type { Command } from 'commander';
import { promptInit, type InitAnswers } from '../ui/prompts';
import { formatInitSuccess } from '../ui/formatter';
import { ensureDir, pathExists } from '../../utils/file';

const CONFIG_FILE_NAME = 'visual-test.config.ts';

/** init 生成的目录结构 */
const SCAFFOLD_DIRS = [
  '.visual-test/baselines',
  '.visual-test/actuals',
  '.visual-test/diffs',
  '.visual-test/reports',
  '.visual-test/fidelity',
];

/**
 * 注册 init 命令
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize visual testing configuration')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .action(async (options: { yes?: boolean }) => {
      await runInit(options);
    });
}

async function runInit(options: { yes?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const configPath = path.join(cwd, CONFIG_FILE_NAME);

  // 检查是否已存在配置
  if (await pathExists(configPath)) {
    console.error(chalk.yellow(`Configuration file already exists: ${CONFIG_FILE_NAME}`));
    console.error(chalk.gray('Delete it first or edit it directly.'));
    process.exitCode = 1;
    return;
  }

  // 收集配置
  const answers: InitAnswers = options.yes
    ? {
        projectName: path.basename(cwd),
        baselineProvider: 'local',
        enableLLM: false,
        llmModel: 'gpt-4o',
      }
    : await promptInit();

  // 生成配置文件
  const configContent = generateConfigContent(answers);
  fs.writeFileSync(configPath, configContent, 'utf-8');

  // 创建目录结构
  await Promise.all(SCAFFOLD_DIRS.map((d) => ensureDir(path.join(cwd, d))));

  // 输出成功信息
  console.log(formatInitSuccess(CONFIG_FILE_NAME));

  if (answers.baselineProvider === 'figma-api') {
    console.log(
      chalk.gray('  Remember: export FIGMA_TOKEN=figd_xxx before running sync/fidelity.'),
    );
  }
  if (answers.apiKey) {
    console.log(
      chalk.gray(
        `  Remember: put your LLM API key in ${llmEnvVar(answers.llmModel)} — init never writes secrets into the config file.`,
      ),
    );
  }
}

/** 按模型厂商推断 API Key 环境变量名 */
function llmEnvVar(model: string | undefined): string {
  return (model ?? 'gpt-4o').startsWith('claude-') ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
}

/** 生成单引号字符串字面量，与模板配置的 prettier 风格一致 */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * 根据用户回答生成配置文件内容
 *
 * 与 templates/config/visual-test.config.ts 保持一致的字段集合；
 * 密钥（FIGMA_TOKEN / LLM API Key）一律只以环境变量形式出现，绝不写入明文。
 */
export function generateConfigContent(answers: InitAnswers): string {
  const model = answers.llmModel ?? 'gpt-4o';
  const envVar = llmEnvVar(model);
  const figmaBlock = answers.figmaFileKey
    ? `
    // accessToken 只从环境变量 FIGMA_TOKEN 读取，不要写进配置文件
    figma: {
      fileKey: ${quote(answers.figmaFileKey)},
    },`
    : `
    // figma: {
    //   fileKey: 'your-figma-file-key',   // accessToken 走环境变量 FIGMA_TOKEN
    // },`;

  return `import { defineConfig } from '@kit/visual-testing';

export default defineConfig({
  name: ${quote(answers.projectName)},

  directories: {
    baselines: '.visual-test/baselines',
    actuals: '.visual-test/actuals',
    diffs: '.visual-test/diffs',
    reports: '.visual-test/reports',
  },

  server: {
    url: 'http://localhost:6006',
  },

  screenshot: {
    viewport: { width: 1280, height: 720 },
    // 设备像素比：Figma 位图导出的 scale 跟随此值，保证基线与截图尺寸一致
    deviceScaleFactor: 1,
    stability: {
      waitForNetworkIdle: true,
      waitForAnimations: true,
      extraDelay: 500,
      disableAnimations: true,
      hideSelectors: [],
    },
  },

  comparison: {
    threshold: 0.01,
    antialiasing: true,
  },

  baseline: {
    provider: ${quote(answers.baselineProvider)},${figmaBlock}
  },

  llm: {
    enabled: ${answers.enableLLM},
    model: ${quote(model)},
    // apiKey: process.env.${envVar},
    costControl: {
      maxCallsPerRun: 50,
      diffThreshold: 5,
      cacheEnabled: true,
      cacheTTL: 3600,
    },
    fallback: {
      onError: 'skip',
      retryAttempts: 2,
      timeout: 30000,
      fallbackToRuleBase: true,
    },
  },

  targets: [
    // {
    //   name: 'button',
    //   type: 'component',
    //   variants: [
    //     {
    //       name: 'primary',
    //       url: 'http://localhost:6006/iframe.html?id=button--primary',
    //       baseline: '.visual-test/baselines/button/primary.png',
    //       selector: '#storybook-root > *',
    //     },
    //   ],
    // },
  ],

  report: {
    formats: ['html', 'json'],
    conclusion: true,
  },

  ci: {
    failOnDiff: true,
    // 'pixel'：像素比对未通过即失败（确定性）| 'severity'：按 LLM/规则 severity 判定
    gate: 'pixel',
    failOnSeverity: 'major',
  },

  // 设计还原度校验（visual-test fidelity）
  fidelity: {
    viewport: 'frame', // 跟随 Figma Frame 尺寸，或 { width, height }
    // 可选：期望色 → CSS 变量名映射来源，指向项目的主题变量文件
    // tokens: {
    //   cssFile: 'public/assets/theme.css',
    //   prefix: '--aix-',
    // },
    output: { dir: '.visual-test/fidelity', formats: ['md', 'json'] },
  },
});
`;
}
