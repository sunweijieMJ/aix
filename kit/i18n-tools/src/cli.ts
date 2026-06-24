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
  RestoreProcessor,
  TranslateProcessor,
} from './core';
import {
  InteractiveUtils,
  isModeExplicitlySet,
  loadEnv,
  LoggerUtils,
  MODE_DESCRIPTIONS,
  ModeName,
} from './utils';

type FrameworkInfo = { extensions: string[]; displayName: string; libraryName: string };

/**
 * 提取框架展示信息，避免 CLI 层直接耦合具体扩展名/展示名。
 *
 * Why: 此函数原本每次调用都 `createFrameworkAdapter(config)`，在 GENERATE/RESTORE/AUTOMATIC
 *      及顶部状态打印间被反复构造（含全部策略链 importManager/transformer 等）。
 *      改为接受外部预构造的 adapter，由 main 顶部统一构造一次。
 */
const getFrameworkInfo = (adapter: ReturnType<typeof createFrameworkAdapter>): FrameworkInfo => ({
  extensions: adapter.getSupportedExtensions(),
  displayName: adapter.getDisplayName(),
  libraryName: adapter.getLibraryName(),
});

/**
 * 执行generate操作（提取多语言组件）。
 * 返回 processor，便于 main 流程在执行后读取覆盖率指标判断 CI 阈值。
 *
 * dryRun 为 true 时不修改源码与语言文件，只在 `.i18n-tools/plans/` 下产 plan，
 * 用户 review 后用 `--apply-plan <path>` 回放即可正式落盘。
 */
const executeGenerate = async (
  config: ResolvedConfig,
  frameworkInfo: FrameworkInfo,
  adapter: FrameworkAdapter,
  isCustom: boolean,
  skipLLM: boolean = false,
  dryRun: boolean = false,
  planOutputDir?: string,
): Promise<GenerateProcessor> => {
  const targetPath = await InteractiveUtils.promptForPath(
    ModeName.GENERATE,
    frameworkInfo.extensions,
    frameworkInfo.displayName,
  );
  // dry-run 模式下 interactive=false：避免在 prompt 询问"是否应用转换"时
  // 让用户误以为这会真的落盘——dry-run 总是无条件 transform 到内存再写 plan。
  const processor = new GenerateProcessor(config, isCustom, !dryRun, adapter);
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
): Promise<void> => {
  const planPath = resolveApplyPlanPath(config, rawPlanPath);
  const processor = new GenerateProcessor(config, isCustom, false, adapter);
  await processor.applyFromPlan(planPath, { keepPlan });
};

/**
 * 检查覆盖率阈值。覆盖率以「中文片段调用点」为单位计算，规则见
 * GenerateProcessor.recordAndRenderCoverage。阈值未设置或本次未跑 generate
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
 * 执行restore操作（还原多语言组件）
 */
const executeRestore = async (
  config: ResolvedConfig,
  frameworkInfo: FrameworkInfo,
  adapter: FrameworkAdapter,
  isCustom: boolean,
): Promise<void> => {
  const targetPath = await InteractiveUtils.promptForPath(
    ModeName.RESTORE,
    frameworkInfo.extensions,
    frameworkInfo.displayName,
  );
  const processor = new RestoreProcessor(config, isCustom, adapter);
  await processor.execute([targetPath], path.dirname(targetPath), true);
};

/**
 * 执行export操作（导出语言包）
 */
