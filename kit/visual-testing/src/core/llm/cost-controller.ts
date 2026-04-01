/**
 * LLM 成本控制器
 *
 * 控制 LLM 调用频率和成本：
 * - 每次运行最大调用次数限制
 * - 差异阈值过滤（低于阈值不调用 LLM）
 * - 跳过 minor 差异
 * - 结果缓存
 */

import { CacheManager } from '../../utils/cache';
import { hashFile } from '../../utils/hash';
import { logger } from '../../utils/logger';
import type { CompareResult } from '../../types/comparison';
import type { AnalyzeResult, TokenUsage } from '../../types/llm';

export interface CostControlConfig {
  /** 每次测试运行最大 LLM 调用数 */
  maxCallsPerRun: number;
  /** 差异百分比低于此值时跳过 LLM 分析（默认 5%） */
  diffThreshold: number;
  /** 启用缓存 */
  cacheEnabled: boolean;
  /** 缓存 TTL（秒） */
  cacheTTL: number;
  /** 可选：最大预算（USD） */
  maxBudget?: number;
}

/** 成本统计 */
export interface CostStats {
  callCount: number;
  totalTokens: number;
  estimatedCost: number;
  averageTokensPerCall: number;
  breakdown: {
    promptTokens: number;
    completionTokens: number;
  };
}

const DEFAULT_COST_CONFIG: CostControlConfig = {
  maxCallsPerRun: 50,
  diffThreshold: 5,
  cacheEnabled: true,
  cacheTTL: 3600,
};

const log = logger.child('cost-controller');

export class LLMCostController {
  private callCount = 0;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private estimatedCost = 0;
  private cache: CacheManager;
  private config: CostControlConfig;
  private diskLoadPromise: Promise<void> | null = null;

  // 统一估算定价（USD per 1M tokens）
  // 使用 GPT-4o 价格作为基准估算，实际费用以厂商账单为准
  private readonly estimatedPricing = {
    input: 2.5 / 1_000_000,
    output: 10 / 1_000_000,
  };

  constructor(config?: Partial<CostControlConfig> & { cacheDir?: string }) {
    const { cacheDir, ...costConfig } = config ?? {};
    this.config = { ...DEFAULT_COST_CONFIG, ...costConfig };
    this.cache = new CacheManager({
      defaultTTL: this.config.cacheTTL * 1000,
      persistPath: cacheDir ? `${cacheDir}/llm-cache.json` : undefined,
    });
  }

  /**
   * 判断是否应该调用 LLM 分析
   *
   * 采用原子预留模式：通过检查后立即递增 callCount 占用额度，
   * 防止并发任务同时通过检查导致超出 maxCallsPerRun 限制。
   * 如果后续不实际调用 LLM（如缓存命中），需调用 releaseCall() 释放额度。
   */
  shouldAnalyze(comparison: CompareResult): boolean {
    // 完全匹配的不需要分析
    if (comparison.match) {
      log.debug('Skip: images match');
      return false;
    }

    // 调用次数限制（原子预留：先检查再占用）
    if (this.callCount >= this.config.maxCallsPerRun) {
      log.warn(`Skip: call limit reached (${this.config.maxCallsPerRun})`);
      return false;
    }

    // 差异低于阈值，跳过 LLM 分析
    if (comparison.mismatchPercentage < this.config.diffThreshold) {
      log.debug(
        `Skip: diff ${comparison.mismatchPercentage.toFixed(2)}% below threshold ${this.config.diffThreshold}%`,
      );
      return false;
    }

    // 预算超限
    if (this.config.maxBudget && this.estimatedCost >= this.config.maxBudget) {
      log.warn(
        `Skip: budget exceeded ($${this.estimatedCost.toFixed(2)} / $${this.config.maxBudget.toFixed(2)})`,
      );
      return false;
    }

    // 通过所有检查，预留额度
    this.callCount++;
    return true;
  }

  /**
   * 判断是否有剩余调用额度（用于 suggestFix 等无需 diff 阈值检查的场景）
   *
   * 同样采用原子预留模式，通过检查后立即占用额度。
   * 如果最终未实际调用 LLM，需调用 releaseCall() 释放。
   */
  shouldCall(): boolean {
    if (this.callCount >= this.config.maxCallsPerRun) {
      log.warn(`Skip: call limit reached (${this.config.maxCallsPerRun})`);
      return false;
    }

    if (this.config.maxBudget && this.estimatedCost >= this.config.maxBudget) {
      log.warn(
        `Skip: budget exceeded ($${this.estimatedCost.toFixed(2)} / $${this.config.maxBudget.toFixed(2)})`,
      );
      return false;
    }

    this.callCount++;
    return true;
  }

