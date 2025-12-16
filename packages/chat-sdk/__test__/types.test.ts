/**
 * @fileoverview Types 模块测试
 * 测试 message 和 guards 相关的类型工具函数
 */

import { describe, it, expect } from 'vitest';
import type { ChatMessage, ContentType } from '../src/types';
import {
  isStringContent,
  isMultiModalContent,
  isTextContent,
  getMessageContent,
  toStringContent,
} from '../src/types/guards';
import {
  serializeError,
  isMessageActive,
  isMessageRetryable,
  MESSAGE_STATUS_TRANSITIONS,
  type SerializedError,
} from '../src/types/message';

describe('types/message', () => {
  describe('serializeError', () => {
    it('should serialize Error object', () => {
      const error = new Error('Test error');
      error.name = 'TestError';

      const serialized = serializeError(error);

      expect(serialized.message).toBe('Test error');
      expect(serialized.name).toBe('TestError');
      expect(serialized.stack).toBeDefined();
    });

    it('should handle Error with code property', () => {
      const error = new Error('HTTP error') as Error & { code: string };
      error.code = 'ECONNREFUSED';

      const serialized = serializeError(error);

      expect(serialized.code).toBe('ECONNREFUSED');
    });

    it('should return SerializedError as-is', () => {
      const serializedError: SerializedError = {
        message: 'Already serialized',
        name: 'SerializedError',
        stack: 'fake stack',
      };

      const result = serializeError(serializedError);

      expect(result).toBe(serializedError);
      expect(result.message).toBe('Already serialized');
    });

    it('should handle Error subclasses', () => {
      const error = new TypeError('Type mismatch');

      const serialized = serializeError(error);

      expect(serialized.name).toBe('TypeError');
      expect(serialized.message).toBe('Type mismatch');
    });
  });

  describe('isMessageActive', () => {
    it('should return true for active statuses', () => {
      expect(isMessageActive('local')).toBe(true);
      expect(isMessageActive('loading')).toBe(true);
      expect(isMessageActive('streaming')).toBe(true);
    });

    it('should return false for terminal statuses', () => {
      expect(isMessageActive('success')).toBe(false);
      expect(isMessageActive('error')).toBe(false);
      expect(isMessageActive('cancelled')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isMessageActive(undefined)).toBe(false);
    });
  });

  describe('isMessageRetryable', () => {
    it('should return true for retryable statuses', () => {
      expect(isMessageRetryable('error')).toBe(true);
      expect(isMessageRetryable('cancelled')).toBe(true);
    });

    it('should return false for non-retryable statuses', () => {
      expect(isMessageRetryable('local')).toBe(false);
      expect(isMessageRetryable('loading')).toBe(false);
      expect(isMessageRetryable('streaming')).toBe(false);
      expect(isMessageRetryable('success')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isMessageRetryable(undefined)).toBe(false);
    });
  });

  describe('MESSAGE_STATUS_TRANSITIONS', () => {
    it('should define valid transitions from local', () => {
      const transitions = MESSAGE_STATUS_TRANSITIONS['local'];
      expect(transitions).toContain('loading');
      expect(transitions).toContain('error');
      expect(transitions).toContain('cancelled');
    });

    it('should have empty transitions for success (terminal state)', () => {
      expect(MESSAGE_STATUS_TRANSITIONS['success']).toEqual([]);
    });

    it('should allow retry from error state', () => {
      expect(MESSAGE_STATUS_TRANSITIONS['error']).toContain('loading');
    });
  });
});

describe('types/guards', () => {
  describe('isStringContent', () => {
    it('should return true for string', () => {
      expect(isStringContent('hello')).toBe(true);
      expect(isStringContent('')).toBe(true);
    });

    it('should return false for array', () => {
      expect(isStringContent([{ type: 'text', text: 'hello' }])).toBe(false);
    });
  });

  describe('isMultiModalContent', () => {
    it('should return true for array', () => {
      expect(isMultiModalContent([{ type: 'text', text: 'hello' }])).toBe(true);
      expect(isMultiModalContent([])).toBe(true);
    });

    it('should return false for string', () => {
      expect(isMultiModalContent('hello')).toBe(false);
    });
  });

  describe('isTextContent', () => {
    it('should return true for text content', () => {
      const textContent: ContentType = { type: 'text', text: 'hello' };
      expect(isTextContent(textContent)).toBe(true);
    });

    it('should return false for image content', () => {
      const imageContent: ContentType = {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.png' },
      };
      expect(isTextContent(imageContent)).toBe(false);
    });

    it('should return false for file content', () => {
      const fileContent: ContentType = {
        type: 'file',
        file: { url: 'https://example.com/file.pdf', name: 'file.pdf' },
      };
      expect(isTextContent(fileContent)).toBe(false);
    });
  });

  describe('getMessageContent', () => {
    it('should return string content directly', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'user',
        content: 'Hello world',
        createAt: Date.now(),
        updateAt: Date.now(),
      };
      expect(getMessageContent(message)).toBe('Hello world');
    });

    it('should return placeholder for multimodal content', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        createAt: Date.now(),
        updateAt: Date.now(),
      };
      expect(getMessageContent(message)).toBe('[多模态内容]');
    });
  });

  describe('toStringContent', () => {
    it('should return string content directly', () => {
      expect(toStringContent('hello')).toBe('hello');
    });

    it('should extract text from multimodal content', () => {
      const content: ContentType[] = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];
      expect(toStringContent(content)).toBe('Hello\nWorld');
    });

    it('should filter out non-text content', () => {
      const content: ContentType[] = [
        { type: 'text', text: 'Hello' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/img.png' },
        },
        { type: 'text', text: 'World' },
      ];
      expect(toStringContent(content)).toBe('Hello\nWorld');
    });

    it('should return placeholder for empty text content', () => {
      const content: ContentType[] = [
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/img.png' },
        },
      ];
      expect(toStringContent(content)).toBe('[多模态内容]');
    });
  });
});
