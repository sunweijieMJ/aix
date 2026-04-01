/**
 * 交互式 Prompts - 基于 inquirer
 *
 * 封装 visual-test init 所需的交互式收集流程
 */

import inquirer from 'inquirer';

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
 *
 * 分步收集以兼容 inquirer v9+ 的严格类型
 */
export async function promptInit(): Promise<InitAnswers> {
  const { projectName } = await inquirer.prompt({
    type: 'input',
    name: 'projectName',
    message: 'Project name:',
    default: 'my-project',
  });

  const { baselineProvider } = await inquirer.prompt({
    type: 'list',
    name: 'baselineProvider',
    message: 'Baseline provider:',
    choices: [
      { name: 'Local (manual screenshots)', value: 'local' },
      { name: 'Figma MCP (auto-extract from Figma)', value: 'figma-mcp' },
    ],
    default: 'local',
  });

  const { enableLLM } = await inquirer.prompt({
    type: 'confirm',
    name: 'enableLLM',
    message: 'Enable LLM analysis?',
    default: true,
  });

  let llmModel: string | undefined;
  let apiKey: string | undefined;

  if (enableLLM) {
    const modelAnswer = await inquirer.prompt({
      type: 'list',
      name: 'llmModel',
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
    llmModel = modelAnswer.llmModel;

    const keyAnswer = await inquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: 'API Key (leave empty to use env variable):',
      mask: '*',
    });
    apiKey = keyAnswer.apiKey || undefined;
  }

  return {
    projectName,
    baselineProvider,
    enableLLM,
    llmModel,
    apiKey,
  };
}
