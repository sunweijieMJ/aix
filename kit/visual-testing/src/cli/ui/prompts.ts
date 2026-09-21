/**
 * 交互式 Prompts - 基于 @inquirer/prompts
 *
 * 封装 visual-test init 所需的交互式收集流程
 */

import chalk from 'chalk';
import { confirm, input, password, select } from '@inquirer/prompts';
import type { BaselineSourceType } from '../../core/baseline/types';

/**
 * init 命令收集到的用户配置
 *
 * baselineProvider 沿用 BaselineSourceType（含已废弃的 figma-mcp）保持类型兼容，
 * 但交互选项只提供 local / figma-api，不再引导新项目使用 MCP 方案。
 */
export interface InitAnswers {
  projectName: string;
  baselineProvider: BaselineSourceType;
  /** Figma 文件 Key（figma-api 时可填，允许留空后续在配置文件里补） */
  figmaFileKey?: string;
  enableLLM: boolean;
  llmModel?: string;
  apiKey?: string;
}

/**
 * 运行 visual-test init 的交互式问答
 */
export async function promptInit(): Promise<InitAnswers> {
  const projectName = await input({
    message: 'Project name:',
    default: 'my-project',
  });

  const baselineProvider = await select<BaselineSourceType>({
    message: 'Baseline provider:',
    choices: [
      { name: 'Local (manual screenshots)', value: 'local' },
      { name: 'Figma REST API (recommended for design baselines)', value: 'figma-api' },
    ],
    default: 'local',
  });

  let figmaFileKey: string | undefined;

  if (baselineProvider === 'figma-api') {
    // Token 一律走环境变量：配置文件会进版本库，写进去等同于泄露
    console.log(
      chalk.gray(
        '  Set FIGMA_TOKEN in your environment (Figma → Settings → Security → Personal access tokens).',
      ),
    );
    const key = await input({
      message: 'Figma file key (leave empty to fill in later):',
    });
    figmaFileKey = key.trim() || undefined;
  }

  const enableLLM = await confirm({
    message: 'Enable LLM analysis?',
    default: false,
  });

  let llmModel: string | undefined;
  let apiKey: string | undefined;

  if (enableLLM) {
    llmModel = await select<string>({
      message: 'LLM model:',
      choices: [
        { name: 'GPT-4o (OpenAI)', value: 'gpt-4o' },
        {
          name: 'Claude Sonnet (Anthropic)',
          value: 'claude-sonnet-4-20250514',
        },
      ],
      default: 'gpt-4o',
    });

    const key = await password({
      message: 'API Key (leave empty to use env variable):',
      mask: '*',
    });
    apiKey = key || undefined;
  }

  return {
    projectName,
    baselineProvider,
    figmaFileKey,
    enableLLM,
    llmModel,
    apiKey,
  };
}
