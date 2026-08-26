import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { Composer } from '../core/composer';
import { lintManifest } from '../core/manifest-lint';
import { runPostProcess } from '../core/post-processor';
import { TemplateResolver } from '../core/resolver';
import {
  collectBasicInfo,
  collectFeatureSelection,
  collectPostOptions,
  collectTemplateParams,
  confirmSummary,
  parseParamArgs,
} from '../prompts/index';
import type { ProjectConfig } from '../types';
import { CreateAppError } from '../utils/errors';
import { emptyDir, writeFiles } from '../utils/fs';
import { handleError } from '../utils/logger';
import { readCliVersion } from '../utils/pkg-root';

export interface CreateOptions {
  description?: string;
  features?: string;
  /** `--param key=value` 可重复，commander 累积为数组 */
  param?: string[];
  /**
   * git / install 是三态：undefined = 用户没表态（走问答）、true = `--git` / `--install`、
   * false = `--no-git` / `--no-install`。commander 对 `--no-git` 生成的是 git=false，而非 noGit
   */
  git?: boolean;
  install?: boolean;
  /** `--pm`：装依赖时的包管理器，省略则交互选择（非交互 + 装依赖时必填） */
  pm?: string;
  force?: boolean;
  offline?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  template?: string;
}

const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn'] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** 校验 `--pm` 取值；未传返回 undefined（表示仍需问答） */
function parsePackageManager(raw: string | undefined): PackageManager | undefined {
  if (raw === undefined) return undefined;
  const pm = raw.trim();
  if (!(PACKAGE_MANAGERS as readonly string[]).includes(pm)) {
    throw new CreateAppError(
      'E_INVALID_OPTION',
      `--pm 取值不合法: "${raw}"`,
      `可选值：${PACKAGE_MANAGERS.join(' | ')}`,
    );
  }
  return pm as PackageManager;
}

