import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { isProjectRoot } from '../../utils/detector';

export interface OverrideListOptions {
  output: string;
}

export async function overrideList(opts: OverrideListOptions) {
  const cwd = process.cwd();

  if (!isProjectRoot(cwd)) {
    console.error(pc.red('❌ 未检测到 package.json，请在项目根目录执行'));
    process.exit(1);
  }

  const outputDir = path.resolve(cwd, opts.output);

  if (!fs.existsSync(outputDir)) {
    console.log(pc.yellow(`\n⚠️  Override 目录不存在：${opts.output}`));
    console.log(pc.dim(`   运行 ${pc.cyan('create-app override add <code>')} 创建第一个覆盖层\n`));
    return;
  }

  // 扫描 outputDir 下的直接子目录（即各项目覆盖层）
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  const projects = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (projects.length === 0) {
    console.log(pc.yellow(`\n⚠️  ${opts.output}/ 下暂无覆盖层项目`));
    console.log(pc.dim(`   运行 ${pc.cyan('create-app override add <code>')} 创建第一个覆盖层\n`));
    return;
  }

  console.log(pc.bold(`\n📦 Override 覆盖层列表 (${opts.output}/)\n`));

  for (const proj of projects) {
    const projDir = path.join(outputDir, proj);
    const modules = fs
      .readdirSync(projDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    const moduleList = modules.length > 0 ? pc.dim(` [${modules.join(', ')}]`) : '';
    console.log(`  ${pc.cyan('◆')} ${pc.bold(proj)}${moduleList}`);
  }

  console.log('');
}
