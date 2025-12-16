/**
 * @fileoverview Utils 模块测试
 * 测试 uid, logger, error-detection 工具函数
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorType } from '../src/types/error';
import {
  isNetworkError,
  isTimeoutError,
  isAuthError,
  isValidationError,
  isServerError,
  isAPIError,
  isAbortError,
  isRetryable,
  shouldRetryError,
  detectErrorType,
} from '../src/utils/error-detection';
import {
  logger,
  configureLogger,
  getLoggerConfig,
  silentMode,
  enableLogs,
  LogLevel,
} from '../src/utils/logger';
import { uid } from '../src/utils/uid';

describe('utils/uid', () => {
  it('should generate unique IDs', () => {
    const id1 = uid();
    const id2 = uid();

    expect(id1).not.toBe(id2);
  });

  it('should generate ID with default length 21', () => {
    const id = uid();
    expect(id.length).toBe(21);
  });

  it('should generate ID with custom length', () => {
    const id = uid(10);
    expect(id.length).toBe(10);
  });

  it('should generate ID with only alphanumeric characters', () => {
    const id = uid(100);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('should generate many unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(uid());
    }
    expect(ids.size).toBe(1000);
  });
});

describe('utils/logger', () => {
  // 使用自定义 handler 来测试，避免与全局 console mock 冲突
  let customHandler: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    customHandler = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    // Reset to default config with custom handler
    configureLogger({
      level: LogLevel.Warn,
      enabled: true,
      prefix: '[chat-sdk]',
      handler: customHandler,
    });
  });

  afterEach(() => {
    // Reset config without handler
    configureLogger({
      level: LogLevel.Warn,
      enabled: true,
      prefix: '[chat-sdk]',
      handler: undefined,
    });
  });

  describe('log levels', () => {
    it('should log warn by default', () => {
      logger.warn('test warning');
      expect(customHandler.warn).toHaveBeenCalledWith(
        '[chat-sdk] test warning',
      );
    });

    it('should log error by default', () => {
      logger.error('test error');
      expect(customHandler.error).toHaveBeenCalledWith('[chat-sdk] test error');
    });

    it('should not log debug by default', () => {
      logger.debug('test debug');
      expect(customHandler.debug).not.toHaveBeenCalled();
    });

    it('should not log info by default', () => {
      logger.info('test info');
      expect(customHandler.info).not.toHaveBeenCalled();
    });
  });

  describe('configureLogger', () => {
    it('should enable debug logging when level is Debug', () => {
      configureLogger({ level: LogLevel.Debug, handler: customHandler });

      logger.debug('debug message');

      expect(customHandler.debug).toHaveBeenCalledWith(
        '[chat-sdk] debug message',
      );
    });

    it('should change prefix', () => {
      configureLogger({ prefix: '[custom]', handler: customHandler });

      logger.warn('test');

      expect(customHandler.warn).toHaveBeenCalledWith('[custom] test');
    });

    it('should use custom handler', () => {
      const newHandler = {
        warn: vi.fn(),
      };
      configureLogger({ handler: newHandler });

      logger.warn('test', 'arg1', 'arg2');

      expect(newHandler.warn).toHaveBeenCalledWith(
        '[chat-sdk] test',
        'arg1',
        'arg2',
      );
    });
  });

  describe('getLoggerConfig', () => {
    it('should return current config', () => {
      configureLogger({ level: LogLevel.Debug, prefix: '[test]' });

      const config = getLoggerConfig();

      expect(config.level).toBe(LogLevel.Debug);
      expect(config.prefix).toBe('[test]');
    });

    it('should return a copy, not the original', () => {
      const config1 = getLoggerConfig();
      config1.prefix = '[modified]';
      const config2 = getLoggerConfig();

      expect(config2.prefix).not.toBe('[modified]');
    });
  });

  describe('silentMode', () => {
    it('should disable all logging', () => {
      silentMode();

      logger.error('should not appear');
      logger.warn('should not appear');
      logger.info('should not appear');
      logger.debug('should not appear');

      // customHandler should not be called when disabled
      expect(customHandler.error).not.toHaveBeenCalled();
      expect(customHandler.warn).not.toHaveBeenCalled();
      expect(customHandler.info).not.toHaveBeenCalled();
      expect(customHandler.debug).not.toHaveBeenCalled();
    });
  });

  describe('enableLogs', () => {
    it('should re-enable logging after silent mode', () => {
      silentMode();
      enableLogs();
      configureLogger({ handler: customHandler }); // Re-apply handler

      logger.warn('test');

      expect(customHandler.warn).toHaveBeenCalled();
    });

    it('should set custom level when enabled', () => {
      enableLogs(LogLevel.Debug);
      configureLogger({ handler: customHandler }); // Re-apply handler

      logger.debug('debug');

      expect(customHandler.debug).toHaveBeenCalled();
    });
  });
});

describe('utils/error-detection', () => {
  describe('isNetworkError', () => {
    it('should detect NetworkError by name', () => {
      const error = new Error('Connection failed');
      error.name = 'NetworkError';
      expect(isNetworkError(error)).toBe(true);
    });

    it('should detect fetch-related TypeError', () => {
      const error = new TypeError('Failed to fetch');
      expect(isNetworkError(error)).toBe(true);
    });

    it('should not treat regular TypeError as network error', () => {
      const error = new TypeError('Cannot read property x');
      expect(isNetworkError(error)).toBe(false);
    });

    it('should detect network error by message', () => {
      const error = new Error('Network request failed');
      expect(isNetworkError(error)).toBe(true);
    });

    it('should detect CORS errors', () => {
      const error = new TypeError('CORS error occurred');
      expect(isNetworkError(error)).toBe(true);
    });

    it('should detect DNS errors', () => {
      const error = new Error('DNS lookup failed');
      expect(isNetworkError(error)).toBe(true);
    });
  });

  describe('isTimeoutError', () => {
    it('should detect TimeoutError by name', () => {
      const error = new Error('Request timed out');
      error.name = 'TimeoutError';
      expect(isTimeoutError(error)).toBe(true);
    });

    it('should detect StreamTimeoutError', () => {
      const error = new Error('Stream timed out');
      error.name = 'StreamTimeoutError';
      expect(isTimeoutError(error)).toBe(true);
    });

    it('should detect timeout by message', () => {
      const error = new Error('Connection timeout');
      expect(isTimeoutError(error)).toBe(true);
    });
  });

  describe('isAuthError', () => {
    it('should detect 401 error', () => {
      const error = new Error('HTTP 401 Unauthorized');
      expect(isAuthError(error)).toBe(true);
    });

    it('should detect 403 error', () => {
      const error = new Error('HTTP 403 Forbidden');
      expect(isAuthError(error)).toBe(true);
    });

    it('should detect unauthorized keyword', () => {
      const error = new Error('Request unauthorized');
      expect(isAuthError(error)).toBe(true);
    });
  });

  describe('isValidationError', () => {
    it('should detect 400 error', () => {
      const error = new Error('HTTP 400 Bad Request');
      expect(isValidationError(error)).toBe(true);
    });

    it('should detect validation keyword', () => {
      const error = new Error('Validation failed');
      expect(isValidationError(error)).toBe(true);
    });

    it('should detect invalid request', () => {
      const error = new Error('Invalid request parameters');
      expect(isValidationError(error)).toBe(true);
    });
  });

  describe('isServerError', () => {
    it('should detect 500 error', () => {
      const error = new Error('HTTP 500 Internal Server Error');
      expect(isServerError(error)).toBe(true);
    });

    it('should detect 502 error', () => {
      const error = new Error('502 Bad Gateway');
      expect(isServerError(error)).toBe(true);
    });

    it('should detect 503 error', () => {
      const error = new Error('503 Service Unavailable');
      expect(isServerError(error)).toBe(true);
    });
  });

  describe('isAPIError', () => {
    it('should detect HTTP error', () => {
      const error = new Error('HTTP error occurred');
      expect(isAPIError(error)).toBe(true);
    });

    it('should detect API error', () => {
      const error = new Error('API request failed');
      expect(isAPIError(error)).toBe(true);
    });

    it('should detect endpoint error', () => {
      const error = new Error('Endpoint not found');
      expect(isAPIError(error)).toBe(true);
    });
  });

  describe('isAbortError', () => {
    it('should detect AbortError', () => {
      const error = new Error('Operation aborted');
      error.name = 'AbortError';
      expect(isAbortError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = new Error('Operation aborted');
      expect(isAbortError(error)).toBe(false);
    });
  });

  describe('isRetryable', () => {
    it('should return true for network errors', () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';
      expect(isRetryable(error)).toBe(true);
    });

    it('should return true for timeout errors', () => {
      const error = new Error('Request timeout');
      error.name = 'TimeoutError';
      expect(isRetryable(error)).toBe(true);
    });

    it('should return true for server errors', () => {
      const error = new Error('HTTP 500 Internal Server Error');
      expect(isRetryable(error)).toBe(true);
    });

    it('should return false for abort errors', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      expect(isRetryable(error)).toBe(false);
    });

    it('should return false for auth errors', () => {
      const error = new Error('HTTP 401 Unauthorized');
      expect(isRetryable(error)).toBe(false);
    });

    it('should return false for validation errors', () => {
      const error = new Error('HTTP 400 Bad Request');
      expect(isRetryable(error)).toBe(false);
    });
  });

  describe('shouldRetryError', () => {
    it('should return false when max retries reached', () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';
      expect(shouldRetryError(error, 3, 3)).toBe(false);
    });

    it('should return true for retryable error within limit', () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';
      expect(shouldRetryError(error, 1, 3)).toBe(true);
    });
  });

  describe('detectErrorType', () => {
    it('should detect Network type', () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';
      expect(detectErrorType(error)).toBe(ErrorType.Network);
    });

    it('should detect Timeout type', () => {
      const error = new Error('Timeout');
      error.name = 'TimeoutError';
      expect(detectErrorType(error)).toBe(ErrorType.Timeout);
    });

    it('should detect Auth type', () => {
      const error = new Error('HTTP 401');
      expect(detectErrorType(error)).toBe(ErrorType.Auth);
    });

    it('should detect Validation type', () => {
      const error = new Error('HTTP 400');
      expect(detectErrorType(error)).toBe(ErrorType.Validation);
    });

    it('should detect Server type', () => {
      const error = new Error('HTTP 500');
      expect(detectErrorType(error)).toBe(ErrorType.Server);
    });

    it('should detect Abort type', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      expect(detectErrorType(error)).toBe(ErrorType.Abort);
    });

    it('should return Unknown for unrecognized errors', () => {
      const error = new Error('Something went wrong');
      expect(detectErrorType(error)).toBe(ErrorType.Unknown);
    });
  });
});
