/**
 * visual-test init - 初始化视觉测试配置
 *
 * 交互式收集项目配置，生成配置文件和目录结构。
 */

import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import type { Command } from 'commander';
import { promptInit } from '../ui/prompts';
import { formatInitSuccess } from '../ui/formatter';
import { ensureDir, pathExists } from '../../utils/file';

const CONFIG_FILE_NAME = 'visual-test.config.ts';

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
    console.error(
      chalk.yellow(`Configuration file already exists: ${CONFIG_FILE_NAME}`),
    );
    console.error(chalk.gray('Delete it first or edit it directly.'));
    process.exitCode = 1;
    return;
  }

  // 收集配置
  const answers = options.yes
    ? {
        projectName: path.basename(cwd),
        baselineProvider: 'local' as const,
        enableLLM: true,
        llmModel: 'gpt-4o',
      }
    : await promptInit();

  // 生成配置文件
  const configContent = generateConfigContent(answers);
  fs.writeFileSync(configPath, configContent, 'utf-8');

  // 创建目录结构
  const dirs = [
    '.visual-test/baselines',
    '.visual-test/actuals',
    '.visual-test/diffs',
    '.visual-test/reports',
  ];
  await Promise.all(dirs.map((d) => ensureDir(path.join(cwd, d))));

  // 输出成功信息
  console.log(formatInitSuccess(CONFIG_FILE_NAME));
}

/**
 * 根据用户回答生成配置文件内容
 */
function generateConfigContent(answers: {
  projectName: string;
  baselineProvider: string;
  enableLLM: boolean;
  llmModel?: string;
  apiKey?: string;
}): string {
  const model = answers.llmModel ?? 'gpt-4o';
  const isAnthropic = model.startsWith('claude-');
  const envVar = isAnthropic ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  const apiKeyLine = answers.apiKey
    ? `    // apiKey: ${JSON.stringify(answers.apiKey)},`
    : `    // apiKey: process.env.${envVar},`;

  return `import { defineConfig } from '@kit/visual-testing';

export default defineConfig({
  name: ${JSON.stringify(answers.projectName)},

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
    provider: ${JSON.stringify(answers.baselineProvider)},
  },

  llm: {
    enabled: ${answers.enableLLM},
    model: ${JSON.stringify(model)},
${apiKeyLine}
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
    failOnSeverity: 'major',
  },
});
`;
}
