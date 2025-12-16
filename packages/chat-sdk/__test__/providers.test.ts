/**
 * @fileoverview Providers 模块测试
 * 测试 Provider 工具函数和 OpenAIChatProvider
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  ProviderRegistry,
  createProvider,
  setProviderGlobalConfig,
  getProviderGlobalConfig,
  resetProviderGlobalConfig,
} from '../src/providers';
import {
  OpenAIChatProvider,
  createOpenAIProvider,
} from '../src/providers/OpenAIChatProvider';
import type { RequestMiddleware } from '../src/providers/types';
import {
  toOpenAIMessages,
  toOpenAIContentParts,
  buildOpenAIParams,
  parseSSEData,
  extractDeltaContent,
  normalizeMiddlewares,
  mergeMiddlewares,
  executeRequestMiddlewares,
  executeResponseMiddlewares,
} from '../src/providers/utils';
import type { ChatMessage, OpenAIMessage } from '../src/types';

describe('providers/utils', () => {
  describe('toOpenAIMessages', () => {
    it('should convert string content messages', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createAt: Date.now(),
          updateAt: Date.now(),
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe('user');
      expect(result[0]?.content).toBe('Hello');
    });

    it('should handle null content', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: null as unknown as string,
          createAt: Date.now(),
          updateAt: Date.now(),
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(result[0]?.content).toBe('');
    });

    it('should handle undefined content', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: undefined as unknown as string,
          createAt: Date.now(),
          updateAt: Date.now(),
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(result[0]?.content).toBe('');
    });

    it('should handle empty array content', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: [],
          createAt: Date.now(),
          updateAt: Date.now(),
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(result[0]?.content).toBe('');
    });

    it('should simplify text-only multimodal content', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
          createAt: Date.now(),
          updateAt: Date.now(),
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(typeof result[0]?.content).toBe('string');
      expect(result[0]?.content).toBe('Hello\nWorld');
    });

    it('should convert mixed multimodal content', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: [
            { type: 'text', text: 'Look at this' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/img.png' },
            },
          ],
          createAt: Date.now(),
          updateAt: Date.now(),
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(Array.isArray(result[0]?.content)).toBe(true);
      expect(result[0]?.content).toHaveLength(2);
    });
  });

  describe('toOpenAIContentParts', () => {
    it('should convert text content', () => {
      const content = [{ type: 'text' as const, text: 'Hello' }];

      const result = toOpenAIContentParts(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'text', text: 'Hello' });
    });

    it('should convert image content', () => {
      const content = [
        {
          type: 'image_url' as const,
          image_url: {
            url: 'https://example.com/img.png',
            detail: 'high' as const,
          },
        },
      ];

      const result = toOpenAIContentParts(content);

      expect(result[0]).toEqual({
        type: 'image_url',
        image_url: { url: 'https://example.com/img.png', detail: 'high' },
      });
    });

    it('should convert file content to text description', () => {
      const content = [
        {
          type: 'file' as const,
          file: { url: 'https://example.com/doc.pdf', name: 'doc.pdf' },
        },
      ];

      const result = toOpenAIContentParts(content);

      expect(result[0]).toEqual({ type: 'text', text: '[文件: doc.pdf]' });
    });
  });

  describe('buildOpenAIParams', () => {
    it('should build basic params', () => {
      const config = { model: 'gpt-4' };
      const messages: OpenAIMessage[] = [{ role: 'user', content: 'Hello' }];

      const params = buildOpenAIParams(config, messages, true);

      expect(params.model).toBe('gpt-4');
      expect(params.messages).toEqual(messages);
      expect(params.stream).toBe(true);
    });

    it('should include optional parameters', () => {
      const config = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        stop: ['END'],
      };
      const messages: OpenAIMessage[] = [];

      const params = buildOpenAIParams(config, messages, true);

      expect(params.temperature).toBe(0.7);
      expect(params.max_tokens).toBe(1000);
      expect(params.top_p).toBe(0.9);
      expect(params.frequency_penalty).toBe(0.5);
      expect(params.presence_penalty).toBe(0.5);
      expect(params.stop).toEqual(['END']);
    });

    it('should merge extra options', () => {
      const config = { model: 'gpt-4' };
      const messages: OpenAIMessage[] = [];
      const options = { user: 'test-user', custom_field: 'value' };

      const params = buildOpenAIParams(config, messages, true, options);

      expect(params.user).toBe('test-user');
      expect(params['custom_field']).toBe('value');
    });
  });

  describe('parseSSEData', () => {
    it('should parse valid JSON', () => {
      const data = '{"id": "1", "choices": []}';

      const result = parseSSEData<{ id: string }>(data);

      expect(result?.id).toBe('1');
    });

    it('should return null for [DONE]', () => {
      const result = parseSSEData('[DONE]');

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const result = parseSSEData('invalid json');

      expect(result).toBeNull();
    });

    it('should handle whitespace', () => {
      const result = parseSSEData('  [DONE]  ');

      expect(result).toBeNull();
    });
  });

  describe('extractDeltaContent', () => {
    it('should extract content from delta', () => {
      const data = {
        choices: [{ delta: { content: 'Hello' } }],
      };

      const result = extractDeltaContent(data);

      expect(result).toBe('Hello');
    });

    it('should return empty string when no content', () => {
      const data = {
        choices: [{ delta: {} }],
      };

      const result = extractDeltaContent(data);

      expect(result).toBe('');
    });

    it('should return empty string for empty choices', () => {
      const data = { choices: [] };

      const result = extractDeltaContent(data);

      expect(result).toBe('');
    });
  });

  describe('normalizeMiddlewares', () => {
    it('should return empty array for undefined', () => {
      expect(normalizeMiddlewares(undefined)).toEqual([]);
    });

    it('should wrap single middleware in array', () => {
      const middleware: RequestMiddleware = {
        onRequest: async (url, opts) => [url, opts],
      };

      const result = normalizeMiddlewares(middleware);

      expect(result).toHaveLength(1);
    });

    it('should return array as-is', () => {
      const middlewares: RequestMiddleware[] = [
        { onRequest: async (url, opts) => [url, opts] },
      ];

      const result = normalizeMiddlewares(middlewares);

      expect(result).toBe(middlewares);
    });
  });

  describe('mergeMiddlewares', () => {
    it('should merge global and instance middlewares', () => {
      const global: RequestMiddleware = {
        onRequest: async (url, opts) => [url, opts],
      };
      const instance: RequestMiddleware = { onResponse: async (res) => res };

      const result = mergeMiddlewares(global, instance);

      expect(result).toHaveLength(2);
    });

    it('should handle undefined middlewares', () => {
      const result = mergeMiddlewares(undefined, undefined);

      expect(result).toEqual([]);
    });
  });

  describe('executeRequestMiddlewares', () => {
    it('should execute middlewares in order', async () => {
      const order: number[] = [];
      const middlewares: RequestMiddleware[] = [
        {
          onRequest: async (url, opts) => {
            order.push(1);
            return [url + '?a=1', opts];
          },
        },
        {
          onRequest: async (url, opts) => {
            order.push(2);
            return [url + '&b=2', opts];
          },
        },
      ];

      const [url] = await executeRequestMiddlewares(
        middlewares,
        'https://api.example.com',
        {},
      );

      expect(order).toEqual([1, 2]);
      expect(url).toBe('https://api.example.com?a=1&b=2');
    });

    it('should skip middlewares without onRequest', async () => {
      const middlewares: RequestMiddleware[] = [
        { onResponse: async (res) => res },
      ];

      const [url] = await executeRequestMiddlewares(
        middlewares,
        'https://api.example.com',
        { method: 'GET' },
      );

      expect(url).toBe('https://api.example.com');
    });
  });

  describe('executeResponseMiddlewares', () => {
    it('should execute middlewares in order', async () => {
      const middlewares: RequestMiddleware[] = [
        {
          onResponse: async (res) => {
            return new Response('modified', { status: res.status });
          },
        },
      ];

      const response = await executeResponseMiddlewares(
        middlewares,
        new Response('original'),
      );

      expect(await response.text()).toBe('modified');
    });
  });
});

describe('providers/OpenAIChatProvider', () => {
  describe('initialization', () => {
    it('should create provider with default model', () => {
      const provider = new OpenAIChatProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      // Check that provider is created (internal state not directly accessible)
      expect(provider).toBeInstanceOf(OpenAIChatProvider);
    });
  });

  describe('transformParams', () => {
    it('should transform messages to OpenAI format', () => {
      const provider = new OpenAIChatProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4',
      });

      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createAt: Date.now(),
          updateAt: Date.now(),
        },
      ];

      const params = provider.transformParams(messages);

      expect(params.model).toBe('gpt-4');
      expect(params.messages).toHaveLength(1);
      expect(params.stream).toBe(true);
    });

    it('should include tools when configured', () => {
      const provider = new OpenAIChatProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4',
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        toolChoice: 'auto',
      });

      const params = provider.transformParams([]);

      expect(params.tools).toHaveLength(1);
      expect(params.tool_choice).toBe('auto');
    });
  });

  describe('transformLocalMessage', () => {
    it('should transform OpenAI params to local messages', () => {
      const provider = new OpenAIChatProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      const messages = provider.transformLocalMessage({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe('user');
      expect(messages[0]?.content).toBe('Hello');
    });
  });

  describe('transformMessage', () => {
    it('should return origin content on success', () => {
      const provider = new OpenAIChatProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      const result = provider.transformMessage({
        status: 'success',
        chunks: [],
        originMessage: { content: 'Final content' },
      });

      expect(result).toBe('Final content');
    });

    it('should append delta content', () => {
      const provider = new OpenAIChatProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      const result = provider.transformMessage({
        status: 'updating',
        chunk: {
          data: JSON.stringify({
            choices: [{ delta: { content: 'World' } }],
          }),
        },
        chunks: [],
        originMessage: { content: 'Hello ' },
      });

      expect(result).toBe('Hello World');
    });

    it('should accumulate tool calls', () => {
      const provider = new OpenAIChatProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      // First chunk with tool call start
      provider.transformMessage({
        status: 'updating',
        chunk: {
          data: JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'tc1',
                      type: 'function',
                      function: { name: 'get_weather', arguments: '{"' },
                    },
                  ],
                },
              },
            ],
          }),
        },
        chunks: [],
        originMessage: { content: '' },
      });

      // Second chunk with more arguments
      provider.transformMessage({
        status: 'updating',
        chunk: {
          data: JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: 'city":"' } },
                  ],
                },
              },
            ],
          }),
        },
        chunks: [],
        originMessage: { content: '' },
      });

      const toolCalls = provider.getToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]?.function.arguments).toBe('{"city":"');
    });
  });

  describe('tool calls management', () => {
    it('should clear tool calls', () => {
      const provider = new OpenAIChatProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      // Add a tool call
      provider.transformMessage({
        status: 'updating',
        chunk: {
          data: JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'tc1',
                      function: { name: 'test', arguments: '{}' },
                    },
                  ],
                },
              },
            ],
          }),
        },
        chunks: [],
        originMessage: { content: '' },
      });

      expect(provider.getToolCalls()).toHaveLength(1);

      provider.clearToolCalls();

      expect(provider.getToolCalls()).toHaveLength(0);
    });
  });

  describe('createOpenAIProvider helper', () => {
    it('should create provider instance', () => {
      const provider = createOpenAIProvider({
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      expect(provider).toBeInstanceOf(OpenAIChatProvider);
    });
  });
});

describe('providers/registry', () => {
  describe('ProviderRegistry', () => {
    it('should have built-in providers', () => {
      expect(ProviderRegistry.has('openai')).toBe(true);
      expect(ProviderRegistry.has('default')).toBe(true);
    });

    it('should list registered providers', () => {
      const list = ProviderRegistry.list();

      expect(list).toContain('openai');
      expect(list).toContain('default');
    });

    it('should create provider by name', () => {
      const provider = ProviderRegistry.create('openai', {
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      expect(provider).toBeInstanceOf(OpenAIChatProvider);
    });

    it('should throw for unknown provider', () => {
      expect(() => {
        ProviderRegistry.create('unknown', { baseURL: '' });
      }).toThrow(/Unknown provider/);
    });
  });

  describe('createProvider helper', () => {
    it('should create provider by type', () => {
      const provider = createProvider('openai', {
        baseURL: 'https://api.openai.com/v1/chat/completions',
      });

      expect(provider).toBeInstanceOf(OpenAIChatProvider);
    });
  });
});

describe('providers/globalConfig', () => {
  afterEach(() => {
    resetProviderGlobalConfig();
  });

  describe('setProviderGlobalConfig', () => {
    it('should set global headers', () => {
      setProviderGlobalConfig({
        headers: { 'X-Custom': 'value' },
      });

      const config = getProviderGlobalConfig();

      expect(config.headers?.['X-Custom']).toBe('value');
    });

    it('should set global timeout', () => {
      setProviderGlobalConfig({ timeout: 30000 });

      const config = getProviderGlobalConfig();

      expect(config.timeout).toBe(30000);
    });
  });

  describe('resetProviderGlobalConfig', () => {
    it('should reset to defaults', () => {
      setProviderGlobalConfig({
        timeout: 30000,
        headers: { 'X-Custom': 'value' },
      });

      resetProviderGlobalConfig();

      const config = getProviderGlobalConfig();

      expect(config.timeout).toBeUndefined();
      expect(config.headers).toEqual({ 'Content-Type': 'application/json' });
    });
  });
});
