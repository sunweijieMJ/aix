/**
 * @fileoverview Provider Utils 测试
 * 测试 Provider 工具函数
 */

import { describe, it, expect } from 'vitest';
import { getOriginContent } from '../src/providers/types';
import type { RequestMiddleware } from '../src/providers/types';
import {
  normalizeMiddlewares,
  mergeMiddlewares,
  executeRequestMiddlewares,
  executeResponseMiddlewares,
  toOpenAIContentParts,
  toOpenAIMessages,
  buildOpenAIParams,
  parseSSEData,
  extractDeltaContent,
} from '../src/providers/utils';
import type { ChatMessage, ContentType } from '../src/types';

describe('providers/utils', () => {
  describe('normalizeMiddlewares', () => {
    it('should return empty array for undefined', () => {
      expect(normalizeMiddlewares(undefined)).toEqual([]);
    });

    it('should return empty array for null-like values', () => {
      expect(normalizeMiddlewares(undefined)).toEqual([]);
    });

    it('should wrap single middleware in array', () => {
      const middleware: RequestMiddleware = {
        onRequest: async (url, options) => [url, options],
      };

      const result = normalizeMiddlewares(middleware);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(middleware);
    });

    it('should return array as-is', () => {
      const middlewares: RequestMiddleware[] = [
        { onRequest: async (url, options) => [url, options] },
        { onResponse: async (response) => response },
      ];

      const result = normalizeMiddlewares(middlewares);

      expect(result).toBe(middlewares);
    });
  });

  describe('mergeMiddlewares', () => {
    it('should return empty array when both undefined', () => {
      expect(mergeMiddlewares(undefined, undefined)).toEqual([]);
    });

    it('should return global middlewares when instance is undefined', () => {
      const global: RequestMiddleware = {
        onRequest: async (url, options) => [url, options],
      };

      const result = mergeMiddlewares(global, undefined);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(global);
    });

    it('should return instance middlewares when global is undefined', () => {
      const instance: RequestMiddleware = {
        onRequest: async (url, options) => [url, options],
      };

      const result = mergeMiddlewares(undefined, instance);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(instance);
    });

    it('should merge global before instance', () => {
      const global: RequestMiddleware = {
        onRequest: async (url, options) => [url + '?global', options],
      };
      const instance: RequestMiddleware = {
        onRequest: async (url, options) => [url + '&instance', options],
      };

      const result = mergeMiddlewares(global, instance);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(global);
      expect(result[1]).toBe(instance);
    });
  });

  describe('executeRequestMiddlewares', () => {
    it('should return original values when no middlewares', async () => {
      const [url, options] = await executeRequestMiddlewares(
        [],
        'http://test.com',
        { method: 'GET' },
      );

      expect(url).toBe('http://test.com');
      expect(options.method).toBe('GET');
    });

    it('should execute middleware chain in order', async () => {
      const middleware1: RequestMiddleware = {
        onRequest: async (url, options) => [url + '?a=1', options],
      };
      const middleware2: RequestMiddleware = {
        onRequest: async (url, options) => [url + '&b=2', options],
      };

      const [url] = await executeRequestMiddlewares(
        [middleware1, middleware2],
        'http://test.com',
        {},
      );

      expect(url).toBe('http://test.com?a=1&b=2');
    });

    it('should modify options through chain', async () => {
      const middleware: RequestMiddleware = {
        onRequest: async (url, options) => [
          url,
          { ...options, headers: { Authorization: 'Bearer token' } },
        ],
      };

      const [, options] = await executeRequestMiddlewares(
        [middleware],
        'http://test.com',
        {},
      );

      expect((options.headers as Record<string, string>).Authorization).toBe(
        'Bearer token',
      );
    });

    it('should skip middlewares without onRequest', async () => {
      const middleware: RequestMiddleware = {
        onResponse: async (response) => response,
      };

      const [url] = await executeRequestMiddlewares(
        [middleware],
        'http://test.com',
        {},
      );

      expect(url).toBe('http://test.com');
    });
  });

  describe('executeResponseMiddlewares', () => {
    it('should return original response when no middlewares', async () => {
      const response = new Response('test');

      const result = await executeResponseMiddlewares([], response);

      expect(result).toBe(response);
    });

    it('should execute middleware chain in order', async () => {
      const middleware1: RequestMiddleware = {
        onResponse: async (response) => {
          const text = await response.text();
          return new Response(text + '-m1');
        },
      };
      const middleware2: RequestMiddleware = {
        onResponse: async (response) => {
          const text = await response.text();
          return new Response(text + '-m2');
        },
      };

      const result = await executeResponseMiddlewares(
        [middleware1, middleware2],
        new Response('original'),
      );

      expect(await result.text()).toBe('original-m1-m2');
    });

    it('should skip middlewares without onResponse', async () => {
      const middleware: RequestMiddleware = {
        onRequest: async (url, options) => [url, options],
      };
      const response = new Response('test');

      const result = await executeResponseMiddlewares([middleware], response);

      expect(result).toBe(response);
    });
  });

  describe('toOpenAIContentParts', () => {
    it('should convert text content', () => {
      const content = [{ type: 'text' as const, text: 'Hello' }];

      const result = toOpenAIContentParts(content);

      expect(result).toEqual([{ type: 'text', text: 'Hello' }]);
    });

    it('should convert image_url content', () => {
      const content = [
        {
          type: 'image_url' as const,
          image_url: {
            url: 'data:image/png;base64,...',
            detail: 'auto' as const,
          },
        },
      ];

      const result = toOpenAIContentParts(content);

      expect(result).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,...', detail: 'auto' },
        },
      ]);
    });

    it('should convert file content to text description', () => {
      const content = [
        {
          type: 'file' as const,
          file: {
            url: 'file://document.pdf',
            name: 'document.pdf',
            mimeType: 'application/pdf',
          },
        },
      ];

      const result = toOpenAIContentParts(content);

      expect(result).toEqual([{ type: 'text', text: '[文件: document.pdf]' }]);
    });

    it('should filter out unsupported types', () => {
      const content = [
        { type: 'text' as const, text: 'Hello' },
        { type: 'unknown', data: 'test' },
      ] as unknown as ContentType[];

      const result = toOpenAIContentParts(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'text', text: 'Hello' });
    });

    it('should handle mixed content', () => {
      const content = [
        { type: 'text' as const, text: 'Describe this:' },
        {
          type: 'image_url' as const,
          image_url: { url: 'http://example.com/img.jpg' },
        },
      ];

      const result = toOpenAIContentParts(content);

      expect(result).toHaveLength(2);
      expect(result[0]?.type).toBe('text');
      expect(result[1]?.type).toBe('image_url');
    });
  });

  describe('toOpenAIMessages', () => {
    it('should convert string content messages', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should handle null content', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: null as unknown as string,
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(result).toEqual([{ role: 'assistant', content: '' }]);
    });

    it('should handle undefined content', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: undefined as unknown as string,
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(result).toEqual([{ role: 'assistant', content: '' }]);
    });

    it('should handle empty array content', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: [],
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(result).toEqual([{ role: 'user', content: '' }]);
    });

    it('should simplify text-only array to string', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'World' },
          ],
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        },
      ];

      const result = toOpenAIMessages(messages);

      // toStringContent joins text parts with newline
      expect(result[0]?.content).toBe('Hello \nWorld');
    });

    it('should keep multimodal content as array', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: [
            { type: 'text', text: 'Describe:' },
            {
              type: 'image_url',
              image_url: { url: 'http://example.com/img.jpg' },
            },
          ],
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        },
      ];

      const result = toOpenAIMessages(messages);

      expect(Array.isArray(result[0]?.content)).toBe(true);
      expect((result[0]?.content as unknown[]).length).toBe(2);
    });
  });

  describe('buildOpenAIParams', () => {
    it('should build basic params', () => {
      const config = { model: 'gpt-4' };
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      const result = buildOpenAIParams(config, messages, true);

      expect(result).toEqual({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });
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
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      const result = buildOpenAIParams(config, messages, false);

      expect(result.temperature).toBe(0.7);
      expect(result.max_tokens).toBe(1000);
      expect(result.top_p).toBe(0.9);
      expect(result.frequency_penalty).toBe(0.5);
      expect(result.presence_penalty).toBe(0.5);
      expect(result.stop).toEqual(['END']);
      expect(result.stream).toBe(false);
    });

    it('should merge additional options', () => {
      const config = { model: 'gpt-4' };
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const options = { user: 'test-user', custom_field: 'value' };

      const result = buildOpenAIParams(config, messages, true, options);

      expect(result.user).toBe('test-user');
      expect(result.custom_field).toBe('value');
    });

    it('should not include undefined optional params', () => {
      const config = { model: 'gpt-4', temperature: undefined };
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      const result = buildOpenAIParams(config, messages, true);

      expect('temperature' in result).toBe(false);
    });
  });

  describe('parseSSEData', () => {
    it('should parse valid JSON', () => {
      const result = parseSSEData<{ message: string }>('{"message":"hello"}');

      expect(result).toEqual({ message: 'hello' });
    });

    it('should return null for [DONE]', () => {
      expect(parseSSEData('[DONE]')).toBeNull();
      expect(parseSSEData('  [DONE]  ')).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      expect(parseSSEData('not json')).toBeNull();
      expect(parseSSEData('{ invalid }')).toBeNull();
    });

    it('should trim whitespace before parsing', () => {
      const result = parseSSEData<{ a: number }>('  {"a":1}  ');
      expect(result).toEqual({ a: 1 });
    });
  });

  describe('extractDeltaContent', () => {
    it('should extract delta content', () => {
      const data = {
        choices: [
          {
            delta: {
              content: 'Hello',
            },
          },
        ],
      };

      expect(extractDeltaContent(data)).toBe('Hello');
    });

    it('should return empty string for missing choices', () => {
      expect(extractDeltaContent({})).toBe('');
      expect(extractDeltaContent({ choices: [] })).toBe('');
    });

    it('should return empty string for missing delta', () => {
      const data = {
        choices: [{}],
      };

      expect(extractDeltaContent(data)).toBe('');
    });

    it('should return empty string for missing content', () => {
      const data = {
        choices: [{ delta: {} }],
      };

      expect(extractDeltaContent(data)).toBe('');
    });

    it('should handle undefined content', () => {
      const data = {
        choices: [{ delta: { content: undefined } }],
      };

      expect(extractDeltaContent(data)).toBe('');
    });
  });

  describe('getOriginContent', () => {
    it('should return content from originMessage', () => {
      const info = {
        originMessage: { content: 'Hello World' },
        chunks: [],
        status: 'loading' as const,
      };

      expect(getOriginContent(info)).toBe('Hello World');
    });

    it('should return empty string when originMessage is undefined', () => {
      const info = {
        chunks: [],
        status: 'loading' as const,
      };

      expect(getOriginContent(info)).toBe('');
    });

    it('should return empty string when content is undefined', () => {
      const info = {
        originMessage: {},
        chunks: [],
        status: 'loading' as const,
      };

      expect(getOriginContent(info)).toBe('');
    });

    it('should return empty string for null content', () => {
      const info = {
        originMessage: { content: undefined },
        chunks: [],
        status: 'loading' as const,
      };

      expect(getOriginContent(info)).toBe('');
    });
  });
});
