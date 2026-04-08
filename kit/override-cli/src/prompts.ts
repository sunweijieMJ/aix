import prompts from 'prompts';
import pc from 'picocolors';
import { detectLanguage } from './detector';
import {
  ALL_MODULES,
  MODULE_DESCRIPTIONS,
  MODULE_DIMENSION,
  REQUIRED_MODULES,
  type GenerateOptions,
  type ModuleId,
} from './types';

/** 项目代码校验正则 */
const PROJECT_CODE_REGEX = /^[a-z][a-z0-9-]*$/;

/**
 * 运行交互式问答，收集生成选项
 */
export async function runPrompts(
  cwd: string,
  partial: Partial<GenerateOptions>,
): Promise<GenerateOptions | null> {
  const questions: prompts.PromptObject[] = [];

  // 1. 项目代码
  if (!partial.project) {
    questions.push({
      type: 'text',
      name: 'project',
      message: '定制目录名（如 sysu、gzdx）',
      validate: (value: string) =>
        PROJECT_CODE_REGEX.test(value) ? true : '只能包含小写字母、数字和连字符，且以字母开头',
    });
  }

  // 2. 语言选择
  if (!partial.lang) {
    const detected = detectLanguage(cwd);
    questions.push({
      type: 'select',
      name: 'lang',
      message: `项目语言 ${pc.dim(`(自动检测: ${detected === 'ts' ? 'TypeScript' : 'JavaScript'})`)}`,
      choices: [
        { title: 'TypeScript', value: 'ts' },
        { title: 'JavaScript', value: 'js' },
      ],
      initial: detected === 'ts' ? 0 : 1,
    });
  }

  // 3. 模块选择
  if (!partial.modules) {
    questions.push({
      type: 'multiselect',
      name: 'modules',
      message: '选择需要定制的模块 (空格选择，回车确认)',
      choices: ALL_MODULES.map((id) => {
        const isRequired = REQUIRED_MODULES.includes(id);
        const dim = MODULE_DIMENSION[id];
        const dimLabel = dim !== '—' ? pc.dim(` [${dim}]`) : '';
        const label = isRequired
          ? `${id.padEnd(12)} ${MODULE_DESCRIPTIONS[id]}${dimLabel} ${pc.dim('[必选]')}`
          : `${id.padEnd(12)} ${MODULE_DESCRIPTIONS[id]}${dimLabel}`;
        return {
          title: label,
          value: id,
          selected: isRequired,
          disabled: isRequired,
        };
      }),
      hint: '- 空格切换选中, 回车确认',
    });
  }

  // 无需交互
  if (questions.length === 0) {
    return buildOptions(partial);
  }

  let cancelled = false;
  const answers = await prompts(questions, {
    onCancel: () => {
      cancelled = true;
      console.log(pc.yellow('\n已取消'));
      return false;
    },
  });

  if (cancelled) return null;

  return buildOptions({ ...partial, ...answers });
}

function buildOptions(raw: Partial<GenerateOptions>): GenerateOptions {
  // 确保必选模块始终包含
  const modules = raw.modules ?? REQUIRED_MODULES;
  for (const req of REQUIRED_MODULES) {
    if (!modules.includes(req)) {
      modules.push(req);
    }
  }

  return {
    project: raw.project!,
    lang: raw.lang ?? 'ts',
    modules: modules as ModuleId[],
    output: raw.output ?? 'src/overrides',
    yes: raw.yes ?? false,
    dryRun: raw.dryRun ?? false,
    force: raw.force ?? false,
  };
}
