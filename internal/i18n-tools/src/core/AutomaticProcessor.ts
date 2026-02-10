import type { ResolvedConfig } from '../config';
import { LoggerUtils } from '../utils/logger';
import { ExportProcessor } from './ExportProcessor';
import { GenerateProcessor } from './GenerateProcessor';
import { MergeProcessor } from './MergeProcessor';
import { PickProcessor } from './PickProcessor';
import { TranslateProcessor } from './TranslateProcessor';

/**
 * 自动处理器
 * 负责按顺序执行完整的i18n工作流
 *
 * 接收 ResolvedConfig 并传递给所有子处理器
 */
export class AutomaticProcessor {
  private config: ResolvedConfig;
  private isCustom: boolean;

  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    this.config = config;
    this.isCustom = isCustom;
  }

  async execute(targetPath: string, skipDify: boolean = false): Promise<void> {
    const steps = [
      {
        name: 'generate',
        processor: new GenerateProcessor(this.config, this.isCustom),
      },
      {
        name: 'pick',
        processor: new PickProcessor(this.config, this.isCustom),
      },
      {
        name: 'translate',
        processor: new TranslateProcessor(this.config, this.isCustom),
      },
      {
        name: 'merge',
        processor: new MergeProcessor(this.config, this.isCustom),
      },
      { name: 'export', processor: new ExportProcessor(this.config) },
    ];

    LoggerUtils.info('🚀 开始执行自动化i18n工作流...');

    for (const step of steps) {
      try {
        LoggerUtils.info(`\n===== [步骤: ${step.name.toUpperCase()}] =====`);

        if (step.name === 'generate') {
          await (step.processor as GenerateProcessor).execute(
            targetPath,
            skipDify,
          );
        } else {
          await step.processor.execute();
        }
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

    LoggerUtils.success('\n✅ 自动化i18n工作流全部执行成功！');
  }
}
