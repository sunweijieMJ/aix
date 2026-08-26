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
//
// 但默认命令（create）与 `override add` 天然共用 -y / --force / --dry-run 三个名字，
// 没法靠改名回避。enablePositionalOptions() 让「子命令名之后的选项一律由子命令解析」，
// 否则 `create-app override add x -y` 里的 -y 会被根命令吃掉，
// 子命令只拿到根命令的默认值 false（表现为 -y 静默失效，仍然弹交互提示）。
const program = new Command()
  .name('create-app')
  .description('前端项目脚手架工具（含 Override 定制化管理）')
  .version(version)
  .option('--debug', '开启调试输出', false)
  .enablePositionalOptions();

// `--debug` 是根命令选项，但真正读它的是 utils/logger 的 handleError（读 process.env.DEBUG）。
// 用 preAction 钩子接线：钩子对默认命令与所有子命令都会触发，且早于 action。
// 注意 enablePositionalOptions() 下 `--debug` 必须写在子命令名之前。
program.hook('preAction', () => {
  if (program.opts()['debug']) process.env['DEBUG'] = '1';
});

// ── 默认命令：创建新项目 ──
program
  .argument('[project-name]', '项目名称（省略则交互输入）')
  .option('-d, --description <text>', '项目描述（省略则交互输入）')
  .option('-f, --features <list>', '特性列表（逗号分隔，取值由模板 config.ts 声明）')
  .option(
    '--template <id|source>',
    '模板注册表 id（如 admin），或直接的模板源（本地路径 / giget 格式）',
  )
  .option(
    '-p, --param <key=value>',
    '模板参数（可重复，取值域由模板 config.ts 的 params 声明）',
    (val: string, acc: string[]) => [...acc, val],
    [] as string[],
  )
  // git / install 都声明成「肯定式在前 + 否定式在后」的一对：
  // commander 只声明 `--no-git` 时默认值是 true，拿不到「用户没表态」这一态，
  // 于是非交互场景永远只能跳过 git / 安装（想装依赖也没有开关可传）。
  // 先声明 `--git` 后默认值变成 undefined，三态齐了：undefined 问答 / true 执行 / false 跳过。
  // （已验证 commander 15 的这一行为，顺序不能反）
  .option('--git', '初始化 Git 仓库（非交互场景用，等价于问答里选「是」）')
  .option('--no-git', '跳过 git init')
  .option('--install', '安装依赖（非交互场景需配合 --pm 指定包管理器）')
  .option('--no-install', '跳过依赖安装')
  .option('--pm <manager>', '包管理器（pnpm | npm | yarn），装依赖时省略则交互选择')
  // --offline / --force 不给默认值：resolver 要区分「没传」与「传了 false」——
  // 三态（都没传 = 复用缓存 / --force = 删缓存重取 / --offline = 只用缓存）靠 undefined 判定，
  // 给了默认 false 后 `options?.offline ?? !options?.force` 这类写法会永远走 false 分支
  .option('--offline', '仅使用本地模板缓存，不联网（缓存缺失直接失败）')
  .option('-y, --yes', '跳过最终确认提示', false)
  .option('--force', '强制覆盖已有目录（写入前清空，保留 .git），并重新拉取模板缓存')
  .option('--dry-run', '仅预览生成文件，不写入', false)
  .action(create);

// ── override 子命令组 ──
const overrideCmd = program.command('override').description('管理项目的 Override 定制化覆盖层');

overrideCmd
  .command('add [code]')
  .description('为新客户生成 Override 覆盖层目录和模板文件（TypeScript）')
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
