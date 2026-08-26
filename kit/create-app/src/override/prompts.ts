import { text, multiselect, isCancel } from '@clack/prompts';
import pc from 'picocolors';
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
  partial: Partial<GenerateOptions>,
): Promise<GenerateOptions | null> {
  let project = partial.project;
  let modules = partial.modules;

  // 1. 项目代码
  if (!project) {
    const result = await text({
      message: '定制目录名（如 sysu、gzdx）',
      validate: (value) =>
        value && PROJECT_CODE_REGEX.test(value)
          ? undefined
          : '只能包含小写字母、数字和连字符，且以字母开头',
    });
    if (isCancel(result)) {
      console.log(pc.yellow('\n已取消'));
      return null;
    }
    project = result;
  }

  // 2. 模块选择
  if (!modules) {
    const result = await multiselect({
      message: '选择需要定制的模块 (空格选择，回车确认)',
      options: ALL_MODULES.map((id) => {
        const isRequired = REQUIRED_MODULES.includes(id);
        const dim = MODULE_DIMENSION[id];
        const dimLabel = dim !== '—' ? ` [${dim}]` : '';
        const hint = isRequired
          ? `${MODULE_DESCRIPTIONS[id]}${dimLabel} [必选]`
          : `${MODULE_DESCRIPTIONS[id]}${dimLabel}`;
        return {
          label: id,
          value: id,
          hint,
        };
      }),
      initialValues: REQUIRED_MODULES,
      required: true,
    });
    if (isCancel(result)) {
      console.log(pc.yellow('\n已取消'));
      return null;
    }
    // 确保必选模块始终包含
    const selected = result as ModuleId[];
    for (const req of REQUIRED_MODULES) {
      if (!selected.includes(req)) {
        selected.push(req);
      }
    }
    modules = selected;
  }

  return buildOptions({ ...partial, project, modules });
}

function buildOptions(raw: Partial<GenerateOptions>): GenerateOptions {
  const modules = raw.modules ?? REQUIRED_MODULES;
  // 确保必选模块始终包含
  for (const req of REQUIRED_MODULES) {
    if (!modules.includes(req)) {
      modules.push(req);
    }
  }

  return {
    project: raw.project!,
    modules: modules as ModuleId[],
    output: raw.output ?? 'src/overrides',
    yes: raw.yes ?? false,
    dryRun: raw.dryRun ?? false,
    force: raw.force ?? false,
  };
}
