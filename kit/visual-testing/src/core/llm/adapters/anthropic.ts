/**
 * Anthropic Vision 适配器
 *
 * 只负责 Anthropic 特有的图片格式转换和 API 调用。
 * 所有 prompt 构建、响应解析逻辑在 LLMClient 中统一处理。
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../../utils/logger';
import type {
  LLMConfig,
  VisionAdapter,
  ImageInput,
  VisionCallResult,
} from '../../../types/llm';

const log = logger.child('anthropic-adapter');

export class AnthropicAdapter implements VisionAdapter {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(config: LLMConfig) {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Anthropic API key is required. Set ANTHROPIC_API_KEY env or pass apiKey in config.',
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  async chatWithImages(
    images: ImageInput[],
    prompt: string,
    options: {
      model: string;
      maxTokens: number;
      temperature: number;
      signal?: AbortSignal;
    },
  ): Promise<VisionCallResult> {
    const content: Array<
      | { type: 'text'; text: string }
      | {
          type: 'image';
          source: { type: 'base64'; media_type: 'image/png'; data: string };
        }
    > = [];

    for (const img of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: img.data.toString('base64'),
        },
      });
      content.push({ type: 'text', text: img.label });
    }

    content.push({ type: 'text', text: prompt });

    log.debug(`Calling Anthropic API with model ${options.model}`);
    const response = await this.client.messages.create(
      {
        model: options.model,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        system:
          'You must respond with valid JSON only. No markdown, no explanation, no text outside the JSON object.',
        messages: [{ role: 'user', content }],
      },
      { signal: options.signal },
    );

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    return {
      text,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
      },
    };
  }

  async chat(
    prompt: string,
    options: {
      model: string;
      maxTokens: number;
      temperature: number;
      signal?: AbortSignal;
    },
  ): Promise<VisionCallResult> {
    log.debug(`Calling Anthropic API (text) with model ${options.model}`);
    const response = await this.client.messages.create(
      {
        model: options.model,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        system:
          'You must respond with valid JSON only. No markdown, no explanation, no text outside the JSON object.',
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: options.signal },
    );

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    return {
      text,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
      },
    };
  }
}
