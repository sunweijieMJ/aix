import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { findTemplateById, loadTemplateRegistry } from '../config/defaults';
import { isGitSource } from '../core/git-source';
import { isLocalSource } from '../core/resolver';
import type { TemplateConfig } from '../types';
import { CreateAppError } from '../utils/errors';
import { validateProjectName } from '../utils/validate';

function onCancel(): never {
  p.cancel('已取消，未做任何修改。');
  // 非 TTY 下走到这里意味着「问答读不到输入」而非用户主动取消——exit 0 会把 CI 里的
  // 失败伪装成成功。命令层的非 TTY 体检是第一道防线（能列出缺失 flag），这里是兜底：
  // 体检清单与问答条件一旦漂移，至少还能非零退出
  process.exit(process.stdin.isTTY ? 0 : 1);
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
  /** dry-run 不写盘，跳过「目录已存在是否覆盖」这一问 */
  dryRun?: boolean;
}

export interface CollectPostOptions {
  /** `--git` / `--no-git` 已指定时跳过提问（undefined = 用户没表态，走问答） */
  initGit?: boolean;
  /** `--install` / `--no-install` 已指定时跳过提问 */
  installDeps?: boolean;
  /** `--pm` 已指定时跳过包管理器选择 */
  packageManager?: PostOptions['packageManager'];
}

