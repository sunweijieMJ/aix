/**
 * @kit/publish 命令行入口：交互式菜单 / 命令行参数两种用法。
 */

import { Command, CommanderError } from 'commander';
import { c, logWarn } from './utils/logger';
import { isAbort, isInteractive, select } from './utils/prompts';
import * as semver from './core/semver';
import { validateTag } from './core/versioning';
import {
  ACTIONS,
  createContext,
  executeAction,
  selectableActions,
  type CliArgs,
} from './core/actions';

// ============ 命令行参数 ============

const buildProgram = (): Command => {
  const program = new Command();

  program
    .name('kit-publish')
    .description('把构建产物目录当作 npm 包发布到私有 registry 的交互式命令行工具')
    .option('-a, --action <action>', '操作类型，缺省进入交互式菜单')
    .option('-t, --tag <tag>', 'dist-tag（latest / beta / dev / oem ...），缺省交互选择')
    .option('-v, --version <ver>', '版本号，缺省根据该 tag 在 registry 上的现有版本给出候选')
    .option('-y, --yes', '跳过所有确认（取默认值），用于 CI', false)
    .option('-d, --dry-run', '走完整流程，但 npm publish 带 --dry-run，不真正发布', false)
    .option('--registry <url>', '覆盖 registry')
    .option(
      '--allow-unverified-dist',
      '允许复用一份无法确认来源的 dist（缺少 .build-meta.json）',
      false,
    )
    .option('--no-git-tag', '本次不打 git tag（默认发布成功后打，模板见配置 git.tag）')
    // 正反两个 option 一起定义才能得到「没传」这个第三态：只定义 --no-push-tag 的话
    // commander 会把默认值置为 true，配置里的 git.push: false 就被命令行顶掉了
    .option('--push-tag', '推送 git tag（覆盖配置 git.push）')
    .option('--no-push-tag', '不推送 git tag（覆盖配置 git.push）')
    // 不接受位置参数：`pub full`（漏了 -a）是最常见的手误，放行的话它会被静默吃掉、
    // 然后照旧走完整发布 —— 多余的参数必须让它报错
    .allowExcessArguments(false);

  // ACTIONS 是操作列表的唯一来源，帮助文本从它生成，不另抄一份
  program.addHelpText(
    'after',
    [
      '',
      '操作类型:',
      ...ACTIONS.filter((item) => item.value !== 'exit').map(
        (item) => `  ${item.value.padEnd(12)}${item.description}`,
      ),
      '',
      '示例:',
      '  kit-publish                        # 交互式菜单',
      '  kit-publish -a full -t beta        # 发 beta，版本号自动递增到下一个 beta',
      '  kit-publish -a full -t oem -v 1.8.4-oem.1 -y',
      '  kit-publish -a publish -t beta     # 复用现有 dist 重发',
      '  kit-publish -a preview -t beta     # 只看会发出什么，不实际发布',
      '  kit-publish -a full -t beta --no-git-tag   # 照常发布，但不打 git tag',
      '  kit-publish -a deprecate           # 废弃某个版本',
      '',
      '配置文件: 从当前目录逐级向上找 publish.config.ts（其所在目录即仓库根）',
      '',
    ].join('\n'),
  );

  return program;
};

const parseCliArgs = (argv: string[]): CliArgs => {
  const program = buildProgram();
  program.parse(argv);
  const values = program.opts<{
    action?: string;
    tag?: string;
    version?: string;
    yes: boolean;
    dryRun: boolean;
    registry?: string;
    allowUnverifiedDist: boolean;
    gitTag: boolean;
    pushTag?: boolean;
  }>();

  // 一律用 || undefined 收口：--registry "" 之类的空串既躲过下面的校验，
  // 又能顺着 ?? 传成 --registry=，让 npm 静默回落到 .npmrc，日志里的 registry 却是空的
  const args: CliArgs = {
    action: values.action?.trim() ?? '',
    tag: values.tag?.trim() || undefined,
    version: values.version?.trim() || undefined,
    skip: values.yes,
    dryRun: values.dryRun,
    registry: values.registry?.trim() || undefined,
    allowUnverifiedDist: values.allowUnverifiedDist,
    // 只定义了 --no-git-tag，commander 的默认值因此是 true —— 原样传下去会把配置里的
    // git.tag: false 顶掉。收成「显式关掉」与「没说」两种，后者交回配置决定
    gitTag: values.gitTag === false ? false : undefined,
    pushTag: typeof values.pushTag === 'boolean' ? values.pushTag : undefined,
  };

  // 命令行传入的值同样要过校验：交互输入有 validate，CLI 直传的不能是例外
  if (args.tag) {
    const tagError = validateTag(args.tag);
    if (tagError) throw new Error(tagError);
  }
  if (args.version && !semver.isValid(args.version)) {
    throw new Error(`版本号不合法: ${args.version}（需形如 2.0.20 或 2.0.20-beta.1）`);
  }
  if (args.registry && !/^https?:\/\/\S+$/.test(args.registry)) {
    throw new Error(`registry 不合法: ${args.registry}`);
  }
  if (args.gitTag === false && args.pushTag === true) {
    logWarn('未打 git tag，--push-tag 无效');
  }

  return args;
};

// ============ 交互菜单 ============

const showMenu = async (args: CliArgs): Promise<string> => {
  const { name } = await createContext(args);
  console.log(c.info('========================================'));
  console.log(c.info(`        ${name} 发包工具`));
  console.log(c.info('========================================'));
  return select(
    '请选择要执行的操作:',
    ACTIONS.map(({ name: label, value }) => ({ name: label, value })),
  );
};

// ============ 入口 ============

const main = async (): Promise<void> => {
  const args = parseCliArgs(process.argv);

  // 未显式指定操作时进入菜单；非交互环境（CI / 管道调用）必须显式指定，避免默默走进完整发布
  if (!args.action && (args.skip || !isInteractive())) {
    throw new Error(
      `非交互环境请显式指定操作，如 -a full -t beta（可选: ${selectableActions().join(' / ')}）`,
    );
  }
  const action = args.action || (await showMenu(args));
  await executeAction(action, args);
};

main().catch((error: unknown) => {
  // commander 自己处理 --help / 参数错误时会抛 CommanderError 并给出退出码，
  // 它已经把该说的话打完了，别再套一层「❌」
  if (error instanceof CommanderError) process.exit(error.exitCode);

  // Ctrl+C / Ctrl+D 下 @inquirer/prompts 抛 ExitPromptError，统一成中文取消提示
  const message = isAbort(error)
    ? '已取消'
    : error instanceof Error
      ? error.message
      : String(error);
  console.error(c.err(`\n❌ ${message}`));
  // 非预期的错误（TypeError 之类）只打一行 message 会把栈丢干净，调试时用 DEBUG=1 要回来
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