  /**
   * 释放 shouldAnalyze/shouldCall 预留的调用额度（缓存命中或出错时调用）
   */
  releaseCall(): void {
    if (this.callCount > 0) {
      this.callCount--;
    }
  }

  /**
   * 从缓存获取分析结果
   */
  async getCachedAnalysis(
    baselinePath: string,
    actualPath: string,
  ): Promise<AnalyzeResult | null> {
    if (!this.config.cacheEnabled) return null;

    // 首次访问时从磁盘加载缓存（Promise 缓存避免并发重复加载）
    if (!this.diskLoadPromise) {
      this.diskLoadPromise = this.cache.loadFromDisk();
    }
    await this.diskLoadPromise;

    const key = await this.buildCacheKey(baselinePath, actualPath);
    const cached = this.cache.get<AnalyzeResult>(key);

    if (cached) {
      log.debug(`Cache hit: ${key.slice(0, 16)}...`);
    }

    return cached;
  }

  /**
   * 缓存分析结果
   */
  async cacheAnalysis(
    baselinePath: string,
    actualPath: string,
    analysis: AnalyzeResult,
  ): Promise<void> {
    if (!this.config.cacheEnabled) return;

    const key = await this.buildCacheKey(baselinePath, actualPath);
    this.cache.set(key, analysis);
    log.debug(`Cached analysis: ${key.slice(0, 16)}...`);
  }

  /**
   * 记录一次 LLM 调用的 token 使用情况
   *
   * 注意：callCount 已在 shouldAnalyze() 中预增，此处不再递增。
   */
  recordCall(usage?: TokenUsage): void {
    if (usage) {
      this.totalPromptTokens += usage.prompt_tokens;
      this.totalCompletionTokens += usage.completion_tokens;

      const cost =
        usage.prompt_tokens * this.estimatedPricing.input +
        usage.completion_tokens * this.estimatedPricing.output;

      this.estimatedCost += cost;

      log.debug(
        `LLM call ${this.callCount}: ` +
          `${usage.prompt_tokens + usage.completion_tokens} tokens, ` +
          `cost: $${cost.toFixed(4)}, ` +
          `total: $${this.estimatedCost.toFixed(4)}`,
      );

      // 预算警告
      if (this.config.maxBudget && this.estimatedCost > this.config.maxBudget) {
        log.warn(
          `Budget exceeded: $${this.estimatedCost.toFixed(2)} / $${this.config.maxBudget.toFixed(2)}`,
        );
      }
    } else {
      log.debug(
        `LLM call count: ${this.callCount}/${this.config.maxCallsPerRun}`,
      );
    }
  }

  /**
   * 获取剩余调用额度
   */
  getRemainingCalls(): number {
    return Math.max(0, this.config.maxCallsPerRun - this.callCount);
  }

  /**
   * 获取成本统计
   */
  getCostStats(): CostStats {
    const totalTokens = this.totalPromptTokens + this.totalCompletionTokens;
    return {
      callCount: this.callCount,
      totalTokens,
      estimatedCost: this.estimatedCost,
      averageTokensPerCall:
        this.callCount > 0 ? totalTokens / this.callCount : 0,
      breakdown: {
        promptTokens: this.totalPromptTokens,
        completionTokens: this.totalCompletionTokens,
      },
    };
  }

  /**
   * 重置调用计数（新一轮运行时）
   */
  reset(): void {
    this.callCount = 0;
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.estimatedCost = 0;
    log.debug('Cost controller reset');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  private async buildCacheKey(
    baselinePath: string,
    actualPath: string,
  ): Promise<string> {
    try {
      const [h1, h2] = await Promise.all([
        hashFile(baselinePath),
        hashFile(actualPath),
      ]);
      return `${h1}:${h2}`;
    } catch (error) {
      log.warn('Failed to hash files for cache key, using file paths instead', {
        baselinePath,
        actualPath,
        error: error instanceof Error ? error.message : String(error),
      });
      // 降级策略：使用 encodeURIComponent 保证不同路径不会碰撞
      return `path:${encodeURIComponent(baselinePath)}:${encodeURIComponent(actualPath)}`;
    }
  }
}
