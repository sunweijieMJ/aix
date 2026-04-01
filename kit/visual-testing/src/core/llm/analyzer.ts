/**
 * LLM 分析器核心
 *
 * 集成 LLMClient + CostController，根据配置选择分析策略：
 * 1. 检查成本控制（阈值、调用次数）
 * 2. 检查缓存
 * 3. 调用 LLMClient 或降级到规则引擎
 * 4. 缓存结果
 */

import { logger } from '../../utils/logger';
import type { VisualTestConfig } from '../config/schema';
import type {
  LLMConfig,
  AnalyzeOptions,
  AnalyzeResult,
  SuggestFixOptions,
  FixSuggestion,
} from '../../types/llm';
import { createAdapter } from './adapters';
import { LLMClient } from './llm-client';
import { RuleBasedProvider } from './providers/rule-based';
import { LLMCostController } from './cost-controller';

const log = logger.child('llm-analyzer');

export class LLMAnalyzer {
  private analyzeClient: LLMClient | null = null;
  private suggestFixClient: LLMClient | null = null;
  private fallbackProvider: RuleBasedProvider;
  private costController: LLMCostController;
  private config: VisualTestConfig['llm'];

  constructor(
    config: VisualTestConfig['llm'],
    options?: { cacheDir?: string },
  ) {
    this.config = config;

    // 初始化成本控制器
    this.costController = new LLMCostController({
      maxCallsPerRun: config.costControl.maxCallsPerRun,
      diffThreshold: config.costControl.diffThreshold,
      cacheEnabled: config.costControl.cacheEnabled,
      cacheTTL: config.costControl.cacheTTL,
      cacheDir: options?.cacheDir,
    });

    // 初始化降级 provider
    this.fallbackProvider = new RuleBasedProvider();

    // 初始化 LLM 客户端
    if (config.enabled) {
      try {
        const analyzeConfig = this.resolveEndpointConfig(config, 'analyze');
        const analyzeAdapter = createAdapter(analyzeConfig);
        this.analyzeClient = new LLMClient(analyzeAdapter, analyzeConfig);

        const suggestFixConfig = this.resolveEndpointConfig(
          config,
          'suggestFix',
        );
        const suggestFixAdapter = createAdapter(suggestFixConfig);
        this.suggestFixClient = new LLMClient(
          suggestFixAdapter,
          suggestFixConfig,
        );
      } catch (error) {
        log.warn(
          'Failed to initialize LLM client, using rule-based fallback',
          error,
        );
      }
    }
  }

  /**
   * 分析差异
   *
   * @param options - 分析选项
   * @param externalSignal - 外部 AbortSignal（来自 orchestrator 的任务超时控制）
   */
  async analyze(
    options: AnalyzeOptions,
    externalSignal?: AbortSignal,
  ): Promise<AnalyzeResult> {
    // 1. 成本控制检查
    if (!this.costController.shouldAnalyze(options.comparisonResult)) {
      log.debug('Cost controller: skipping LLM, using rule-based analysis');
      return this.fallbackProvider.analyze(options);
    }

    // shouldAnalyze 预留了额度，通过 try/finally 确保 recordCall 或 releaseCall 必被调用
    const callState = { recorded: false };
    try {
      // 2. 缓存检查
      const cached = await this.costController.getCachedAnalysis(
        options.baselinePath,
        options.actualPath,
      );
      if (cached) {
        return cached;
      }

      // 3. 调用 LLM 客户端
      if (!this.analyzeClient) {
        return this.fallbackProvider.analyze(options);
      }

      try {
        const result = await this.callWithTimeout(
          (signal) => this.analyzeClient!.analyze(options, signal),
          this.config.fallback.timeout,
          externalSignal,
        );

        // 记录调用（含 token 使用情况）
        this.costController.recordCall(result.usage);
        callState.recorded = true;

        // 4. 缓存结果
        await this.costController.cacheAnalysis(
          options.baselinePath,
          options.actualPath,
          result,
        );

        return result;
      } catch (error) {
        return this.handleError(error, options, externalSignal, callState);
      }
    } finally {
      if (!callState.recorded) {
        this.costController.releaseCall();
      }
    }
  }

