import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { LoggerUtils } from '../utils/logger';
import { FileProcessor } from './FileProcessor';
import { ExportProcessor } from './ExportProcessor';
import { GenerateProcessor } from './GenerateProcessor';
import { MergeProcessor } from './MergeProcessor';
import { PickProcessor } from './PickProcessor';
import { TranslateProcessor } from './TranslateProcessor';

/**
 * 自动处理器
 * 负责按顺序执行完整的i18n工作流
 *
 * 接收 ResolvedConfig 并传递给所有子处理器；
 * 可选注入预构造的 FrameworkAdapter，避免内嵌的 GenerateProcessor 重复构建策略链。
 */
export class AutomaticProcessor extends FileProcessor {
  private adapter?: FrameworkAdapter;

  constructor(config: ResolvedConfig, isCustom: boolean = false, adapter?: FrameworkAdapter) {
    super(config, isCustom);
    this.adapter = adapter;
  }

  protected getOperationName(): string {
    return '自动化i18n工作流';
  }

  async execute(targetPath: string, skipLLM: boolean = false): Promise<void> {
    return this.executeWithLifecycle(() => this._execute(targetPath, skipLLM));
  }

  private async _execute(targetPath: string, skipLLM: boolean = false): Promise<void> {
    // 显式持有 GenerateProcessor 实例，便于结束后把覆盖率指标透传到 automatic
    // 自身的 report——CLI 层只看 AutomaticProcessor.getCoverage()，无需感知
    // 内部 step 的 processor 拓扑。
    const generator = new GenerateProcessor(this.config, this.isCustom, false, this.adapter);

    // run 回传本步骤的 processor 实例（可选）：结束后聚合它的 partiallyFailed，
    // 让整条工作流的收尾如实反映「某一步只做了一半」。
    const steps: Array<{
      name: string;
      skip?: boolean;
      skipReason?: string;
      run: () => Promise<FileProcessor | void>;
    }> = [
      {
        name: 'generate',
        run: async (): Promise<FileProcessor> => {
          await generator.execute(targetPath, skipLLM);
          // 透传 coverage：generator.report 不与本实例共享，必须显式拷贝
          const coverage = generator.getCoverage();
          if (coverage) this.report.setCoverage(coverage);
          return generator;
        },
      },
      {
        name: 'pick',
        run: async (): Promise<FileProcessor> => {
          const processor = new PickProcessor(this.config, this.isCustom);
          await processor.execute();
          return processor;
        },
      },
      {
        // --skip-llm 自述「不调 LLM API」，却只作用于 ID 生成：translate 照跑、没有 apiKey
        // 时整条流程硬失败在这一步。既然本次运行明确不许调 LLM，就把 translate 一并跳过；
        // 词表（glossary）命中仍在 pick/merge 生效，产出的 untranslated.json 留待后续单独
        // 跑 `--mode translate` 或人工/CSV 回流补齐。
        name: 'translate',
        skip: skipLLM,
        skipReason: '--skip-llm：跳过 AI 翻译步骤，词表命中仍在 pick/merge 生效',
        run: async (): Promise<FileProcessor> => {
          const processor = new TranslateProcessor(this.config, this.isCustom);
          await processor.execute();
          return processor;
        },
      },
      {
        name: 'merge',
        run: async (): Promise<FileProcessor> => {
          const processor = new MergeProcessor(this.config, this.isCustom);
          await processor.execute();
          return processor;
        },
      },
      {
        // export 是可选步骤：只有显式配置了 io.exportDir 才执行。
        // 未配置即代表"工作目录就是运行时消费目录"，automatic 流程到 merge 即闭环；
        // 此时强制 export 会因缺少输出目录而抛错并中断后续工作流。
        name: 'export',
        skip: !this.config.io.exportDir,
        skipReason: '未配置 io.exportDir',
        run: async (): Promise<FileProcessor> => {
          const processor = new ExportProcessor(this.config);
          await processor.execute();
          return processor;
        },
      },
    ];

    for (const step of steps) {
      LoggerUtils.info(`\n===== [步骤: ${step.name.toUpperCase()}] =====`);
      if (step.skip) {
        LoggerUtils.info(`⏭️  跳过 ${step.name}：${step.skipReason}`);
        continue;
      }
      try {
        const processor = await step.run();
        if (processor?.isPartiallyFailed()) this.partiallyFailed = true;
      } catch (error) {
        LoggerUtils.error(`❌ 自动化工作流在 [${step.name}] 步骤失败:`, error);
        LoggerUtils.warn(
          `💡 建议: 您可以尝试使用手动模式单独运行此步骤以进行调试: npx i18n-tools -i -m ${step.name}`,
        );
        throw new Error(`自动化流程在 ${step.name} 步骤中断。`, {
          cause: error,
        });
      }
    }
  }
}
