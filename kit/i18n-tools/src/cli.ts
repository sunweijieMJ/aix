import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadConfig } from './config';
import type { ResolvedConfig } from './config';
import {
  AutomaticProcessor,
  ExportProcessor,
  GenerateProcessor,
  MergeProcessor,
  PickProcessor,
  RestoreProcessor,
  TranslateProcessor,
} from './core';
import { InteractiveUtils, loadEnv, LoggerUtils, MODE_DESCRIPTIONS, ModeName } from './utils';

/**
 * 执行generate操作（提取多语言组件）
 */
const executeGenerate = async (
  config: ResolvedConfig,
  isCustom: boolean,
  skipLLM: boolean = false,
): Promise<void> => {
  const targetPath = await InteractiveUtils.promptForPath(ModeName.GENERATE, config.framework);
  const processor = new GenerateProcessor(config, isCustom);
  await processor.execute(targetPath, skipLLM);
};

/**
 * 执行restore操作（还原多语言组件）
 */
const executeRestore = async (config: ResolvedConfig, isCustom: boolean): Promise<void> => {
  const targetPath = await InteractiveUtils.promptForPath(ModeName.RESTORE, config.framework);
  const processor = new RestoreProcessor(config, isCustom);
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
    .help()
    .alias('help', 'h')
    .group(['config', 'mode', 'custom'], '📋 基本选项:')
    .group(['interactive', 'skip-llm'], '⚙️  高级选项:')
    .example('$0 --config ./i18n.config.ts', '指定配置文件')
    .example('$0 --mode generate', '扫描源码文件，提取中文并生成国际化调用')
    .example('$0 --mode pick', '从国际化文件中提取未翻译的条目')
    .example('$0 --mode translate', '使用AI翻译服务翻译中文为英文')
    .example('$0 --mode merge --custom', '将定制目录的翻译结果合并回主文件')
    .example('$0 --mode export', '导出最终的多语言文件包')
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
  rootDir: __dirname,
  framework: 'vue',
  paths: {
    locale: 'src/locale',
    source: 'src',
  },
  llm: {
    idGeneration: { apiKey: process.env.LLM_API_KEY!, model: 'gpt-4o' },
    translation: { apiKey: process.env.LLM_API_KEY!, model: 'gpt-4o' },
  },
});`);
    process.exit(1);
  }

  // 初始化参数
  let mode = (argv.mode as ModeName) || ModeName.GENERATE;
  const custom = Boolean(argv.custom);
  const skipLLM = Boolean(argv.skipLlm);

  // 当显式指定了 --mode/-m 时，默认关闭交互模式；否则默认开启
  const modeExplicitlySet = process.argv
    .slice(2)
    .some((arg) => arg === '--mode' || arg.startsWith('--mode=') || arg === '-m');
  const interactive = argv.interactive ?? !modeExplicitlySet;

  // 交互模式处理
  if (interactive) {
    const topLevelChoice = await InteractiveUtils.promptForTopLevelMode();

    if (topLevelChoice === 'automatic') {
      mode = ModeName.AUTOMATIC;
    } else {
      mode = await InteractiveUtils.promptForMode(custom, mode);
    }

    const confirmed = await InteractiveUtils.promptForConfirmation(mode, custom);
    if (!confirmed) {
      LoggerUtils.warn('操作已取消');
      process.exit(0);
    }
  }

  // export 模式不需要区分定制目录
  if (mode === ModeName.EXPORT && custom) {
    LoggerUtils.info('注意: export 模式会导出所有语言包，不区分主目录和定制目录');
  }

  // 输出操作信息
  const location = mode === ModeName.EXPORT ? '全局' : custom ? '定制目录' : '主目录';
  const frameworkLib = config.framework === 'vue' ? config.vue.library : config.react.library;
  LoggerUtils.info(`🎯 执行模式: ${mode} (${MODE_DESCRIPTIONS[mode]})`);
  LoggerUtils.info(`📍 操作目录: ${location}`);
  LoggerUtils.info(`⚡ 项目框架: ${config.framework} (${frameworkLib})`);

  try {
    switch (mode) {
      case ModeName.AUTOMATIC:
        {
          const targetPath = await InteractiveUtils.promptForPath(
            ModeName.AUTOMATIC,
            config.framework,
          );
          await new AutomaticProcessor(config, custom).execute(targetPath, skipLLM);
        }
        break;
      case ModeName.GENERATE:
        await executeGenerate(config, custom, skipLLM);
        break;
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
        await executeRestore(config, custom);
        break;
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
