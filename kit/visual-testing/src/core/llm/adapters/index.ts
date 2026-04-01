/**
 * Vision 适配器模块
 */

import type { LLMConfig, VisionAdapter } from '../../../types/llm';
import { AnthropicAdapter } from './anthropic';
import { OpenAIAdapter } from './openai';

export { AnthropicAdapter } from './anthropic';
export { OpenAIAdapter } from './openai';

/**
 * 从模型名称推断适配器类型
 */
function inferAdapterType(model: string): 'anthropic' | 'openai' {
  const lower = model.toLowerCase();
  if (lower.startsWith('claude-')) return 'anthropic';
  return 'openai';
}

/**
 * 根据配置创建 VisionAdapter
 *
 * 自动从 model 名称推断适配器类型：
 * - claude-* → AnthropicAdapter
 * - 其他 → OpenAIAdapter（支持 baseURL 切换厂商）
 */
export function createAdapter(config: LLMConfig): VisionAdapter {
  const type = inferAdapterType(config.model);

  switch (type) {
    case 'anthropic':
      return new AnthropicAdapter(config);
    case 'openai':
      return new OpenAIAdapter(config);
  }
}
