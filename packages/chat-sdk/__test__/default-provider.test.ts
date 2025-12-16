/**
 * @fileoverview DefaultChatProvider 测试
 * 测试默认 Chat Provider 实现
 */

import { describe, it, expect } from 'vitest';
import {
  DefaultChatProvider,
  createDefaultProvider,
} from '../src/providers/DefaultChatProvider';
import type { ChatMessage } from '../src/types';
import type { SSEOutput } from '../src/utils/stream';

describe('providers/DefaultChatProvider', () => {
  const createTestMessages = (): ChatMessage[] => [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      createAt: Date.now(),
      updateAt: Date.now(),
      status: 'success',
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      createAt: Date.now(),
      updateAt: Date.now(),
      status: 'success',
    },
  ];

  describe('initialization', () => {
    it('should create provider with config', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });

      expect(provider).toBeInstanceOf(DefaultChatProvider);
    });

    it('should accept custom transform functions', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
        transformParams: (messages) => ({ custom: messages.length }),
        parseResponse: (chunk) => chunk.data || '',
      });

      expect(provider).toBeInstanceOf(DefaultChatProvider);
    });
  });

  describe('transformParams', () => {
    it('should use default transform', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const messages = createTestMessages();

      const params = provider.transformParams(messages);

      expect(params.messages).toBeDefined();
      expect(params.stream).toBe(true);
      expect(
        (params.messages as Array<{ role: string; content: string }>)[0]?.role,
      ).toBe('user');
      expect(
        (params.messages as Array<{ role: string; content: string }>)[0]
          ?.content,
      ).toBe('Hello');
    });

    it('should include additional options', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const messages = createTestMessages();

      const params = provider.transformParams(messages, { temperature: 0.7 });

      expect(params.temperature).toBe(0.7);
    });

    it('should use custom transformParams function', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
        transformParams: (messages) => ({
          customMessages: messages.map((m) => m.content),
          customField: true,
        }),
      });
      const messages = createTestMessages();

      const params = provider.transformParams(messages);

      expect(params.customMessages).toEqual(['Hello', 'Hi there!']);
      expect(params.customField).toBe(true);
      expect(params.messages).toBeUndefined();
    });

    it('should respect stream config', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
        stream: false,
      });
      const messages = createTestMessages();

      const params = provider.transformParams(messages);

      expect(params.stream).toBe(false);
    });
  });

  describe('transformLocalMessage', () => {
    it('should transform input to ChatMessage array', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const input = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
      };

      const messages = provider.transformLocalMessage(input);

      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe('user');
      expect(messages[0]?.content).toBe('Hello');
      expect(messages[0]?.id).toBeDefined();
      expect(messages[0]?.status).toBe('success');
    });

    it('should handle empty messages', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });

      const messages = provider.transformLocalMessage({});

      expect(messages).toEqual([]);
    });

    it('should generate unique IDs', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const input = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'user', content: 'World' },
        ],
      };

      const messages = provider.transformLocalMessage(input);

      expect(messages[0]?.id).not.toBe(messages[1]?.id);
    });
  });

  describe('transformMessage', () => {
    it('should return origin content on success status', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });

      const result = provider.transformMessage({
        status: 'success',
        originMessage: { content: 'Complete message' },
        chunks: [],
      });

      expect(result).toBe('Complete message');
    });

    it('should parse data field from chunk', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const chunk: SSEOutput = { data: 'Hello' };

      const result = provider.transformMessage({
        chunk,
        status: 'loading',
        originMessage: { content: '' },
        chunks: [chunk],
      });

      expect(result).toBe('Hello');
    });

    it('should append to origin content', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const chunk: SSEOutput = { data: 'World' };

      const result = provider.transformMessage({
        chunk,
        status: 'loading',
        originMessage: { content: 'Hello' },
        chunks: [chunk],
      });

      expect(result).toBe('HelloWorld');
    });

    it('should handle [DONE] marker', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const chunk: SSEOutput = { data: '[DONE]' };

      const result = provider.transformMessage({
        chunk,
        status: 'loading',
        originMessage: { content: 'Complete' },
        chunks: [chunk],
      });

      expect(result).toBe('Complete');
    });

    it('should use custom parseResponse function', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
        parseResponse: (chunk) => {
          if (chunk.data) {
            const parsed = JSON.parse(chunk.data) as { content: string };
            return parsed.content;
          }
          return '';
        },
      });
      const chunk: SSEOutput = { data: '{"content":"parsed content"}' };

      const result = provider.transformMessage({
        chunk,
        status: 'loading',
        originMessage: { content: '' },
        chunks: [chunk],
      });

      expect(result).toBe('parsed content');
    });

    it('should return origin content when no chunk', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });

      const result = provider.transformMessage({
        status: 'loading',
        originMessage: { content: 'Existing' },
        chunks: [],
      });

      expect(result).toBe('Existing');
    });

    it('should trim data before checking [DONE]', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const chunk: SSEOutput = { data: '  [DONE]  ' };

      const result = provider.transformMessage({
        chunk,
        status: 'loading',
        originMessage: { content: 'Message' },
        chunks: [chunk],
      });

      expect(result).toBe('Message');
    });
  });

  describe('createDefaultProvider helper', () => {
    it('should create provider instance', () => {
      const provider = createDefaultProvider({
        baseURL: '/api/chat',
      });

      expect(provider).toBeInstanceOf(DefaultChatProvider);
    });

    it('should pass config to provider', () => {
      const transformParams = (messages: ChatMessage[]) => ({
        count: messages.length,
      });
      const provider = createDefaultProvider({
        baseURL: '/api/chat',
        transformParams,
      });

      const params = provider.transformParams(createTestMessages());

      expect(params.count).toBe(2);
    });
  });

  describe('integration with content types', () => {
    it('should handle string content', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Simple string',
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        },
      ];

      const params = provider.transformParams(messages);
      const transformed = params.messages as Array<{ content: string }>;

      expect(transformed[0]?.content).toBe('Simple string');
    });

    it('should handle array content (multimodal)', () => {
      const provider = new DefaultChatProvider({
        baseURL: '/api/chat',
      });
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,...' },
            },
          ],
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        },
      ];

      const params = provider.transformParams(messages);
      const transformed = params.messages as Array<{ content: string }>;

      // toStringContent should convert array to string representation
      expect(typeof transformed[0]?.content).toBe('string');
    });
  });
});
