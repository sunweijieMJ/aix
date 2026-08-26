import { text, multiselect, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { CreateAppError } from '../utils/errors';
import { validateOverrideCode } from '../utils/validate';
import {
  ALL_MODULES,
  MODULE_DESCRIPTIONS,
  MODULE_DIMENSION,
  REQUIRED_MODULES,
  type GenerateOptions,
  type ModuleId,
} from './types';

/**
 * 运行交互式问答，收集生成选项
 *
 * 注意：传进来的 `partial.project`（命令行位置参数）同样要校验。历史缺陷是校验只写在
 * 下面那个 text 问答的 validate 里，命令行给值时整段问答被跳过 → `../../PWNED`
 * 一路走到写盘，把覆盖层写到 output 目录之外（且 registry 的 glob 扫不到它）。
 */
export async function runPrompts(
  partial: Partial<GenerateOptions>,
): Promise<GenerateOptions | null> {
  let project = partial.project;
  let modules = partial.modules;

  // truthy 判断：空串按「缺失」处理，落进下面的问答（与 add.ts 同一套约定）
  if (project) {
    const error = validateOverrideCode(project);
    if (error) throw new CreateAppError('E_INVALID_PROJECT_NAME', error, '请更换定制目录名后重试');
  }

  // 1. 项目代码
  if (!project) {
    const result = await text({
      message: '定制目录名（如 sysu、gzdx）',
      validate: (value) => validateOverrideCode(value),
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
