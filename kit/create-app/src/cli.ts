import { createRequire } from 'node:module';
import { Command } from 'commander';
import { create } from './commands/create';
import { overrideAdd } from './commands/override/add';
import { overrideList } from './commands/override/list';
import { updateTemplates } from './commands/update-templates';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// 关键原则：根命令 program 不定义任何与子命令同名的选项
// （已验证：同名选项会导致 Commander 子命令拿到根命令的默认值）
const program = new Command()
  .name('create-app')
  .description('前端项目脚手架工具（含 Override 定制化管理）')
  .version(version)
  .option('--debug', '开启调试输出', false);

// ── 默认命令：创建新项目 ──
program
  .argument('[project-name]', '项目名称（省略则交互输入）')
  .option('--platform <web|mobile>', '目标平台')
  .option('--scenario <standard|admin>', '应用场景（web only）')
  .option('--qiankun <none|main|sub>', '微前端模式（web only）')
  .option('-f, --features <list>', '特性列表（逗号分隔，如 i18n,override）')
  .option('--template <source>', '自定义模板源（giget 格式，如 github:org/repo/subdir）')
  .option('--no-git', '跳过 git init')
  .option('--no-install', '跳过依赖安装')
  .option('--force', '强制覆盖已有目录', false)
  .option('--dry-run', '仅预览生成文件，不写入', false)
  .action(create);

// ── override 子命令组 ──
const overrideCmd = program.command('override').description('管理项目的 Override 定制化覆盖层');

overrideCmd
  .command('add [code]')
  .description('为新客户生成 Override 覆盖层目录和模板文件')
  .option('-l, --lang <ts|js>', '语言（ts/js）')
  .option('-m, --modules <list>', '定制模块（逗号分隔，如 router,store）')
  .option('-o, --output <dir>', '输出目录', 'src/overrides')
  .option('-y, --yes', '跳过确认提示', false)
  .option('--dry-run', '仅预览将生成的文件', false)
  .option('--force', '强制覆盖已有文件', false)
  .action(overrideAdd);

overrideCmd
  .command('list')
  .description('列出当前项目所有 Override 覆盖层')
  .option('-o, --output <dir>', '输出目录', 'src/overrides')
  .action(overrideList);

// ── 缓存管理 ──
program
  .command('update-templates')
  .description('强制刷新模板缓存（从远端重新下载）')
  .action(updateTemplates);

program.parse();