/** 把 `--template` 的取值解释为注册表条目或裸模板源 */
export function resolveTemplateArg(
  template: string,
): Pick<BasicInfo, 'templateId' | 'templateLabel' | 'templateSource'> {
  const entry = findTemplateById(template);
  if (entry) {
    return { templateId: entry.id, templateLabel: entry.label, templateSource: entry.source };
  }
  // 长得像注册表 id（纯 kebab 短词，不含 / : 等源地址特征）却没命中，几乎必是拼错。
  // 不拦的话会一路落到 giget 分支，报出「拉取模板失败……请检查网络连接」——
  // 用户被支去查网络，而真正的问题是拼写
  if (!isLocalSource(template) && !isGitSource(template) && /^[a-z][a-z0-9-]*$/.test(template)) {
    const ids = loadTemplateRegistry().map((e) => e.id);
    throw new CreateAppError(
      'E_INVALID_OPTION',
      `未找到注册表 id "${template}"`,
      ids.length > 0
        ? `可用 id: ${ids.join(', ')}；如果传的是模板源，请用本地路径（./x、/abs/x）或 git 地址`
        : '注册表为空；如果传的是模板源，请用本地路径（./x、/abs/x）或 git 地址',
    );
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

  // 同名的普通文件（或非目录节点）是硬冲突，不是「清空后覆盖」能解决的：
  // 不拦的话会一路走到 emptyDir 的 readdirSync，吐一句没有错误码的裸 ENOTDIR
  if (fs.existsSync(targetDir) && !fs.statSync(targetDir).isDirectory()) {
    throw new CreateAppError(
      'E_DIR_WRITE_FAILED',
      `目标路径已存在且不是目录: ${targetDir}`,
      '请更换项目名，或先删除这个同名文件',
    );
  }

  // dry-run 不写盘，问「是否覆盖」纯属虚惊（还会在非交互下逼用户传 --force）
  if (fs.existsSync(targetDir) && !options.force && !options.dryRun) {
    const overwrite = await p.confirm({
      // 「覆盖」的真实语义是先清空再生成（保留 .git），措辞必须说破——
      // 只写“是否覆盖”会被理解成同名文件覆写，用户不知道无关文件也会被删
      message: `目录 ${pc.yellow(name)} 已存在，覆盖会先清空该目录（保留 .git），是否继续？`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) onCancel();
  }

  if (options.template) {
    return { name, description, ...resolveTemplateArg(options.template) };
  }

  const registry = loadTemplateRegistry();
  if (registry.length === 0) {
    throw new CreateAppError(
      'E_INVALID_USER_CONFIG',
      '没有可选的项目模版（内置注册表为空，且未登记用户级模板）',
      '用 --template <本地路径 | git 源> 直接指定模板，' +
        '或在 ~/.config/create-app/templates.json 里登记模板',
    );
  }

  const picked = await p.select({
    message: '项目模版',
    options: registry.map((entry) => ({
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

/**
 * 解析 `--param key=value`（可重复）为 Record；同 key 重复时后者覆盖前者
 *
 * @throws CreateAppError E_INVALID_PARAM 缺 `=` 或值为空
 */
export function parseParamArgs(raw: string[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of raw ?? []) {
    const i = item.indexOf('=');
    // key 或 value 空白都拒绝：`--param =x` / `--param key=` / `--param 'key=   '`
    // 多半是 shell 变量没赋值，放行只会把空串静默注进产物
    const value = i < 0 ? '' : item.slice(i + 1).trim();
    if (i <= 0 || value.length === 0) {
      throw new CreateAppError(
        'E_INVALID_PARAM',
        `--param 格式不合法: "${item}"`,
        '正确格式：--param key=value（可重复传多个），值不能为空',
      );
    }
    result[item.slice(0, i)] = value;
  }
  return result;
}

/**
 * 步骤 4.5：模板参数收集（声明来自 manifest.params）
 *
 * 取值优先级：`--param` > TTY 问答（default 为初始值）> default。
 * 非 TTY 下存在「没传 --param 且无 default」的参数时快速失败——此检查只能放在
 * 模板拉取之后（params 声明在模板里），但仍先于任何问答。
 */
export async function collectTemplateParams(
  manifest: TemplateConfig,
  argvParams: Record<string, string> = {},
): Promise<Record<string, string>> {
  const decls = Object.entries(manifest.params ?? {});
  const available = decls.map(([key]) => key);

  const unknown = Object.keys(argvParams).filter((key) => !available.includes(key));
  if (unknown.length > 0) {
    throw new CreateAppError(
      'E_INVALID_PARAM',
      `模板 ${manifest.id} 不存在参数: ${unknown.join(', ')}`,
      available.length > 0
        ? `可用参数: ${available.join(', ')}`
        : '该模板未声明任何参数，请去掉 --param',
    );
  }
  if (decls.length === 0) return {};

  if (!process.stdin.isTTY) {
    // 空白 default 等同于没有默认值：非 TTY 下直接采用会把空串注进产物
    const missing = decls.filter(
      ([key, def]) => argvParams[key] === undefined && !def.default?.trim(),
    );
    if (missing.length > 0) {
      throw new CreateAppError(
        'E_NON_INTERACTIVE',
        `当前不是交互式终端（stdin 非 TTY），以下模板参数无默认值、无法通过问答补齐：\n${missing
          .map(([key, def]) => `  - --param ${key}=<值>（${def.label}）`)
          .join('\n')}`,
        '非交互场景请为每个无默认值的参数显式传 --param key=value',
      );
    }
  }

  const resolved: Record<string, string> = {};
  for (const [key, def] of decls) {
    const fromArgv = argvParams[key];
    if (fromArgv !== undefined) {
      resolved[key] = fromArgv;
      continue;
    }
    if (!process.stdin.isTTY) {
      // 上方已保证此分支必有非空 default
      resolved[key] = def.default!.trim();
      continue;
    }
    const answer = await p.text({
      message: def.label,
      initialValue: def.default,
      validate: (value) => (value && value.trim().length > 0 ? undefined : '不能为空'),
    });
    if (p.isCancel(answer)) onCancel();
    resolved[key] = answer.trim();
  }
  return resolved;
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

  // 不安装依赖时包管理器只影响提示文案，用默认值即可，少问一题；
  // `--pm` 显式给了就不再问（否则非交互下 `--install` 会卡在这一问上）
  let packageManager: PostOptions['packageManager'] = options.packageManager ?? 'pnpm';
  if (installDeps && options.packageManager === undefined) {
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
  /** 模板参数的最终取值（可选：老调用方 / 无参数模板不传） */
  params?: Record<string, string>;
  manifest: TemplateConfig;
}

/** 渲染 summary 文本（特性显示为模板声明的 label，参数显示为「label: 值」） */
export function buildSummary(input: SummaryInput): string {
  const featureLabels = input.features.map((id) => input.manifest.features[id]?.label ?? id);
  const paramLines = Object.entries(input.params ?? {}).map(
    ([key, value]) =>
      `${pc.dim('参数')}      ${input.manifest.params?.[key]?.label ?? key}: ${pc.cyan(value)}`,
  );

  return [
    `${pc.dim('项目名称')}  ${pc.cyan(input.name)}`,
    `${pc.dim('项目模版')}  ${input.templateLabel}`,
    `${pc.dim('平台')}      ${input.platform === 'web' ? 'Web 应用' : '移动端 H5'}`,
    `${pc.dim('特性')}      ${featureLabels.length > 0 ? featureLabels.join(', ') : '（未选择）'}`,
    ...paramLines,
  ].join('\n');
}

/** 展示 summary 并要求确认，未确认直接退出；skipConfirm 时只展示不追问 */
export async function confirmSummary(input: SummaryInput, skipConfirm = false): Promise<void> {
  p.note(buildSummary(input), '配置确认');
  if (skipConfirm) return;

  const confirmed = await p.confirm({ message: '确认创建？', initialValue: true });
  if (p.isCancel(confirmed) || !confirmed) onCancel();
}
