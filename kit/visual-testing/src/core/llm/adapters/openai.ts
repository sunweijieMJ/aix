/**
 * OpenAI Vision 适配器
 *
 * 只负责 OpenAI 特有的图片格式转换和 API 调用。
 * 支持通过 baseURL 切换到 Azure OpenAI 或其他 OpenAI 兼容 API。
 * 所有 prompt 构建、响应解析逻辑在 LLMClient 中统一处理。
 */

// 仅类型导入（编译期擦除，不产生运行时依赖）；SDK 在首次调用时动态加载。
import type OpenAI from 'openai';
import { logger } from '../../../utils/logger';
import { requireOptional } from '../../../utils/optional-import';
import type { LLMConfig, VisionAdapter, ImageInput, VisionCallResult } from '../../../types/llm';

const log = logger.child('openai-adapter');

export class OpenAIAdapter implements VisionAdapter {
  readonly name = 'openai';
  private client: OpenAI | null = null;
  private readonly apiKey: string;
  private readonly baseURL?: string;

  constructor(config: LLMConfig) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY env or pass apiKey in config.',
      );
    }
    this.apiKey = apiKey;
    this.baseURL = config.baseURL;
  }

  /**
   * 懒加载 openai（可选依赖），缺失时抛出带安装指引的友好错误。
   */
  private async getClient(): Promise<OpenAI> {
    if (this.client) return this.client;
    const mod = await requireOptional<{ default: typeof OpenAI }>('openai', 'openai');
    const OpenAICtor = mod.default;
    this.client = new OpenAICtor({ apiKey: this.apiKey, baseURL: this.baseURL });
    return this.client;
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
      { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
    > = [];

    for (const img of images) {
      const dataUri = `data:image/png;base64,${img.data.toString('base64')}`;
      content.push({ type: 'image_url', image_url: { url: dataUri } });
      content.push({ type: 'text', text: img.label });
    }

    content.push({ type: 'text', text: prompt });

    log.debug(`Calling OpenAI API with model ${options.model}`);
    const client = await this.getClient();
    const response = await client.chat.completions.create(
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
    const client = await this.getClient();
    const response = await client.chat.completions.create(
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
