import type { ResolvedConfig } from '../config';
import { LoggerUtils } from '../utils/logger';
import { BaseProcessor } from './BaseProcessor';
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
export class AutomaticProcessor extends BaseProcessor {
  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
  }

  protected getOperationName(): string {
    return '自动化i18n工作流';
  }

  async execute(targetPath: string, skipLLM: boolean = false): Promise<void> {
    return this.executeWithLifecycle(() => this._execute(targetPath, skipLLM));
  }

  private async _execute(targetPath: string, skipLLM: boolean = false): Promise<void> {
    const steps: Array<{ name: string; run: () => Promise<void> }> = [
      {
        name: 'generate',
        run: () =>
          new GenerateProcessor(this.config, this.isCustom, false).execute(targetPath, skipLLM),
      },
      {
        name: 'pick',
        run: () => new PickProcessor(this.config, this.isCustom).execute(),
      },
      {
        name: 'translate',
        run: () => new TranslateProcessor(this.config, this.isCustom).execute(),
      },
      {
        name: 'merge',
        run: () => new MergeProcessor(this.config, this.isCustom).execute(),
      },
      {
        name: 'export',
        run: () => new ExportProcessor(this.config).execute(),
      },
    ];

    for (const step of steps) {
      try {
        LoggerUtils.info(`\n===== [步骤: ${step.name.toUpperCase()}] =====`);
        await step.run();
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
