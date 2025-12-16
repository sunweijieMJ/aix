/**
 * @fileoverview XStreamClient 测试
 * 测试流式请求客户端
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SSEOutput } from '../src/utils/stream';
import {
  XStreamClient,
  streamRequest,
  streamSSE,
  createStreamIterator,
  SUPPORTED_MIME_TYPES,
} from '../src/utils/xstream';

describe('utils/xstream', () => {
  /**
   * Helper: 创建模拟的 SSE Response
   */
  function createSSEResponse(
    data: string,
    options: { contentType?: string; status?: number } = {},
  ): Response {
    const { contentType = 'text/event-stream', status = 200 } = options;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(data));
        controller.close();
      },
    });

    return new Response(stream, {
      status,
      headers: { 'Content-Type': contentType },
    });
  }

  /**
   * Helper: 创建模拟的 JSON Response
   */
  function createJSONResponse(
    data: unknown,
    options: { status?: number } = {},
  ): Response {
    const { status = 200 } = options;

    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  describe('SUPPORTED_MIME_TYPES', () => {
    it('should include expected mime types', () => {
      expect(SUPPORTED_MIME_TYPES).toContain('text/event-stream');
      expect(SUPPORTED_MIME_TYPES).toContain('application/json');
      expect(SUPPORTED_MIME_TYPES).toContain('text/plain');
      expect(SUPPORTED_MIME_TYPES).toContain('application/octet-stream');
    });
  });

  describe('XStreamClient', () => {
    let client: XStreamClient;

    beforeEach(() => {
      client = new XStreamClient();
    });

    describe('initial state', () => {
      it('should have correct initial state', () => {
        expect(client.isRequesting).toBe(false);
        expect(client.aborted).toBe(false);
        expect(client.isTimeout).toBe(false);
        expect(client.isStreamTimeout).toBe(false);
      });
    });

    describe('request - SSE', () => {
      it('should parse SSE stream', async () => {
        const mockFetch = vi
          .fn()
          .mockResolvedValue(
            createSSEResponse('data: hello\n\ndata: world\n\n'),
          );
        const onChunk = vi.fn();
        const onSuccess = vi.fn();

        const chunks = await client.request({
          url: 'http://test.com/stream',
          fetch: mockFetch,
          onChunk,
          onSuccess,
        });

        expect(chunks).toHaveLength(2);
        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onSuccess).toHaveBeenCalledTimes(1);
        // Check that onSuccess was called with chunks array
        expect(onSuccess.mock.calls[0]?.[0]).toEqual(chunks);
      });

      it('should set isRequesting during request', async () => {
        let wasRequesting = false;
        const mockFetch = vi.fn().mockImplementation(async () => {
          wasRequesting = client.isRequesting;
          return createSSEResponse('data: test\n\n');
        });

        await client.request({
          url: 'http://test.com/stream',
          fetch: mockFetch,
        });

        expect(wasRequesting).toBe(true);
        expect(client.isRequesting).toBe(false);
      });
    });

    describe('request - JSON', () => {
      it('should handle JSON response', async () => {
        const mockFetch = vi
          .fn()
          .mockResolvedValue(
            createJSONResponse({ message: 'Hello', data: [1, 2, 3] }),
          );
        const onChunk = vi.fn();
        const onSuccess = vi.fn();

        const chunks = await client.request({
          url: 'http://test.com/api',
          fetch: mockFetch,
          onChunk,
          onSuccess,
        });

        expect(chunks).toHaveLength(1);
        expect((chunks[0] as { message: string }).message).toBe('Hello');
        expect(onChunk).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalled();
      });

      it('should handle JSON error response', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          createJSONResponse({
            success: false,
            message: 'Invalid request',
            name: 'ValidationError',
          }),
        );
        const onError = vi.fn();

        await expect(
          client.request({
            url: 'http://test.com/api',
            fetch: mockFetch,
            onError,
          }),
        ).rejects.toThrow('Invalid request');

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'ValidationError' }),
          expect.anything(),
        );
      });
    });

    describe('request - errors', () => {
      it('should handle HTTP error', async () => {
        const mockFetch = vi
          .fn()
          .mockResolvedValue(new Response('Not Found', { status: 404 }));
        const onError = vi.fn();

        await expect(
          client.request({
            url: 'http://test.com/api',
            fetch: mockFetch,
            onError,
          }),
        ).rejects.toThrow('HTTP error! status: 404');

        expect(onError).toHaveBeenCalled();
      });

      it('should handle empty response body', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(null, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
        const onError = vi.fn();

        await expect(
          client.request({
            url: 'http://test.com/api',
            fetch: mockFetch,
            onError,
          }),
        ).rejects.toThrow('Response body is empty');
      });

      it('should handle unsupported content-type', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response('test', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        );
        const onError = vi.fn();

        await expect(
          client.request({
            url: 'http://test.com/api',
            fetch: mockFetch,
            onError,
          }),
        ).rejects.toThrow('Unsupported content-type');
      });
    });

    describe('abort', () => {
      it('should abort request', async () => {
        const mockFetch = vi.fn().mockImplementation(
          () =>
            new Promise((_, reject) => {
              setTimeout(() => {
                const error = new Error('Aborted');
                error.name = 'AbortError';
                reject(error);
              }, 100);
            }),
        );

        const promise = client.request({
          url: 'http://test.com/stream',
          fetch: mockFetch,
        });

        client.abort();

        expect(client.aborted).toBe(true);
        await expect(promise).resolves.toEqual([]);
      });
    });

    describe('timeout', () => {
      it('should timeout on request', async () => {
        vi.useFakeTimers();

        const mockFetch = vi.fn().mockImplementation(
          () => new Promise(() => {}), // Never resolves
        );
        const onError = vi.fn();

        // Start request (will timeout)
        void client.request({
          url: 'http://test.com/stream',
          fetch: mockFetch,
          timeout: 1000,
          onError,
        });

        vi.advanceTimersByTime(1000);

        // Wait for the error callback
        await vi.runAllTimersAsync();

        expect(client.isTimeout).toBe(true);
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'TimeoutError' }),
        );

        vi.useRealTimers();
      });
    });

    describe('requestSSE', () => {
      it('should be alias for request with SSE type', async () => {
        const mockFetch = vi
          .fn()
          .mockResolvedValue(createSSEResponse('data: test\n\n'));

        const chunks = await client.requestSSE({
          url: 'http://test.com/stream',
          // @ts-expect-error - custom fetch for testing
          fetch: mockFetch,
        });

        expect(chunks).toHaveLength(1);
        expect(chunks[0]?.data).toBe('test');
      });
    });

    describe('middlewares', () => {
      it('should apply request middlewares', async () => {
        const mockFetch = vi
          .fn()
          .mockResolvedValue(createSSEResponse('data: test\n\n'));

        await client.request({
          url: 'http://test.com/stream',
          fetch: mockFetch,
          middlewares: {
            onRequest: async (url, options) => [
              url + '?token=abc',
              {
                ...options,
                headers: {
                  ...(options.headers as Record<string, string>),
                  'X-Custom': 'value',
                },
              },
            ],
          },
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://test.com/stream?token=abc',
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom': 'value',
            }),
          }),
        );
      });
    });

    describe('custom transformStream', () => {
      it('should use static transformStream', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          createSSEResponse('{"line":1}\n{"line":2}\n', {
            contentType: 'application/x-ndjson',
          }),
        );

        const ndjsonTransformer = new TransformStream<string, { line: number }>(
          {
            transform(chunk, controller) {
              chunk
                .split('\n')
                .filter((l) => l.trim())
                .forEach((l) => controller.enqueue(JSON.parse(l)));
            },
          },
        );

        const chunks = await client.request<{ line: number }>({
          url: 'http://test.com/stream',
          fetch: mockFetch,
          transformStream: ndjsonTransformer,
        });

        expect(chunks).toHaveLength(2);
        expect(chunks[0]?.line).toBe(1);
        expect(chunks[1]?.line).toBe(2);
      });

      it('should use dynamic transformStream factory', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          createSSEResponse('{"data":"test"}\n', {
            contentType: 'application/x-ndjson',
          }),
        );

        const chunks = await client.request({
          url: 'http://test.com/stream',
          fetch: mockFetch,
          transformStream: (info) => {
            expect(info.baseURL).toBe('http://test.com/stream');
            expect(info.statusCode).toBe(200);
            expect(info.contentType).toBe('application/x-ndjson');

            return new TransformStream({
              transform(chunk, controller) {
                chunk
                  .split('\n')
                  .filter((l) => l.trim())
                  .forEach((l) => controller.enqueue(JSON.parse(l)));
              },
            });
          },
        });

        expect(chunks).toHaveLength(1);
      });
    });
  });

  describe('streamRequest', () => {
    it('should create client and make request', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createSSEResponse('data: hello\n\n'));

      // Mock global fetch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const chunks = await streamRequest('http://test.com/stream');

        expect(chunks).toHaveLength(1);
        expect((chunks[0] as SSEOutput).data).toBe('hello');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('streamSSE', () => {
    it('should make SSE request', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createSSEResponse('event: message\ndata: test\n\n'));

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const chunks = await streamSSE('http://test.com/events');

        expect(chunks).toHaveLength(1);
        expect(chunks[0]?.event).toBe('message');
        expect(chunks[0]?.data).toBe('test');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('createStreamIterator', () => {
    it('should create async iterator from response', async () => {
      const response = createSSEResponse('data: chunk1\n\ndata: chunk2\n\n');

      const iterator = createStreamIterator(response);
      const chunks: SSEOutput[] = [];

      for await (const chunk of iterator) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]?.data).toBe('chunk1');
      expect(chunks[1]?.data).toBe('chunk2');
    });
  });
});
