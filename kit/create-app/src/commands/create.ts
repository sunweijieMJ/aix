import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { Composer } from '../core/composer';
import { runPostProcess } from '../core/post-processor';
import { TemplateResolver } from '../core/resolver';
import { DEFAULT_TEMPLATES } from '../config/defaults';
import { collectProjectConfig } from '../prompts/index';
import type { FeatureId, Platform, QiankunMode, WebScenario } from '../types';
import { writeFiles } from '../utils/fs';
import { handleError } from '../utils/logger';

const require = createRequire(import.meta.url);

export interface CreateOptions {
  platform?: string;
  scenario?: string;
  qiankun?: string;
  features?: string;
  ui?: string;
  noGit?: boolean;
  noInstall?: boolean;
  force?: boolean;
  dryRun?: boolean;
  template?: string;
}

export async function create(projectName: string | undefined, opts: CreateOptions): Promise<void> {
  try {
    // 获取 CLI 版本号
    const { version } = require('../../package.json') as { version: string };

    // 收集用户配置
    const config = await collectProjectConfig({
      argv: {
        name: projectName,
        platform: opts.platform as Platform | undefined,
        scenario: opts.scenario as WebScenario | undefined,
        qiankun: opts.qiankun as QiankunMode | undefined,
        features: opts.features?.split(',').map((s) => s.trim()) as FeatureId[] | undefined,
        force: opts.force,
      },
    });

    // 覆盖后处理选项（来自命令行标志）
    if (opts.noGit) config.initGit = false;
    if (opts.noInstall) config.installDeps = false;

    // 确定模板源
    const templateSource = opts.template ?? DEFAULT_TEMPLATES[config.platform].source;

    // 拉取模板
    const resolver = new TemplateResolver();
    const spinner = p.spinner();
    spinner.start('拉取项目模板...');

    let templateDir: string;
    try {
      templateDir = await resolver.fetch(templateSource, { force: opts.force });
      spinner.stop('模板准备就绪');
    } catch (err) {
      spinner.stop('模板拉取失败');
      throw err;
    }

    // 读取并验证模板配置
    const manifest = await resolver.readConfig(templateDir);
    resolver.checkCompat(manifest, version);

    // 组合文件列表
    const composer = new Composer();
    const fileList = await composer.compose(templateDir, manifest, config);

    if (opts.dryRun) {
      p.log.info('Dry-run 模式，将生成以下文件：');
      for (const f of fileList) {
        console.log(`  ${pc.dim(f.path)}`);
      }
      p.outro('Dry-run 完成，未写入任何文件。');
      return;
    }

    // 确保目标目录存在
    const destDir = config.outputDir;
    if (fs.existsSync(destDir) && !opts.force) {
      const files = fs.readdirSync(destDir);
      if (files.length > 0) {
        const overwrite = await p.confirm({
          message: `目录 ${pc.yellow(path.basename(destDir))} 已有内容，是否覆盖？`,
          initialValue: false,
        });
        if (p.isCancel(overwrite) || !overwrite) {
          p.cancel('已取消');
          process.exit(0);
        }
      }
    }

    // 写入文件
    const writeSpinner = p.spinner();
    writeSpinner.start('写入项目文件...');
    writeFiles(fileList, destDir);
    writeSpinner.stop(`已写入 ${fileList.length} 个文件`);

    // 后处理（git init + 安装依赖）
    await runPostProcess(config, destDir);
  } catch (err) {
    handleError(err);
  }
}