const executeExport = async (config: ResolvedConfig): Promise<void> => {
  const processor = new ExportProcessor(config);
  await processor.execute();
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
 * 执行 csv-import：把 CSV 回流写回 untranslated.json。
 */
const executeCsvImport = async (
  config: ResolvedConfig,
  isCustom: boolean,
  opts: { input: string; langs?: string[]; dryRun: boolean; ci: boolean },
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
    .usage(
      `🌐 国际化工具集 - 自动化多语言处理

🚀 ${ModeName.AUTOMATIC} - ${MODE_DESCRIPTIONS[ModeName.AUTOMATIC]}
📝 ${ModeName.GENERATE} - ${MODE_DESCRIPTIONS[ModeName.GENERATE]}
📤 ${ModeName.PICK} - ${MODE_DESCRIPTIONS[ModeName.PICK]}
🤖 ${ModeName.TRANSLATE} - ${MODE_DESCRIPTIONS[ModeName.TRANSLATE]}
📥 ${ModeName.MERGE} - ${MODE_DESCRIPTIONS[ModeName.MERGE]}
🔄 ${ModeName.RESTORE} - ${MODE_DESCRIPTIONS[ModeName.RESTORE]}
📦 ${ModeName.EXPORT} - ${MODE_DESCRIPTIONS[ModeName.EXPORT]}
🩺 ${ModeName.DOCTOR} - ${MODE_DESCRIPTIONS[ModeName.DOCTOR]}

使用方式: $0 [选项]`,
    )
    .option('config', {
      describe: '配置文件路径',
      type: 'string',
    })
    .option('mode', {
      alias: 'm',
      describe: '操作模式',
      choices: [
        ModeName.AUTOMATIC,
        ModeName.GENERATE,
        ModeName.PICK,
        ModeName.TRANSLATE,
        ModeName.MERGE,
        ModeName.EXPORT,
        ModeName.RESTORE,
        ModeName.DOCTOR,
        ModeName.CSV_EXPORT,
        ModeName.CSV_IMPORT,
      ] as const,
      default: ModeName.GENERATE,
    })
    .option('custom', {
      alias: 'c',
      describe: '是否操作定制目录的翻译文件',
      type: 'boolean',
      default: false,
    })
    .option('interactive', {
      alias: 'i',
      describe: '交互式选择操作选项（未指定 --mode 时默认开启）',
      type: 'boolean',
    })
    .option('skip-llm', {
      describe: '跳过LLM API调用，使用本地ID生成策略',
      type: 'boolean',
      default: false,
    })
    .option('coverage-threshold', {
      describe: 'generate 完成后若覆盖率低于该百分比（0-100）则以非零状态码退出，用于 CI 卡点',
      type: 'number',
    })
    .option('dry-run', {
      describe:
        '只生成 plan 文件到 .i18n-tools/plans/，不修改源码与语言文件（仅 generate 模式生效）',
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
      describe: 'CI 模式：仅 doctor 模式生效，发现 error 级问题时以非零状态码退出',
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
      describe: 'CSV：export 输出路径/目录，import 输入文件路径',
      type: 'string',
    })
    .help()
    .alias('help', 'h')
    .group(['config', 'mode', 'custom'], '📋 基本选项:')
    .group(['interactive', 'skip-llm'], '⚙️  高级选项:')
    .group(['langs', 'filter', 'source', 'output'], '📊 CSV 选项:')
    .group(
      ['dry-run', 'apply-plan', 'keep-plan', 'plan-output-dir', 'coverage-threshold', 'ci'],
      '🩺 CI / Review 选项:',
    )
    .example('$0 --config ./i18n.config.ts', '指定配置文件')
    .example('$0 --mode generate', '扫描源码文件，提取中文并生成国际化调用')
    .example('$0 --mode generate --dry-run', 'Review 模式：生成 plan 但不修改源码')
    .example('$0 --mode generate --apply-plan latest', '回放最近一次 dry-run 生成的 plan')
    .example('$0 --mode generate --apply-plan ./plan.json --keep-plan', '回放并保留 plan 目录')
    .example('$0 --mode generate --coverage-threshold 95', 'CI 卡点：覆盖率不足 95% 则失败')
    .example('$0 --mode doctor', '体检 locale 文件健康度 + 源码对账')
    .example('$0 --mode doctor --ci', 'CI 模式：发现 error 即非零退出')
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
    .example('$0 --mode restore', '将国际化调用还原为中文（调试用）')
    .example('$0 -i', '启动交互式模式，逐步选择操作')
    .example('$0 --mode automatic', '启动全自动处理流程')
    .epilog(
      `💡 提示:
• 首次使用建议用交互模式: npx i18n-tools -i
• 完整工作流程: generate → pick → translate → merge → export
• 定制目录用于项目特定的国际化内容，与主目录分开管理
• 需要在项目根目录创建 i18n.config.ts 配置文件`,
    );

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
    process.exit(1);
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
    process.exit(1);
  }
  const custom = hasCustomLocale && Boolean(argv.custom);

  // 当显式指定了 --mode/-m 时，默认关闭交互模式；否则默认开启
  const modeExplicitlySet = isModeExplicitlySet(process.argv.slice(2));
  const interactive = argv.interactive ?? !modeExplicitlySet;

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

  // CLI 优先：用户传 --coverage-threshold 时覆盖 config.ci.coverageThreshold
  const coverageThreshold =
    (argv['coverage-threshold'] as number | undefined) ?? config.ci.coverageThreshold;
  const dryRun = Boolean(argv['dry-run']);
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

  // dry-run / apply-plan 仅在 generate 模式下生效。在其他模式下静默忽略
  // 比抛错更友好（兼容 automatic 串调 generate 的复杂场景），但显式提示
  // 避免用户写错命令时困惑。
  if ((dryRun || applyPlanPath) && mode !== ModeName.GENERATE && mode !== ModeName.CSV_IMPORT) {
    LoggerUtils.warn(
      `⚠️  --dry-run / --apply-plan 仅在 --mode generate 下生效，当前模式 ${mode}，将被忽略`,
    );
  }
  if (dryRun && applyPlanPath) {
    LoggerUtils.error('❌ --dry-run 与 --apply-plan 互斥，请只指定其一');
    process.exit(1);
  }

  try {
    switch (mode) {
      case ModeName.AUTOMATIC:
        {
          const targetPath = await InteractiveUtils.promptForPath(
            ModeName.AUTOMATIC,
            frameworkInfo.extensions,
            frameworkInfo.displayName,
          );
          const auto = new AutomaticProcessor(config, custom, adapter);
          await auto.execute(targetPath, skipLLM);
          enforceCoverageThreshold(auto, coverageThreshold);
        }
        break;
      case ModeName.GENERATE: {
        if (applyPlanPath) {
          await executeApplyPlan(config, adapter, custom, applyPlanPath, keepPlan);
          break;
        }
        const generator = await executeGenerate(
          config,
          frameworkInfo,
          adapter,
          custom,
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
        await executeExport(config);
        break;
      case ModeName.RESTORE:
        await executeRestore(config, frameworkInfo, adapter, custom);
        break;
      case ModeName.DOCTOR:
        await executeDoctor(config, adapter, custom, Boolean(argv.ci));
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
            process.exit(1);
          }
        }
        await executeCsvImport(config, custom, {
          input: importInput,
          langs: csvLangs,
          dryRun,
          ci: Boolean(argv.ci),
        });
        break;
      }
      default:
        LoggerUtils.error(`没有匹配的模式: ${mode}`);
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
