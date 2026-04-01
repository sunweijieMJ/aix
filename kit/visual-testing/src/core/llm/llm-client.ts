/**
 * 统一 LLM 客户端
 *
 * 将所有共享逻辑（prompt 构建、响应解析、图片读取）集中在此，
 * 通过 VisionAdapter 接口适配不同厂商的 API 差异。
 */

import fs from 'node:fs/promises';
import { logger } from '../../utils/logger';
import {
  ANALYZE_DIFF_PROMPT,
  SUGGEST_FIX_PROMPT,
} from './prompts/analyze-diff';
import { z } from 'zod';
import type {
  LLMConfig,
  VisionAdapter,
  ImageInput,
  AnalyzeOptions,
  AnalyzeResult,
  SuggestFixOptions,
  FixSuggestion,
  Difference,
  Assessment,
} from '../../types/llm';

const log = logger.child('llm-client');

export class LLMClient {
  private adapter: VisionAdapter;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(adapter: VisionAdapter, config: LLMConfig) {
    this.adapter = adapter;
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature ?? 0.3;
  }

  get adapterName(): string {
    return this.adapter.name;
  }

  /**
   * 视觉差异分析（带图片）
   */
  async analyze(
    options: AnalyzeOptions,
    signal?: AbortSignal,
  ): Promise<AnalyzeResult> {
    const { baselinePath, actualPath, diffPath, comparisonResult, context } =
      options;

    // 1. 读取图片
    const images = await this.loadImages(baselinePath, actualPath, diffPath);

    // 2. 构建 prompt
    const prompt = this.buildAnalyzePrompt(comparisonResult, context);

    // 3. 调用 Vision API
    const callResult = await this.adapter.chatWithImages(images, prompt, {
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      signal,
    });

    // 4. 解析响应
    const result = this.parseAnalyzeResponse(callResult.text);

    // 5. 附加 token 使用情况
    if (callResult.usage) {
      result.usage = callResult.usage;
    }

    return result;
  }

  /**
   * 生成修复建议（纯文本）
   */
  async suggestFix(
    options: SuggestFixOptions,
    signal?: AbortSignal,
  ): Promise<FixSuggestion[]> {
    const prompt = this.buildSuggestFixPrompt(options.differences);

    const callResult = await this.adapter.chat(prompt, {
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      signal,
    });

    return this.parseSuggestFixResponse(callResult.text);
  }

  // ---- 私有方法：图片读取 ----

  private async loadImages(
    baselinePath: string,
    actualPath: string,
    diffPath?: string,
  ): Promise<ImageInput[]> {
    const [baselineData, actualData, diffData] = await Promise.all([
      fs.readFile(baselinePath),
      fs.readFile(actualPath),
      diffPath ? fs.readFile(diffPath) : Promise.resolve(null),
    ]);

    const images: ImageInput[] = [
      { data: baselineData, label: '[设计稿]' },
      { data: actualData, label: '[实际渲染]' },
    ];

    if (diffData) {
      images.push({ data: diffData, label: '[差异图]' });
    }

    return images;
  }

  // ---- 私有方法：Prompt 构建 ----

  private buildAnalyzePrompt(
    comparisonResult: AnalyzeOptions['comparisonResult'],
    context?: AnalyzeOptions['context'],
  ): string {
    return ANALYZE_DIFF_PROMPT.replaceAll(
      '{{name}}',
      context?.name || 'Unknown',
    )
      .replaceAll('{{type}}', context?.type || 'component')
      .replaceAll('{{framework}}', context?.framework || 'Vue 3')
      .replaceAll('{{mismatchPixels}}', String(comparisonResult.mismatchPixels))
      .replaceAll(
        '{{mismatchPercentage}}',
        comparisonResult.mismatchPercentage.toFixed(2),
      )
      .replaceAll(
        '{{sizeDiff}}',
        comparisonResult.sizeDiff
          ? JSON.stringify(comparisonResult.sizeDiff)
          : '无',
      );
  }

  private buildSuggestFixPrompt(differences: Difference[]): string {
    return SUGGEST_FIX_PROMPT.replaceAll(
      '{{differences}}',
      JSON.stringify(differences, null, 2),
    );
  }

  // ---- 私有方法：响应解析 ----

  /** LLM 分析响应的运行时 Schema */
  private static analyzeResponseSchema = z.object({
    differences: z
      .array(
        z.object({
          id: z.string(),
          type: z
            .enum([
              'color',
              'spacing',
              'font',
              'size',
              'border',
              'shadow',
              'position',
              'missing',
              'extra',
              'layout',
              'other',
            ])
            .catch('other'),
          location: z.string(),
          description: z.string(),
          severity: z.enum(['critical', 'major', 'minor', 'trivial']),
          expected: z.string().optional(),
          actual: z.string().optional(),
        }),
      )
      .optional()
      .default([]),
    assessment: z
      .object({
        matchScore: z.number(),
        grade: z.enum(['A', 'B', 'C', 'D', 'F']),
        acceptable: z.boolean(),
        summary: z.string(),
      })
      .optional(),
  });

  /** LLM 修复建议响应的运行时 Schema */
  private static suggestFixResponseSchema = z.object({
    fixes: z
      .array(
        z.object({
          differenceId: z.string(),
          type: z.enum(['css', 'html', 'component', 'config']),
          code: z.string(),
          file: z.string().optional(),
          confidence: z.number(),
          explanation: z.string(),
        }),
      )
      .optional()
      .default([]),
  });

  private parseAnalyzeResponse(response: string): AnalyzeResult {
    const parsed = this.parseJsonResponse(response);

    if (parsed) {
      const validated = LLMClient.analyzeResponseSchema.safeParse(parsed);
      if (validated.success) {
        return {
          differences: validated.data.differences,
          assessment: validated.data.assessment ?? this.defaultAssessment(),
          rawResponse: response,
        };
      }
      log.warn('LLM response schema validation failed', validated.error.issues);
    }

    return {
      differences: [],
      assessment: this.defaultAssessment(),
      rawResponse: response,
    };
  }

  private parseSuggestFixResponse(response: string): FixSuggestion[] {
    const parsed = this.parseJsonResponse(response);

    if (parsed) {
      const validated = LLMClient.suggestFixResponseSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data.fixes;
      }
      log.warn(
        'LLM suggest-fix response schema validation failed',
        validated.error.issues,
      );
    }

    return [];
  }

  /**
   * 分层 JSON 解析：直接解析 → code fence 提取 → 首个 JSON 对象
   */
  private parseJsonResponse(text: string): unknown | null {
    // 1. 尝试直接解析（response_format 保证的场景）
    try {
      return JSON.parse(text);
    } catch {
      /* continue */
    }

    // 2. 尝试提取 markdown code fence
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch?.[1]) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch {
        /* continue */
      }
    }

    // 3. 尝试提取首个 JSON 对象
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        /* continue */
      }
    }

    log.warn('Failed to parse LLM JSON response');
    return null;
  }

  private defaultAssessment(): Assessment {
    return {
      matchScore: 0,
      grade: 'F',
      acceptable: false,
      summary: 'Failed to parse LLM response',
    };
  }
}
