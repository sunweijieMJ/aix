import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { ProjectConfig } from '../types';
import { CreateAppError } from '../utils/errors';

/** 在指定目录执行命令，将输出流到终端 */
function run(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new CreateAppError(
      'E_UNKNOWN',
      `命令执行失败: ${cmd} ${args.join(' ')} (exit ${result.status})`,
    );
  }
}

/**
 * 后处理：git init + 安装依赖
 *
 * 需要在 writeFiles 之后调用，destDir 为已写入文件的目标目录
 */
export async function runPostProcess(config: ProjectConfig, destDir: string): Promise<void> {
  if (config.initGit) {
    const spinner = p.spinner();
    spinner.start('初始化 Git 仓库...');
    try {
      run('git', ['init'], destDir);
      run('git', ['add', '-A'], destDir);
      run('git', ['commit', '-m', 'chore: 初始化项目'], destDir);
      spinner.stop('Git 仓库初始化完成');
    } catch {
      spinner.stop('Git 初始化失败（跳过）');
    }
  }

  if (config.installDeps) {
    const pm = config.packageManager;
    const spinner = p.spinner();
    spinner.start(`安装依赖 (${pm})...`);
    try {
      run(pm, ['install'], destDir);
      spinner.stop('依赖安装完成');
    } catch (err) {
      spinner.stop('依赖安装失败');
      throw new CreateAppError(
        'E_UNKNOWN',
        `${pm} install 执行失败`,
        '请手动进入项目目录后执行安装命令',
        err,
      );
    }
  }

  printNextSteps(config, destDir);
}

/**
 * 从产物 package.json 里挑启动脚本
 *
 * 不能写死 `dev`：admin 模板的启动脚本叫 `start`，照着提示敲会得到
 * 「Missing script: dev」。按常见命名依次找，都没有就退回 `dev`。
 */
function resolveDevScript(destDir: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(destDir, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    return ['dev', 'start', 'serve'].find((name) => pkg.scripts?.[name]) ?? 'dev';
  } catch {
    return 'dev';
  }
}

/**
 * 需要引号才能直接 `cd` 的路径加单引号
 *
 * 项目名按目录名规则校验（见 utils/validate），空格等 shell 元字符是合法的目录名，
 * 但照原样打印出来的 `cd my app` 是一条跑不通的命令。
 */
function shellQuote(value: string): string {
  return /^[\w@./-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

function printNextSteps(config: ProjectConfig, destDir: string): void {
  const rel = destDir.replace(process.cwd() + '/', '');
  const pm = config.packageManager;

  const steps = [
    `  ${pc.cyan('cd')} ${shellQuote(rel)}`,
    ...(!config.installDeps ? [`  ${pc.cyan(pm)} install`] : []),
    `  ${pc.cyan(pm)} run ${resolveDevScript(destDir)}`,
  ];

  p.outro(`${pc.green('项目创建成功！')} 接下来：\n\n${steps.join('\n')}\n`);
}
