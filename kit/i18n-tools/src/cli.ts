import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadConfig } from './config';
import type { ResolvedConfig } from './config';
import { createFrameworkAdapter } from './adapters';
import type { FrameworkAdapter } from './adapters';
import {
  AutomaticProcessor,
  CsvExportProcessor,
  CsvImportProcessor,
  DoctorProcessor,
  ExportProcessor,
  GenerateProcessor,
  GeneratePlanWriter,
  MergeProcessor,
  PickProcessor,
  PruneProcessor,
  RestoreProcessor,
  TranslateProcessor,
} from './core';
import {
  FileUtils,
  getToolVersion,
  InteractiveUtils,
  isModeExplicitlySet,
  loadEnv,
  LoggerUtils,
  MODE_DESCRIPTIONS,
  MODE_ICONS,
  MODE_LIST,
  ModeName,
} from './utils';

type FrameworkInfo = { extensions: string[]; displayName: string; libraryName: string };

/**
 * CLI 版本必须绑定工具包自身，不能让 yargs 从消费项目的 package.json 猜测。
 * 读不到时退化为 'unknown'：--version 显示不出来不该让整个 CLI 起不来。
 */
const TOOL_VERSION = getToolVersion() ?? 'unknown';

/**
 * 提取框架展示信息，避免 CLI 层直接耦合具体扩展名/展示名。
 *
 * adapter 必须由调用方传入（main 顶部统一构造一次）：在此就地 createFrameworkAdapter
 * 会在 GENERATE/RESTORE/AUTOMATIC 及顶部状态打印间反复构造整条策略链。
 */
const getFrameworkInfo = (adapter: FrameworkAdapter): FrameworkInfo => ({
  extensions: adapter.getSupportedExtensions(),
  displayName: adapter.getDisplayName(),
  libraryName: adapter.getLibraryName(),
});

/**
 * 解析「要处理的文件/目录路径」。统一三种入口的非交互化：
 *  1. 传了 --path：校验后直接使用（无效即 exit(1)，给出明确错误而非进入 prompt）；
 *  2. 未传 --path 且 interactive：回退到 inquirer 询问；
 *  3. 未传 --path 且非交互（显式 --mode / --ci / 无 TTY）：直接报错退出，
 *     避免在 CI / 管道里调到 inquirer 卡死或 EOF 崩溃。
 *
 * 这是「非交互 ⇒ 绝不碰 inquirer」规则在 generate / restore / automatic 三条
 * 路径上的落点（其余 prompt 早已包在 main 的 `if (interactive)` 内）。
 */
const resolveTargetPath = async (
  mode: ModeName,
  frameworkInfo: FrameworkInfo,
  pathArg: string | undefined,
  interactive: boolean,
): Promise<string> => {
  if (pathArg) {
    const validation = FileUtils.validateTargetPath(
      pathArg,
      frameworkInfo.extensions,
      frameworkInfo.displayName,
    );
    if (!validation.isValid) {
      LoggerUtils.error(`❌ --path 无效：${validation.error || '无效路径'}（${pathArg}）`);
      process.exit(1);
    }
    return pathArg;
  }
  if (interactive) {
    return InteractiveUtils.promptForPath(
      mode,
      frameworkInfo.extensions,
      frameworkInfo.displayName,
    );
  }
  const action = mode === ModeName.RESTORE ? '还原' : '提取国际化文本';
  LoggerUtils.error(
    `❌ 非交互模式下（--mode / --ci）需用 --path 指定要${action}的文件或目录路径，` +
      `例如：--path src/views/demo`,
  );
  process.exit(1);
};

/**
 * 执行generate操作（提取多语言组件）。
 * 返回 processor，便于 main 流程在执行后读取覆盖率指标判断 CI 阈值。
 *
 * dryRun 为 true 时不修改源码与语言文件，只在 `.i18n-tools/plans/` 下产 plan，
 * 用户 review 后用 `--apply-plan <path>` 回放即可正式落盘。
 *
 * 二次确认（GenerateProcessor 内部「是否继续分析这些文件？」）受 `interactive && !dryRun`
 * 双门控：dry-run 永不交互（无条件 transform 到内存再写 plan），非交互模式（--mode/--ci）
 * 也不再弹确认——否则在管道里第一个 path prompt 消费完 stdin 后，该确认会 EOF 崩溃。
 */
