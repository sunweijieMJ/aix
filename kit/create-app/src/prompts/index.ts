import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { TEMPLATE_REGISTRY, findTemplateById } from '../config/defaults';
import type { TemplateConfig } from '../types';
import { CreateAppError } from '../utils/errors';
import { validateProjectName } from '../utils/validate';

function onCancel(): never {
  p.cancel('已取消，未做任何修改。');
  process.exit(0);
}

/** 步骤 1-2 的产物：项目基本信息 + 已确定的模板源 */
export interface BasicInfo {
  name: string;
  description: string;
  /** 选中的注册表 id；`--template` 直传源时为 undefined */
  templateId?: string;
  /** 展示用名称：注册表 label，直传源时即源字符串 */
  templateLabel: string;
  /** 待交给 resolver 的模板源 */
  templateSource: string;
}

/** 步骤 5 的产物：后处理选项 */
export interface PostOptions {
  packageManager: 'pnpm' | 'npm' | 'yarn';
  initGit: boolean;
  installDeps: boolean;
}

export interface CollectBasicOptions {
  /** 命令行预置值（跳过对应问答） */
  name?: string;
  description?: string;
  /** 注册表 id 或直接的模板源（本地路径 / giget 格式） */
  template?: string;
  force?: boolean;
}

export interface CollectPostOptions {
  /** `--no-git` 已指定时跳过提问 */
  initGit?: boolean;
  /** `--no-install` 已指定时跳过提问 */
  installDeps?: boolean;
}

/** 把 `--template` 的取值解释为注册表条目或裸模板源 */
export function resolveTemplateArg(
  template: string,
): Pick<BasicInfo, 'templateId' | 'templateLabel' | 'templateSource'> {
  const entry = findTemplateById(template);
  if (entry) {
    return { templateId: entry.id, templateLabel: entry.label, templateSource: entry.source };
  }
  return { templateLabel: template, templateSource: template };
}

/**
 * 步骤 1-2：项目名 / 描述 / 目录冲突检查 / 模板选择
 *
 * 目录冲突检查只在这里做一次（create.ts 不再重复检查）。
 */
export async function collectBasicInfo(options: CollectBasicOptions = {}): Promise<BasicInfo> {
  p.intro(pc.bold(pc.bgCyan(' create-app ')) + ' 前端项目脚手架');

  const name =
    options.name ??
    (await (async () => {
      const result = await p.text({ message: '项目名称', validate: validateProjectName });
      if (p.isCancel(result)) onCancel();
      return result;
    })());

  // 命令行传入的项目名也要校验，避免非法名一路走到写盘
  const nameError = validateProjectName(name);
  if (nameError) {
    throw new CreateAppError('E_INVALID_PROJECT_NAME', nameError, '请更换项目名后重试');
  }

  const description =
    options.description ??
    (await (async () => {
      const result = await p.text({ message: '项目描述（可选）', placeholder: '留空跳过' });
      if (p.isCancel(result)) onCancel();
      return result ?? '';
    })());

  // 提前检查目标目录，避免走完所有问答才报冲突
  const targetDir = path.resolve(process.cwd(), name);
  if (fs.existsSync(targetDir) && !options.force) {
    const overwrite = await p.confirm({
      message: `目录 ${pc.yellow(name)} 已存在，是否覆盖？`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) onCancel();
  }

  if (options.template) {
    return { name, description, ...resolveTemplateArg(options.template) };
  }

  const picked = await p.select({
    message: '项目模版',
    options: TEMPLATE_REGISTRY.map((entry) => ({
      value: entry.id,
      label: entry.label,
      hint: entry.hint,
    })),
  });
  if (p.isCancel(picked)) onCancel();

  return { name, description, ...resolveTemplateArg(picked) };
}

/**
 * 校验 `--features` 传入的 id 都存在于模板 manifest
 *
 * @throws CreateAppError E_UNKNOWN_FEATURE
 */
export function validateFeatureIds(ids: string[], manifest: TemplateConfig): string[] {
  const available = Object.keys(manifest.features);
  const unknown = ids.filter((id) => !available.includes(id));
  if (unknown.length > 0) {
    throw new CreateAppError(
      'E_UNKNOWN_FEATURE',
      `模板 ${manifest.id} 不存在特性: ${unknown.join(', ')}`,
      available.length > 0
        ? `可用特性: ${available.join(', ')}`
        : '该模板未声明任何可选特性，请去掉 --features',
    );
  }
  return ids;
}

/**
 * 步骤 4：用 manifest.features 动态渲染 multiselect
 *
 * argvFeatures 为 `--features` 的解析结果（已按逗号切分），传入时跳过问答。
 */
export async function collectFeatureSelection(
  manifest: TemplateConfig,
  argvFeatures?: string[],
): Promise<string[]> {
  if (argvFeatures) return validateFeatureIds(argvFeatures, manifest);

  const entries = Object.entries(manifest.features);
  if (entries.length === 0) return [];

  const result = await p.multiselect({
    message: '选择功能特性',
    options: entries.map(([id, def]) => ({ value: id, label: def.label, hint: def.hint })),
    initialValues: entries.filter(([, def]) => def.default).map(([id]) => id),
    required: false,
  });
  if (p.isCancel(result)) onCancel();

  return result;
}

/** 步骤 5：后处理问答（git / install / packageManager） */
export async function collectPostOptions(options: CollectPostOptions = {}): Promise<PostOptions> {
  const initGit =
    options.initGit ??
    (await (async () => {
      const result = await p.confirm({ message: '初始化 Git 仓库？', initialValue: true });
      if (p.isCancel(result)) onCancel();
      return result;
    })());

  const installDeps =
    options.installDeps ??
    (await (async () => {
      const result = await p.confirm({ message: '自动安装依赖？', initialValue: true });
      if (p.isCancel(result)) onCancel();
      return result;
    })());

  // 不安装依赖时包管理器只影响提示文案，用默认值即可，少问一题
  let packageManager: PostOptions['packageManager'] = 'pnpm';
  if (installDeps) {
    const result = await p.select({
      message: '包管理器',
      options: [
        { value: 'pnpm' as const, label: 'pnpm', hint: 'recommended' },
        { value: 'npm' as const, label: 'npm' },
        { value: 'yarn' as const, label: 'yarn' },
      ],
    });
    if (p.isCancel(result)) onCancel();
    packageManager = result;
  }

  return { packageManager, initGit, installDeps };
}

export interface SummaryInput {
  name: string;
  templateLabel: string;
  platform: TemplateConfig['platform'];
  features: string[];
  manifest: TemplateConfig;
}

/** 渲染 summary 文本（特性显示为模板声明的 label） */
export function buildSummary(input: SummaryInput): string {
  const featureLabels = input.features.map((id) => input.manifest.features[id]?.label ?? id);

  return [
    `${pc.dim('项目名称')}  ${pc.cyan(input.name)}`,
    `${pc.dim('项目模版')}  ${input.templateLabel}`,
    `${pc.dim('平台')}      ${input.platform === 'web' ? 'Web 应用' : '移动端 H5'}`,
    `${pc.dim('特性')}      ${featureLabels.length > 0 ? featureLabels.join(', ') : '（未选择）'}`,
  ].join('\n');
}

/** 展示 summary 并要求确认，未确认直接退出；skipConfirm 时只展示不追问 */
export async function confirmSummary(input: SummaryInput, skipConfirm = false): Promise<void> {
  p.note(buildSummary(input), '配置确认');
  if (skipConfirm) return;

  const confirmed = await p.confirm({ message: '确认创建？', initialValue: true });
  if (p.isCancel(confirmed) || !confirmed) onCancel();
}
