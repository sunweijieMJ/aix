/**
 * OpenAI Vision 适配器
 *
 * 只负责 OpenAI 特有的图片格式转换和 API 调用。
 * 支持通过 baseURL 切换到 Azure OpenAI 或其他 OpenAI 兼容 API。
 * 所有 prompt 构建、响应解析逻辑在 LLMClient 中统一处理。
 */

import OpenAI from 'openai';
import { logger } from '../../../utils/logger';
import type {
  LLMConfig,
  VisionAdapter,
  ImageInput,
  VisionCallResult,
} from '../../../types/llm';

const log = logger.child('openai-adapter');

export class OpenAIAdapter implements VisionAdapter {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(config: LLMConfig) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY env or pass apiKey in config.',
      );
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseURL,
    });
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
      | { type: 'image_url'; image_url: { url: string } }
    > = [];

    for (const img of images) {
      const dataUri = `data:image/png;base64,${img.data.toString('base64')}`;
      content.push({ type: 'image_url', image_url: { url: dataUri } });
      content.push({ type: 'text', text: img.label });
    }

    content.push({ type: 'text', text: prompt });

    log.debug(`Calling OpenAI API with model ${options.model}`);
    const response = await this.client.chat.completions.create(
      {
        model: options.model,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' },
      },
      { signal: options.signal },
    );

    const text = response.choices[0]?.message?.content || '';

    return {
      text,
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens ?? 0,
            completion_tokens: response.usage.completion_tokens ?? 0,
          }
        : undefined,
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
    log.debug(`Calling OpenAI API (text) with model ${options.model}`);
    const response = await this.client.chat.completions.create(
      {
        model: options.model,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      },
      { signal: options.signal },
    );

    const text = response.choices[0]?.message?.content || '';

    return {
      text,
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens ?? 0,
            completion_tokens: response.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }
}