const executeGenerate = async (
  config: ResolvedConfig,
  adapter: FrameworkAdapter,
  isCustom: boolean,
  targetPath: string,
  interactive: boolean,
  skipLLM: boolean = false,
  dryRun: boolean = false,
  planOutputDir?: string,
): Promise<GenerateProcessor> => {
  const processor = new GenerateProcessor(config, isCustom, interactive && !dryRun, adapter);
  const resolvedPlanDir = planOutputDir ? path.resolve(process.cwd(), planOutputDir) : undefined;
  await processor.execute(targetPath, skipLLM, { dryRun, planOutputDir: resolvedPlanDir });
  return processor;
};

/**
 * 把用户传入的 --apply-plan 值解析为实际 plan.json 路径。
 *
 * 支持两种形态：
 *  - `"latest"`：查 `<rootDir>/.i18n-tools/plans/.last.json`，回退到目录扫描
 *  - 任意路径：可以是 plan 目录、plan.json 文件，或相对路径；统一规整为 plan.json 绝对路径
 *
 * 路径形态自动识别：传入目录时自动拼上 plan.json；这样用户可以从控制台粘贴
 * dry-run 完成时打印的目录路径直接用。
 */
const resolveApplyPlanPath = (config: ResolvedConfig, raw: string): string => {
  if (raw === 'latest') {
    const plansRoot = GeneratePlanWriter.getDefaultPlansRoot(config.root);
    const found = GeneratePlanWriter.resolveLatest(plansRoot);
    if (!found) {
      LoggerUtils.error(
        `❌ 在 ${plansRoot} 下找不到任何 plan。请先运行 \`generate --dry-run\` 生成。`,
      );
      process.exit(1);
    }
    LoggerUtils.info(`📂 latest 解析为：${found}`);
    return found;
  }

  const abs = path.resolve(process.cwd(), raw);
  // 用户传目录时自动拼 plan.json
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    return path.join(abs, GeneratePlanWriter.PLAN_FILENAME);
  }
  return abs;
};

/**
 * 从 plan 文件回放（apply-plan）。绕过 LLM 与 AST，直接按 plan 落盘。
 * 适用于"先 dry-run 看一眼、确认 OK 再正式提交"工作流。
 */
const executeApplyPlan = async (
  config: ResolvedConfig,
  adapter: FrameworkAdapter,
  isCustom: boolean,
  rawPlanPath: string,
  keepPlan: boolean,
  interactive: boolean,
): Promise<void> => {
  const planPath = resolveApplyPlanPath(config, rawPlanPath);
  // interactive 透传给 locale 漂移守卫：交互下漂移可逐条确认后继续，
  // 非交互（--mode/--ci 默认）下漂移一律拒绝并提示重跑 dry-run。
  const processor = new GenerateProcessor(config, isCustom, interactive, adapter);
  await processor.applyFromPlan(planPath, { keepPlan });
};

/**
 * 检查覆盖率阈值。覆盖率以「中文片段调用点」为单位计算，规则见
 * CoverageReporter.recordAndRender。阈值未设置或本次未跑 generate
 * （coverage 未填充）时直接返回。
 *
 * 命中阈值时仅打错并 exit(2)——区别于一般失败的 exit(1)：CI pipeline 可以
 * 据此专门挂"i18n 覆盖率不足"这一档警示，而不是把所有错误都归到一类。
 */
const enforceCoverageThreshold = (
  processor: { getCoverage(): { coverageRate: number } | undefined },
  threshold: number | undefined,
): void => {
  if (threshold === undefined) return;
  const coverage = processor.getCoverage();
  if (!coverage) return;
  const actualPct = coverage.coverageRate * 100;
  if (actualPct < threshold) {
    LoggerUtils.error(
      `❌ 国际化覆盖率 ${actualPct.toFixed(1)}% 低于阈值 ${threshold}%（--coverage-threshold）`,
    );
    process.exit(2);
  }
};

/**
 * 执行restore操作（还原多语言组件）。
 *
 * 默认写副本到 `<rootDir>/restored/`：还原是逐字面量的文本回填，无法区分「本工具生成的
 * t() 」与「用户自己手写的 t()」，就地改写会连同用户原有的国际化调用与 import 一起抹掉。
 * 因此就地改写必须由 `--overwrite` 显式 opt-in；`--dry-run` 则只在内存里跑一遍给出预览。
 */