  /**
   * 生成修复建议
   *
   * @param options - 修复建议选项
   * @param externalSignal - 外部 AbortSignal
   */
  async suggestFix(
    options: SuggestFixOptions,
    externalSignal?: AbortSignal,
  ): Promise<FixSuggestion[]> {
    if (!this.suggestFixClient) {
      return [];
    }

    // 成本控制：检查调用额度
    if (!this.costController.shouldCall()) {
      log.debug(
        'Cost controller: skipping suggestFix (call limit or budget reached)',
      );
      return [];
    }

    try {
      const result = await this.callWithTimeout(
        (signal) => this.suggestFixClient!.suggestFix(options, signal),
        this.config.fallback.timeout,
        externalSignal,
      );

      // 记录调用（suggestFix 无 token usage 返回，传 undefined）
      this.costController.recordCall();

      return result;
    } catch (error) {
      log.warn('Failed to generate fix suggestions', error);
      // 释放预留的额度
      this.costController.releaseCall();
      return [];
    }
  }

  /**
   * 重置运行状态（每次新运行前调用）
   */
  reset(): void {
    this.costController.reset();
  }

  /**
   * 获取成本统计
   */
  getStats() {
    return {
      ...this.costController.getCostStats(),
      remainingCalls: this.costController.getRemainingCalls(),
      cache: this.costController.getCacheStats(),
      provider: this.analyzeClient?.adapterName ?? 'rule-based',
    };
  }

  /**
   * 将顶层默认值与端点专用配置合并，生成完整的 LLMConfig
   */
  private resolveEndpointConfig(
    config: VisualTestConfig['llm'],
    endpoint: 'analyze' | 'suggestFix',
  ): LLMConfig {
    const endpointConfig = config[endpoint];
    return {
      apiKey: endpointConfig.apiKey ?? config.apiKey ?? '',
      model: endpointConfig.model ?? config.model,
      baseURL: endpointConfig.baseURL ?? config.baseURL,
      maxTokens: endpointConfig.maxTokens,
      timeout: endpointConfig.timeout,
      maxRetries: endpointConfig.maxRetries,
      temperature: endpointConfig.temperature,
    };
  }

  private async handleError(
    error: unknown,
    options: AnalyzeOptions,
    externalSignal: AbortSignal | undefined,
    callState: { recorded: boolean },
  ): Promise<AnalyzeResult> {
    const strategy = this.config.fallback.onError;

    log.warn(`LLM call failed, fallback strategy: ${strategy}`, error);

    // releaseCall 统一由 analyze 的 finally 处理，此处只需在重试成功时 recordCall
    switch (strategy) {
      case 'retry': {
        for (
          let attempt = 0;
          attempt < this.config.fallback.retryAttempts;
          attempt++
        ) {
          try {
            const result = await this.callWithTimeout(
              (signal) => this.analyzeClient!.analyze(options, signal),
              this.config.fallback.timeout,
              externalSignal,
            );
            this.costController.recordCall(result.usage);
            callState.recorded = true;
            return result;
          } catch {
            log.warn(
              `Retry ${attempt + 1}/${this.config.fallback.retryAttempts} failed`,
            );
          }
        }
        // 重试耗尽，降级到规则引擎或抛出
        if (this.config.fallback.fallbackToRuleBase) {
          return this.fallbackProvider.analyze(options);
        }
        throw error;
      }

      case 'rule-based':
        return this.fallbackProvider.analyze(options);

      case 'skip':
      default:
        if (this.config.fallback.fallbackToRuleBase) {
          return this.fallbackProvider.analyze(options);
        }
        throw error;
    }
  }

  private callWithTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    // 如果外部已中止，立即拒绝
    if (externalSignal?.aborted) {
      return Promise.reject(new Error('Aborted by external signal'));
    }

    const controller = new AbortController();

    // 外部信号中止时，联动内部 controller
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`LLM call timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn(controller.signal)
        .then((result) => {
          clearTimeout(timer);
          externalSignal?.removeEventListener('abort', onExternalAbort);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          externalSignal?.removeEventListener('abort', onExternalAbort);
          reject(err);
        });
    });
  }
}