/** `--features a,b` → ['a','b']；`--features ''` → []；未传 → undefined */
function parseFeatures(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 列出「本次运行还要靠问答补齐」的选项
 *
 * 非 TTY 下（CI / 管道 / `< /dev/null`）@clack 的问答读不到输入，会走 isCancel 分支被
 * onCancel() 以 exit 0 静默吞掉——调用方看到的是「命令成功但没有产物」。所以在任何
 * 问答之前先把缺口算出来，缺任意一项就快速失败并列出要补的 flag。
 *
 * 导出仅为便于测试；判定必须与 prompts/index.ts 的问答条件逐条对应。
 */
export function missingNonInteractiveFlags(
  projectName: string | undefined,
  opts: CreateOptions,
): string[] {
  const missing: string[] = [];

  // collectBasicInfo
  if (!projectName) missing.push('<project-name>（项目名称）');
  if (opts.description === undefined) missing.push('-d, --description <text>');
  // 空串也算缺失：collectBasicInfo 对 template 走 truthy 判断，`--template ''`
  // （典型来源是未赋值的 shell 变量插值）会落进模板选择问答
  if (!opts.template) missing.push('--template <id|source>');
  // 目标目录已存在时会弹「是否覆盖」确认，只有 --force 能跳过。
  // dry-run 不写盘、压根不会问这一句，别让一个只读预览被迫去传最危险的那个 flag
  if (
    projectName &&
    !opts.force &&
    !opts.dryRun &&
    fs.existsSync(path.resolve(process.cwd(), projectName))
  ) {
    missing.push(`--force（目录 ${projectName} 已存在，否则会弹覆盖确认）`);
  }

  // collectFeatureSelection
  if (opts.features === undefined) missing.push('-f, --features <list>');

  // collectTemplateParams 不在此预判：params 声明在模板 config.ts 里，此时模板还没拉取。
  // 无默认值且没传 --param 的参数由 collectTemplateParams 在问答前补一道非 TTY 快速失败

  // collectPostOptions + confirmSummary：dry-run 会整段跳过
  if (!opts.dryRun) {
    // 三态：没表态才需要补 flag（`--git` / `--install` 也算表态，不再强制只能跳过）
    if (opts.git === undefined) missing.push('--git 或 --no-git');
    if (opts.install === undefined) missing.push('--install 或 --no-install');
    // 装依赖时还要选包管理器：只传 `--install` 仍会落进「包管理器」那一问
    if (opts.install === true && opts.pm === undefined) {
      missing.push('--pm <pnpm|npm|yarn>（--install 时必填）');
    }
    if (!opts.yes) missing.push('-y, --yes');
  }

  return missing;
}

/** 非 TTY 且仍需交互时快速失败（TTY 下不做任何限制） */
function assertNonInteractiveReady(projectName: string | undefined, opts: CreateOptions): void {
  if (process.stdin.isTTY) return;

  const missing = missingNonInteractiveFlags(projectName, opts);
  if (missing.length === 0) return;

  throw new CreateAppError(
    'E_NON_INTERACTIVE',
    `当前不是交互式终端（stdin 非 TTY），但以下选项缺失、无法通过问答补齐：\n${missing
      .map((m) => `  - ${m}`)
      .join('\n')}`,
    '非交互场景请补齐全部参数，例如：\n' +
      '  create-app <name> --template admin -d "<描述>" -f i18n -y --no-git --no-install\n' +
      '  create-app <name> --template admin -d "<描述>" -f i18n -y --git --install --pm pnpm',
  );
}

export async function create(projectName: string | undefined, opts: CreateOptions): Promise<void> {
  try {
    // 任何问答之前先做非 TTY 体检，避免 onCancel() 的 exit 0 把 CI 里的失败伪装成成功
    assertNonInteractiveReady(projectName, opts);

    // --param 的语法校验不依赖模板，提前到问答与 clone 之前：
    // 放在步骤 4.5 的话，一个漏写的 `=` 要等用户答完问答、克隆完仓库才报出来
    const argvParams = parseParamArgs(opts.param);
    // --pm 同理：取值错了不该等到问答与克隆之后才报
    const argvPm = parsePackageManager(opts.pm);

    // 获取 CLI 版本号（运行时向上找包根，兼容 tsx 源码运行与 tsdown 打包后的 dist/）
    const version = readCliVersion(import.meta.url);

    // ── 步骤 1-2：基本信息 + 模板选择（目录冲突检查也在此完成）──
    const basic = await collectBasicInfo({
      name: projectName,
      description: opts.description,
      template: opts.template,
      force: opts.force,
      dryRun: opts.dryRun,
    });

    // ── 步骤 3：拉取/定位模板并校验兼容性 ──
    const resolver = new TemplateResolver();
    const spinner = p.spinner();
    spinner.start('拉取项目模板...');

    let templateDir: string;
    try {
      templateDir = await resolver.fetch(basic.templateSource, {
        force: opts.force,
        offline: opts.offline,
      });
      spinner.stop('模板准备就绪');
    } catch (err) {
      spinner.stop('模板拉取失败');
      throw err;
    }

    const manifest = await resolver.readConfig(templateDir);
    resolver.checkCompat(manifest, version);

    // 清单体检：路径腐化直接抛错，其余以警告呈现（不阻断生成）
    for (const warning of lintManifest(templateDir, manifest)) {
      p.log.warn(warning);
    }

    // ── 步骤 4：模板元数据驱动的特性选择 ──
    const features = await collectFeatureSelection(manifest, parseFeatures(opts.features));

    // ── 步骤 4.5：模板参数（--param / 问答 / default）──
    const params = await collectTemplateParams(manifest, argvParams);

    // ── 步骤 5：后处理问答 + summary 确认（dry-run 无副作用，直接跳过）──
    const post = opts.dryRun
      ? { packageManager: 'pnpm' as const, initGit: false, installDeps: false }
      : await collectPostOptions({
          // 三态直传：undefined 才问，true / false 都是用户已表态
          initGit: opts.git,
          installDeps: opts.install,
          packageManager: argvPm,
        });

    const config: ProjectConfig = {
      name: basic.name,
      description: basic.description,
      // platform 不再问答，直接取模板声明
      platform: manifest.platform,
      templateId: basic.templateId,
      features,
      params,
      outputDir: path.resolve(process.cwd(), basic.name),
      ...post,
    };

    if (!opts.dryRun) {
      await confirmSummary(
        {
          name: config.name,
          templateLabel: basic.templateLabel,
          platform: config.platform,
          features,
          params,
          manifest,
        },
        opts.yes,
      );
    }

    // 组合文件列表
    const composer = new Composer();
    const fileList = await composer.compose(templateDir, manifest, config);

    if (opts.dryRun) {
      p.log.info('Dry-run 模式，将生成以下文件：');
      for (const f of fileList) {
        console.log(`  ${pc.dim(f.path)}`);
      }
      p.outro(`Dry-run 完成，共 ${fileList.length} 个文件，未写入任何内容。`);
      return;
    }

    // 目录冲突已在 collectBasicInfo 里确认过（用户点了覆盖，或 --force）。
    // 写入前先清空目标目录：不清空的话是「合并写入」，旧文件残留成混合态产物
    const destDir = config.outputDir;
    const writeSpinner = p.spinner();
    writeSpinner.start('写入项目文件...');
    emptyDir(destDir);
    writeFiles(fileList, destDir);
    writeSpinner.stop(`已写入 ${fileList.length} 个文件`);

    // 后处理（git init + 安装依赖）
    await runPostProcess(config, destDir);
  } catch (err) {
    handleError(err);
  }
}