const executeRestore = async (
  config: ResolvedConfig,
  adapter: FrameworkAdapter,
  isCustom: boolean,
  targetPath: string,
  opts: { overwrite: boolean; dryRun: boolean },
): Promise<void> => {
  const processor = new RestoreProcessor(config, isCustom, adapter);
  // outputDir 传 undefined：由 RestoreProcessor 回退到 `<rootDir>/restored/`，
  // 与它的「输出目录内文件自动排除」防套娃逻辑同源。
  await processor.execute([targetPath], undefined, opts.overwrite, { dryRun: opts.dryRun });
};

/**
 * 执行export操作（导出语言包）。
 * outputDir 来自 CLI --output（可选）：不传时 ExportProcessor 回退 io.exportDir，
 * 两者皆缺才报错——与其报错文案「或通过 CLI --output 显式指定」保持一致。
 */
const executeExport = async (config: ResolvedConfig, outputDir?: string): Promise<void> => {
  const processor = new ExportProcessor(config);
  await processor.execute(outputDir);
};

/**
 * 执行pick操作（生成待翻译文件）
 */
const executePick = async (config: ResolvedConfig, isCustom: boolean): Promise<void> => {
  const processor = new PickProcessor(config, isCustom);
  await processor.execute();
};

/**
 * 执行translate操作（翻译待翻译文件）
 */
const executeTranslate = async (config: ResolvedConfig, isCustom: boolean): Promise<void> => {
  const processor = new TranslateProcessor(config, isCustom);
  await processor.execute();
};

/**
 * 执行merge操作（合并翻译文件）
 */
const executeMerge = async (config: ResolvedConfig, isCustom: boolean): Promise<void> => {
  const processor = new MergeProcessor(config, isCustom);
  await processor.execute();
};

/**
 * 执行 doctor 体检：locale 结构 + 源码对账。
 * ci 模式下若发现 error 级问题，processor 内部会抛错，main 流程会以非零退出。
 */
const executeDoctor = async (
  config: ResolvedConfig,
  adapter: FrameworkAdapter,
  isCustom: boolean,
  ci: boolean,
): Promise<void> => {
  const processor = new DoctorProcessor(config, isCustom, adapter, { ci });
  await processor.execute();
};

/**
 * 执行 prune：删除源码已不再引用的孤儿 key。
 */
const executePrune = async (
  config: ResolvedConfig,
  adapter: FrameworkAdapter,
  isCustom: boolean,
  opts: { dryRun: boolean; ci: boolean; interactive: boolean },
): Promise<void> => {
  const processor = new PruneProcessor(config, isCustom, adapter, opts);
  await processor.execute();
};

/**
 * 执行 csv-export：把 untranslated.json / translations.json 导出为 CSV。
 */
const executeCsvExport = async (
  config: ResolvedConfig,
  isCustom: boolean,
  opts: {
    source: 'untranslated' | 'translations';
    filter: 'all' | 'untranslated' | 'translated';
    langs?: string[];
    output?: string;
  },
): Promise<void> => {
  const processor = new CsvExportProcessor(config, isCustom, opts);
  await processor.execute();
};

/**
 * 执行 csv-import：把 CSV 回流写回 untranslated.json / translations.json（按 key 实际归属自动路由）。
 */
const executeCsvImport = async (
  config: ResolvedConfig,
  isCustom: boolean,
  opts: { input: string; langs?: string[]; dryRun: boolean; ci: boolean; interactive: boolean },
): Promise<void> => {
  const processor = new CsvImportProcessor(config, isCustom, opts);
  await processor.execute();
};

/**
 * 主函数 - 程序入口点
 */
