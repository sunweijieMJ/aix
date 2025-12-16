/**
 * @fileoverview Stream 工具测试
 * 测试 XStream、splitStream、splitPart 等流处理工具
 */

import { describe, it, expect } from 'vitest';
import { isValidString } from '../src/utils/stream/helpers';
import { splitPart, createSplitPart } from '../src/utils/stream/splitPart';
import {
  splitStream,
  createSplitStream,
} from '../src/utils/stream/splitStream';
import { DEFAULT_SEPARATORS } from '../src/utils/stream/types';
import {
  XStream,
  createSSEStream,
  createCustomStream,
  createNDJSONTransformer,
} from '../src/utils/stream/XStream';

describe('utils/stream', () => {
  /**
   * Helper: 创建模拟的 ReadableStream
   */
  function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;

    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]!));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  /**
   * Helper: 收集流中的所有数据
   */
  async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
    const reader = stream.getReader();
    const results: T[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    return results;
  }

  describe('helpers', () => {
    describe('isValidString', () => {
      it('should return true for non-empty strings', () => {
        expect(isValidString('hello')).toBe(true);
        expect(isValidString('  hello  ')).toBe(true);
        expect(isValidString('a')).toBe(true);
      });

      it('should return false for empty strings', () => {
        expect(isValidString('')).toBe(false);
      });

      it('should return false for whitespace-only strings', () => {
        expect(isValidString('   ')).toBe(false);
        expect(isValidString('\n')).toBe(false);
        expect(isValidString('\t')).toBe(false);
        expect(isValidString('\n\t  ')).toBe(false);
      });
    });
  });

  describe('DEFAULT_SEPARATORS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SEPARATORS.streamSeparator).toBe('\n\n');
      expect(DEFAULT_SEPARATORS.partSeparator).toBe('\n');
      expect(DEFAULT_SEPARATORS.kvSeparator).toBe(':');
    });
  });

  describe('splitStream', () => {
    it('should split by double newline', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            'event: delta\ndata: hello\n\nevent: delta\ndata: world\n\n',
          );
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitStream());
      const results = await collectStream(stream);

      expect(results).toHaveLength(2);
      expect(results[0]).toBe('event: delta\ndata: hello');
      expect(results[1]).toBe('event: delta\ndata: world');
    });

    it('should handle chunks split across boundaries', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('event: delta\ndata: hel');
          controller.enqueue('lo\n\nevent: done');
          controller.enqueue('\ndata: world\n\n');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitStream());
      const results = await collectStream(stream);

      expect(results).toHaveLength(2);
      expect(results[0]).toBe('event: delta\ndata: hello');
      expect(results[1]).toBe('event: done\ndata: world');
    });

    it('should use custom separator', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('part1|||part2|||');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitStream('|||'));
      const results = await collectStream(stream);

      expect(results).toHaveLength(2);
      expect(results[0]).toBe('part1');
      expect(results[1]).toBe('part2');
    });

    it('should flush remaining data on close', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('event: delta\ndata: hello\n\nevent: done');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitStream());
      const results = await collectStream(stream);

      expect(results).toHaveLength(2);
      expect(results[1]).toBe('event: done');
    });

    it('should ignore empty parts', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('\n\nevent: delta\n\n\n\n');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitStream());
      const results = await collectStream(stream);

      expect(results).toHaveLength(1);
      expect(results[0]).toBe('event: delta');
    });
  });

  describe('createSplitStream', () => {
    it('should create splitStream with default config', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('a\n\nb\n\n');
          controller.close();
        },
      });

      const stream = input.pipeThrough(createSplitStream());
      const results = await collectStream(stream);

      expect(results).toEqual(['a', 'b']);
    });

    it('should accept custom separator', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('a--b--');
          controller.close();
        },
      });

      const stream = input.pipeThrough(createSplitStream({ separator: '--' }));
      const results = await collectStream(stream);

      expect(results).toEqual(['a', 'b']);
    });
  });

  describe('splitPart', () => {
    it('should parse SSE event', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('event: delta\ndata: hello world');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitPart());
      const results = await collectStream(stream);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        event: 'delta',
        data: 'hello world',
      });
    });

    it('should parse multiple fields', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            'event: message\ndata: test\nid: 123\nretry: 5000',
          );
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitPart());
      const results = await collectStream(stream);

      expect(results[0]).toEqual({
        event: 'message',
        data: 'test',
        id: '123',
        retry: '5000',
      });
    });

    it('should handle space after colon', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('data: with space\nevent:no space');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitPart());
      const results = await collectStream(stream);

      expect(results[0]).toEqual({
        data: 'with space',
        event: 'no space',
      });
    });

    it('should skip comment lines', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(':this is a comment\ndata: actual data');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitPart());
      const results = await collectStream(stream);

      expect(results[0]).toEqual({ data: 'actual data' });
    });

    it('should skip lines without colon', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('invalid line\ndata: valid');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitPart());
      const results = await collectStream(stream);

      expect(results[0]).toEqual({ data: 'valid' });
    });

    it('should not emit empty objects', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(':comment only');
          controller.close();
        },
      });

      const stream = input.pipeThrough(splitPart());
      const results = await collectStream(stream);

      expect(results).toHaveLength(0);
    });

    it('should use custom separators', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('event=delta|data=hello');
          controller.close();
        },
      });

      const stream = input.pipeThrough(
        splitPart({ partSeparator: '|', kvSeparator: '=' }),
      );
      const results = await collectStream(stream);

      expect(results[0]).toEqual({ event: 'delta', data: 'hello' });
    });
  });

  describe('createSplitPart', () => {
    it('should create splitPart with default config', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('data: test');
          controller.close();
        },
      });

      const stream = input.pipeThrough(createSplitPart());
      const results = await collectStream(stream);

      expect(results[0]).toEqual({ data: 'test' });
    });
  });

  describe('XStream', () => {
    it('should throw if readableStream is not a ReadableStream', () => {
      expect(() => {
        XStream({ readableStream: {} as ReadableStream<Uint8Array> });
      }).toThrow(
        '[XStream] options.readableStream must be an instance of ReadableStream',
      );
    });

    it('should parse SSE stream', async () => {
      const mockStream = createMockStream([
        'event: delta\ndata: hello\n\n',
        'event: delta\ndata: world\n\n',
      ]);

      const stream = XStream({ readableStream: mockStream });
      const results: unknown[] = [];

      for await (const event of stream) {
        results.push(event);
      }

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ event: 'delta', data: 'hello' });
      expect(results[1]).toEqual({ event: 'delta', data: 'world' });
    });

    it('should support custom transformer', async () => {
      const mockStream = createMockStream(['{"a":1}\n{"b":2}\n']);

      const ndjsonTransformer = new TransformStream<string, unknown>({
        transform(chunk, controller) {
          chunk
            .split('\n')
            .filter((line) => line.trim())
            .forEach((line) => controller.enqueue(JSON.parse(line)));
        },
      });

      const stream = XStream({
        readableStream: mockStream,
        transformStream: ndjsonTransformer,
      });

      const results: unknown[] = [];
      for await (const event of stream) {
        results.push(event);
      }

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ a: 1 });
      expect(results[1]).toEqual({ b: 2 });
    });

    it('should support async iteration', async () => {
      const mockStream = createMockStream(['data: test\n\n']);
      const stream = XStream({ readableStream: mockStream });

      const iterator = stream[Symbol.asyncIterator]();
      const result = await iterator.next();

      expect(result.done).toBe(false);
      expect(result.value).toEqual({ data: 'test' });
    });
  });

  describe('createSSEStream', () => {
    it('should throw if response body is empty', () => {
      const response = { body: null } as Response;

      expect(() => createSSEStream(response)).toThrow(
        '[XStream] Response body is empty',
      );
    });

    it('should create SSE stream from response', async () => {
      const mockBody = createMockStream(['data: hello\n\n']);
      const response = { body: mockBody } as Response;

      const stream = createSSEStream(response);
      const results: unknown[] = [];

      for await (const event of stream) {
        results.push(event);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ data: 'hello' });
    });
  });

  describe('createCustomStream', () => {
    it('should throw if response body is empty', () => {
      const response = { body: null } as Response;
      const transformer = new TransformStream<string, unknown>();

      expect(() => createCustomStream(response, transformer)).toThrow(
        '[XStream] Response body is empty',
      );
    });

    it('should create custom stream from response', async () => {
      const mockBody = createMockStream(['line1\nline2\n']);
      const response = { body: mockBody } as Response;

      const lineTransformer = new TransformStream<string, string>({
        transform(chunk, controller) {
          chunk
            .split('\n')
            .filter((l) => l.trim())
            .forEach((l) => controller.enqueue(l));
        },
      });

      const stream = createCustomStream(response, lineTransformer);
      const results: string[] = [];

      for await (const line of stream) {
        results.push(line);
      }

      expect(results).toEqual(['line1', 'line2']);
    });
  });

  describe('createNDJSONTransformer', () => {
    it('should parse NDJSON lines', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('{"name":"Alice"}\n{"name":"Bob"}\n');
          controller.close();
        },
      });

      const stream = input.pipeThrough(
        createNDJSONTransformer<{ name: string }>(),
      );
      const results = await collectStream(stream);

      expect(results).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
    });

    it('should handle chunks split across lines', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('{"na');
          controller.enqueue('me":"Alice"}\n{"name":"Bob"}');
          controller.enqueue('\n');
          controller.close();
        },
      });

      const stream = input.pipeThrough(createNDJSONTransformer());
      const results = await collectStream(stream);

      expect(results).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
    });

    it('should flush remaining buffer on close', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('{"complete":true}');
          controller.close();
        },
      });

      const stream = input.pipeThrough(createNDJSONTransformer());
      const results = await collectStream(stream);

      expect(results).toEqual([{ complete: true }]);
    });

    it('should ignore empty lines', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('{"a":1}\n\n\n{"b":2}\n');
          controller.close();
        },
      });

      const stream = input.pipeThrough(createNDJSONTransformer());
      const results = await collectStream(stream);

      expect(results).toEqual([{ a: 1 }, { b: 2 }]);
    });

    it('should skip invalid JSON lines', async () => {
      const input = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            '{"valid":true}\ninvalid json\n{"also":"valid"}\n',
          );
          controller.close();
        },
      });

      const stream = input.pipeThrough(createNDJSONTransformer());
      const results = await collectStream(stream);

      expect(results).toEqual([{ valid: true }, { also: 'valid' }]);
    });
  });
});
