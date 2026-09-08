/**
 * 交互式 Prompts - 基于 @inquirer/prompts
 *
 * 封装 visual-test init 所需的交互式收集流程
 */

import { confirm, input, password, select } from '@inquirer/prompts';

/**
 * init 命令收集到的用户配置
 */
export interface InitAnswers {
  projectName: string;
  baselineProvider: 'local' | 'figma-mcp';
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

  const baselineProvider = await select<'local' | 'figma-mcp'>({
    message: 'Baseline provider:',
    choices: [
      { name: 'Local (manual screenshots)', value: 'local' },
      { name: 'Figma MCP (auto-extract from Figma)', value: 'figma-mcp' },
    ],
    default: 'local',
  });

  const enableLLM = await confirm({
    message: 'Enable LLM analysis?',
    default: true,
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
    enableLLM,
    llmModel,
    apiKey,
  };
}