const main = async (): Promise<void> => {
  loadEnv();

  const yargsObj = yargs(hideBin(process.argv))
    .scriptName('i18n-tools')
    .version(TOOL_VERSION)
    .usage(
      `🌐 国际化工具集 - 自动化多语言处理

${MODE_LIST.map((mode) => `${MODE_ICONS[mode]} ${mode} - ${MODE_DESCRIPTIONS[mode]}`).join('\n')}

使用方式: $0 [选项]`,
    )
    .option('config', {
      describe: '配置文件路径',
      type: 'string',
    })
    .option('mode', {
      alias: 'm',
      describe: '操作模式',
      choices: MODE_LIST,
      default: ModeName.GENERATE,
    })
    .option('custom', {
      alias: 'c',
      describe: '是否操作定制目录的翻译文件',
      type: 'boolean',
      default: false,
    })
    .option('path', {
      alias: 'p',
      describe:
        '要处理的文件或目录路径（generate / restore / automatic）。' +
        '非交互模式（--mode / --ci）下必填，避免在 CI / 管道里调起交互式路径询问',
      type: 'string',
    })
    .option('interactive', {
      alias: 'i',
      describe: '交互式选择操作选项（未指定 --mode 时默认开启）',
      type: 'boolean',
    })
    .option('skip-llm', {
      describe:
        '不调用 LLM：generate 改用本地 ID 生成策略，automatic 一并跳过 translate 步骤' +
        '（translate 模式为显式要求翻译，不受此选项影响）',
      type: 'boolean',
      default: false,
    })
    .option('coverage-threshold', {
      describe: 'generate 完成后若覆盖率低于该百分比（0-100）则以非零状态码退出，用于 CI 卡点',
      type: 'number',
    })
    .option('dry-run', {
      describe:
        '预览模式，不落盘：generate 只生成 plan 文件到 .i18n-tools/plans/；' +
        'restore / csv-import / prune 只报告将发生的改动',
      type: 'boolean',
      default: false,
    })
    .option('overwrite', {
      describe:
        'restore：就地改写源文件（默认写副本到 <rootDir>/restored/）。' +
        '还原无法区分工具生成与用户手写的 t()，就地改写需显式 opt-in',
      type: 'boolean',
      default: false,
    })
    .option('apply-plan', {
      describe:
        '从指定的 plan 文件回放：跳过 LLM 与 AST 解析，直接按 plan 落盘。' +
        '传入 "latest" 自动解析为最近一次 dry-run 生成的 plan（仅 generate 模式生效）',
      type: 'string',
    })
    .option('keep-plan', {
      describe: 'apply 成功后保留 plan 目录（默认会自动清理）',
      type: 'boolean',
      default: false,
    })
    .option('plan-output-dir', {
      describe:
        'dry-run 时 plan 的输出根目录（默认 <rootDir>/.i18n-tools/plans/）。' +
        '用于规避 Windows MAX_PATH 等深路径风险，传入后会在该目录下创建 generate-<ts>-<pid>/',
      type: 'string',
    })
    .option('ci', {
      describe:
        'CI 模式（非交互）：doctor 发现 error 级问题时以非零状态码退出；' +
        'prune / csv-import 跳过破坏性写入前的二次确认，直接执行' +
        '（非交互模式下这两个命令必须显式传 --ci 才会执行破坏性写入，否则报错退出）',
      type: 'boolean',
      default: false,
    })
    .option('langs', {
      describe: 'CSV：限定目标语言（逗号分隔，如 en-US,ja-JP）；不传则全部 target',
      type: 'string',
    })
    .option('filter', {
      describe: 'csv-export：按所选语言列过滤行（判据 isValidTranslation）',
      choices: ['all', 'untranslated', 'translated'] as const,
      default: 'all',
    })
    .option('source', {
      describe: 'csv-export：数据源',
      choices: ['untranslated', 'translations'] as const,
      default: 'untranslated',
    })
    .option('output', {
      // 不放进「CSV 选项」组：export 模式同样消费它（覆盖 io.exportDir），归到 CSV 组会让
      // 只跑 export 的用户翻遍帮助也找不到怎么改输出目录。
      describe:
        '输出位置。export：语言包输出目录（覆盖 io.exportDir）；' +
        'csv-export：CSV 输出路径或目录；csv-import：输入的 CSV 文件路径',
      type: 'string',
    })
    .help()
    .alias('help', 'h')
    .group(['config', 'mode', 'custom', 'path', 'output'], '📋 基本选项:')
    .group(['interactive', 'skip-llm', 'overwrite'], '⚙️  高级选项:')
    .group(['langs', 'filter', 'source'], '📊 CSV 选项:')
    .group(
      ['dry-run', 'apply-plan', 'keep-plan', 'plan-output-dir', 'coverage-threshold', 'ci'],
      '🩺 CI / Review 选项:',
    )
    .example('$0 --config ./i18n.config.ts', '指定配置文件')
    .example('$0 --mode generate', '扫描源码文件，提取中文并生成国际化调用')
    .example(
      '$0 --mode generate --path src/views/demo',
      '非交互：指定路径直接提取（CI / 管道可用）',
    )
    .example('$0 --mode generate --dry-run', 'Review 模式：生成 plan 但不修改源码')
    .example('$0 --mode generate --apply-plan latest', '回放最近一次 dry-run 生成的 plan')
    .example('$0 --mode generate --apply-plan ./plan.json --keep-plan', '回放并保留 plan 目录')
    .example('$0 --mode generate --coverage-threshold 95', 'CI 卡点：覆盖率不足 95% 则失败')
    .example('$0 --mode doctor', '体检 locale 文件健康度 + 源码对账')
    .example('$0 --mode doctor --ci', 'CI 模式：发现 error 即非零退出')
    .example('$0 --mode prune --dry-run', '预览将删除的孤儿 key，不改文件')
    .example('$0 --mode prune', '确认后从所有 locale 删除孤儿 key')
    .example('$0 --mode pick', '从国际化文件中提取未翻译的条目')
    .example('$0 --mode translate', '使用AI翻译服务翻译中文为英文')
    .example('$0 --mode merge --custom', '将定制目录的翻译结果合并回主文件')
    .example('$0 --mode export', '导出最终的多语言文件包')
    .example('$0 --mode csv-export --langs en-US', '导出 en-US 待翻条目为 CSV')
    .example(
      '$0 --mode csv-export --source translations --langs ja-JP',
      '导出 ja-JP 已翻条目供审核',
    )
    .example('$0 --mode csv-import --output ./i18n-en-US.csv', '把审核好的 CSV 回流写回')
    .example('$0 --mode csv-import --output ./x.csv --dry-run', '回流前仅预览改动')
    .example('$0 --mode restore --path src/views/demo', '还原为中文，副本写到 <rootDir>/restored/')
    .example('$0 --mode restore --path src/views/demo --dry-run', '预览将还原的调用与将清理的导入')
    .example(
      '$0 --mode restore --path src/views/demo --overwrite',
      '就地改写源文件（会一并还原用户手写的 t()，谨慎使用）',
    )
    .example('$0 -i', '启动交互式模式，逐步选择操作')
    .example('$0 --mode automatic', '启动全自动处理流程')
    .epilog(
      `💡 提示:
• 首次使用建议用交互模式: npx i18n-tools -i
• 完整工作流程: generate → pick → translate → merge → export
• 定制目录用于项目特定的国际化内容，与主目录分开管理
• 需要在项目根目录创建 i18n.config.ts 配置文件`,
    )
    // 未知 flag 必须硬失败：yargs 默认把 `--dry-runn` / `--overwite` 这类拼错当自由参数收下，
    // 命令照常执行、退出码 0——用户以为"预览"了，实际是一次真跑。strict 之后拼错即报错退出，
    // 前提是所有被 argv 读取的键都在上面 .option 声明过（否则合法用法会被误杀）。
    .strict();

  const argv = await yargsObj.parse();

  // 加载配置（将相对路径转为绝对路径）
  const configPath = argv.config ? path.resolve(process.cwd(), argv.config as string) : undefined;
  const config = await loadConfig(configPath);
  if (!config) {
    LoggerUtils.error(
      '❌ 无法加载配置文件。请在项目根目录创建 i18n.config.ts 或使用 --config 指定路径。',
    );
    LoggerUtils.info(`💡 示例配置:
import { defineConfig } from '@kit/i18n-tools';

export default defineConfig({
  root: __dirname,
  framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
  locales: { source: 'zh', targets: ['en'] },
  io: { localesDir: 'src/i18n', sourceDir: 'src' },
  llm: {
    shared: { apiKey: process.env.LLM_API_KEY, model: 'gpt-4o' },
  },
});`);
    // exitCode + return（而非 process.exit）：exit 会在 stdout 是管道时截断尚未 flush 的
    // 输出，用户拿不到刚打印的错误与示例配置。main 返回后进程自然带非零码退出。
    process.exitCode = 1;
    return;
  }

  // 初始化参数
  let mode = (argv.mode as ModeName) || ModeName.GENERATE;
  const hasCustomLocale = Boolean(config.io.customDir);
  const skipLLM = Boolean(argv.skipLlm);

  // 仅当配置了 io.customDir 时，--custom 才有意义；
  // EXPORT 模式按设计不区分主/定制目录，--custom 在该模式下静默忽略而非报错。
  // DOCTOR 模式只读，--custom 仅用来指示读哪个目录，未配置 customLocale 时即使
  // 传入也无害（读默认目录），故允许通过。
  if (
    argv.custom &&
    !hasCustomLocale &&
    argv.mode !== ModeName.EXPORT &&
    argv.mode !== ModeName.DOCTOR
  ) {
    LoggerUtils.error(
      '❌ 未配置 io.customDir，无法使用 --custom。请在 i18n.config 中显式配置定制目录后再启用此选项。',
    );
    process.exitCode = 1;
    return;
  }
  const custom = hasCustomLocale && Boolean(argv.custom);

  // 当显式指定了 --mode/-m 时，默认关闭交互模式；否则默认开启。
  // --ci 自述「非交互」，必须真正隐含非交互：否则 `i18n-tools --ci`（漏带 --mode）会在
  // 无 TTY 的 CI 里进入 promptForTopLevelMode 卡死/报错。-i 显式开启仍优先（用户主动要交互）。
  const modeExplicitlySet = isModeExplicitlySet(process.argv.slice(2));
  const interactive = argv.interactive ?? (!modeExplicitlySet && !argv.ci);

  // 交互模式处理
  if (interactive) {
    const topLevelChoice = await InteractiveUtils.promptForTopLevelMode();

    if (topLevelChoice === 'automatic') {
      mode = ModeName.AUTOMATIC;
    } else {
      mode = await InteractiveUtils.promptForMode(custom, mode);
    }

    const confirmed = await InteractiveUtils.promptForConfirmation(mode, custom, hasCustomLocale);
    if (!confirmed) {
      LoggerUtils.warn('操作已取消');
      process.exit(0);
    }
  }

  // export 模式不需要区分定制目录
  if (mode === ModeName.EXPORT && custom) {
    LoggerUtils.info('注意: export 模式会导出所有语言包，不区分主目录和定制目录');
  }

  // 一次性构造 adapter 并复用：避免在每个 mode 分支再 createFrameworkAdapter
  const adapter = createFrameworkAdapter(config);
  const frameworkInfo = getFrameworkInfo(adapter);

  // 输出操作信息
  LoggerUtils.info(`🎯 执行模式: ${mode} (${MODE_DESCRIPTIONS[mode]})`);
  if (hasCustomLocale) {
    const location = mode === ModeName.EXPORT ? '全局' : custom ? '定制目录' : '主目录';
    LoggerUtils.info(`📍 操作目录: ${location}`);
  }
  LoggerUtils.info(`⚡ 项目框架: ${config.framework.type} (${frameworkInfo.libraryName})`);

  // CLI 优先：用户传 --coverage-threshold 时覆盖 config.ci.coverageThreshold。
  // 这里必须显式校验 CLI 入参：yargs `type: 'number'` 对 `--coverage-threshold abc`
  // 会强转出 NaN，而 `NaN ?? x` 仍是 NaN（非 nullish），最终 `actualPct < NaN` 恒 false
  // → CI 门禁被静默关闭（拼错却得到假绿）；>100 则恒触发退出。config.ci.coverageThreshold
  // 已在 loader 里做过同样的 [0,100] + 有限数校验，CLI 入参同样需要做。
  const cliCoverageThreshold = argv['coverage-threshold'] as number | undefined;
  if (
    cliCoverageThreshold !== undefined &&
    (!Number.isFinite(cliCoverageThreshold) ||
      cliCoverageThreshold < 0 ||
      cliCoverageThreshold > 100)
  ) {
    LoggerUtils.error(
      `❌ --coverage-threshold 必须是 [0, 100] 区间的数字，实际收到: ${
        Number.isNaN(cliCoverageThreshold) ? '非数字（无法解析）' : cliCoverageThreshold
      }`,
    );
    process.exitCode = 1;
    return;
  }
  const coverageThreshold = cliCoverageThreshold ?? config.ci.coverageThreshold;
  const dryRun = Boolean(argv['dry-run']);
  const overwrite = Boolean(argv['overwrite']);
  const langsArg = argv['langs'] as string | undefined;
  const csvLangs = langsArg
    ? langsArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const csvFilter = argv['filter'] as 'all' | 'untranslated' | 'translated';
  const csvSource = argv['source'] as 'untranslated' | 'translations';
  const csvOutput = argv['output'] as string | undefined;
  const applyPlanPath = argv['apply-plan'] as string | undefined;
  const keepPlan = Boolean(argv['keep-plan']);
  const planOutputDir = argv['plan-output-dir'] as string | undefined;
  const pathArg = (argv['path'] as string | undefined)?.trim() || undefined;

  // dry-run 与 apply-plan 的「生效模式集合」不同，必须分开提示：
  //  - --dry-run 在 generate / restore / csv-import / prune 四种模式都被真正消费（各自有
  //    预览语义），仅在其余模式无意义；
  //  - --apply-plan 只有 generate 分支消费，其它模式（含 csv-import / prune）一律忽略。
  // 二者不得并入同一条件：合并后必然多算或少算一个模式，误用（如 `--apply-plan --mode
  // prune`）会被静默丢弃、连警告都没有，违背该守卫「写错命令即提示」的初衷。
  // 静默忽略本身比抛错更友好（兼容 automatic 串调 generate 的复杂场景），但要显式提示。
  if (
    dryRun &&
    mode !== ModeName.GENERATE &&
    mode !== ModeName.RESTORE &&
    mode !== ModeName.CSV_IMPORT &&
    mode !== ModeName.PRUNE
  ) {
    LoggerUtils.warn(
      `⚠️  --dry-run 仅在 --mode generate / restore / csv-import / prune 下生效，当前模式 ${mode}，将被忽略`,
    );
  }
  // `--mode translate` 是「就是要翻译」的显式请求，跳过它等于什么都不做；
  // 与其静默按 skipLLM 空转，不如照「仅 xx 模式生效」口径提示后照常翻译。
  if (skipLLM && mode === ModeName.TRANSLATE) {
    LoggerUtils.warn('⚠️  translate 模式忽略 --skip-llm：该模式本身就是显式要求调用 AI 翻译');
  }
  if (overwrite && mode !== ModeName.RESTORE) {
    LoggerUtils.warn(`⚠️  --overwrite 仅在 --mode restore 下生效，当前模式 ${mode}，将被忽略`);
  }
  if (applyPlanPath && mode !== ModeName.GENERATE) {
    LoggerUtils.warn(`⚠️  --apply-plan 仅在 --mode generate 下生效，当前模式 ${mode}，将被忽略`);
  }
  // 其余「只在特定模式/组合下被消费」的选项同样必须提示后再丢弃：静默忽略会让用户以为
  // 参数生效了（如 `--mode merge --path src/x` 看似限定了范围，实际全量跑）。
  if (keepPlan && !applyPlanPath) {
    LoggerUtils.warn(
      '⚠️  --keep-plan 仅在 --apply-plan 回放时生效，本次未传 --apply-plan，将被忽略',
    );
  }
  if (planOutputDir && !dryRun) {
    LoggerUtils.warn('⚠️  --plan-output-dir 仅在 --dry-run 下生效，本次未传 --dry-run，将被忽略');
  }
  if (langsArg && mode !== ModeName.CSV_EXPORT && mode !== ModeName.CSV_IMPORT) {
    LoggerUtils.warn(
      `⚠️  --langs 仅在 --mode csv-export / csv-import 下生效，当前模式 ${mode}，将被忽略`,
    );
  }
  // filter / source 有 yargs 默认值，只有偏离默认才说明用户显式传了。
  if (csvFilter !== 'all' && mode !== ModeName.CSV_EXPORT) {
    LoggerUtils.warn(`⚠️  --filter 仅在 --mode csv-export 下生效，当前模式 ${mode}，将被忽略`);
  }
  if (csvSource !== 'untranslated' && mode !== ModeName.CSV_EXPORT) {
    LoggerUtils.warn(`⚠️  --source 仅在 --mode csv-export 下生效，当前模式 ${mode}，将被忽略`);
  }
  if (
    pathArg &&
    mode !== ModeName.GENERATE &&
    mode !== ModeName.RESTORE &&
    mode !== ModeName.AUTOMATIC
  ) {
    LoggerUtils.warn(
      `⚠️  --path 仅在 --mode generate / restore / automatic 下生效，当前模式 ${mode}，将被忽略`,
    );
  }
  // translate 有单独的提示（上方）：它会照常翻译，语义与「被忽略」不同，故排除在外。
  if (
    skipLLM &&
    mode !== ModeName.GENERATE &&
    mode !== ModeName.AUTOMATIC &&
    mode !== ModeName.TRANSLATE
  ) {
    LoggerUtils.warn(
      `⚠️  --skip-llm 仅在 --mode generate / automatic / translate 下生效，当前模式 ${mode}，将被忽略`,
    );
  }
  if (dryRun && applyPlanPath) {
    LoggerUtils.error('❌ --dry-run 与 --apply-plan 互斥，请只指定其一');
    process.exitCode = 1;
    return;
  }

  try {
    switch (mode) {
      case ModeName.AUTOMATIC:
        {
          const targetPath = await resolveTargetPath(
            ModeName.AUTOMATIC,
            frameworkInfo,
            pathArg,
            interactive,
          );
          const auto = new AutomaticProcessor(config, custom, adapter);
          await auto.execute(targetPath, skipLLM);
          enforceCoverageThreshold(auto, coverageThreshold);
        }
        break;
      case ModeName.GENERATE: {
        if (applyPlanPath) {
          // apply-plan 仅回放 plan、不重算覆盖率，coverage 阈值在此路径恒不生效。
          // 显式告警，避免「配了 --coverage-threshold 却以为已卡点」的假绿。
          if (coverageThreshold !== undefined) {
            LoggerUtils.warn(
              `⚠️  --coverage-threshold（或 ci.coverageThreshold）在 --apply-plan 回放路径下不生效：\n` +
                `   apply 只回放已审核的 plan、不重新计算覆盖率。如需覆盖率卡点，请在直跑 generate 时设置阈值。`,
            );
          }
          await executeApplyPlan(config, adapter, custom, applyPlanPath, keepPlan, interactive);
          break;
        }
        const targetPath = await resolveTargetPath(
          ModeName.GENERATE,
          frameworkInfo,
          pathArg,
          interactive,
        );
        const generator = await executeGenerate(
          config,
          adapter,
          custom,
          targetPath,
          interactive,
          skipLLM,
          dryRun,
          planOutputDir,
        );
        // dry-run 不真正改动源码，coverage 阈值在此场景无意义（用户的目的是 review
        // 而非 CI 卡点）；commit 路径才检查
        if (!dryRun) enforceCoverageThreshold(generator, coverageThreshold);
        break;
      }
      case ModeName.PICK:
        await executePick(config, custom);
        break;
      case ModeName.TRANSLATE:
        await executeTranslate(config, custom);
        break;
      case ModeName.MERGE:
        await executeMerge(config, custom);
        break;
      case ModeName.EXPORT:
        await executeExport(config, csvOutput);
        break;
      case ModeName.RESTORE: {
        const targetPath = await resolveTargetPath(
          ModeName.RESTORE,
          frameworkInfo,
          pathArg,
          interactive,
        );
        await executeRestore(config, adapter, custom, targetPath, { overwrite, dryRun });
        break;
      }
      case ModeName.DOCTOR:
        await executeDoctor(config, adapter, custom, Boolean(argv.ci));
        break;
      case ModeName.PRUNE:
        // interactive 透传：非交互（--mode/--ci 推导）且未 --ci 时 prune 直接报错，
        // 绝不弹 inquirer 确认——stdin 常开管道下会无限挂起（「非交互 ⇒ 绝不碰 inquirer」）。
        await executePrune(config, adapter, custom, { dryRun, ci: Boolean(argv.ci), interactive });
        break;
      case ModeName.CSV_EXPORT:
        await executeCsvExport(config, custom, {
          source: csvSource,
          filter: csvFilter,
          langs: csvLangs,
          output: csvOutput,
        });
        break;
      case ModeName.CSV_IMPORT: {
        let importInput = csvOutput;
        if (!importInput) {
          if (interactive) {
            importInput = await InteractiveUtils.promptForCsvPath();
          } else {
            LoggerUtils.error('❌ csv-import 需要 --output 指定 CSV 文件路径');
            process.exitCode = 1;
            return;
          }
        }
        await executeCsvImport(config, custom, {
          input: importInput,
          langs: csvLangs,
          dryRun,
          ci: Boolean(argv.ci),
          // 同 PRUNE：非交互且未 --ci 时写回前报错退出，防 inquirer 挂起
          interactive,
        });
        break;
      }
      default: {
        // yargs 的 choices 已挡住未知值，走到这里只可能是新增模式漏了 case：
        // never 断言让编译期先报出来，运行期则以非零码退出而非「打条 error 后返回 0」。
        const unhandled: never = mode;
        LoggerUtils.error(`没有匹配的模式: ${String(unhandled)}`);
        process.exitCode = 1;
        return;
      }
    }
  } catch (error) {
    LoggerUtils.error(`执行 ${mode} 操作时发生错误:`, error);
    process.exit(1);
  }
};

main().catch((error) => {
  LoggerUtils.error('启动失败:', error);
  process.exit(1);
});
