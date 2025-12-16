/**
 * @fileoverview ErrorHandler 测试
 * 测试错误处理核心功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorHandler, createErrorHandler } from '../src/core/ErrorHandler';
import { ErrorType, ErrorLevel } from '../src/types';
import { silentMode, enableLogs, LogLevel } from '../src/utils/logger';

describe('core/ErrorHandler', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    // 静默日志以避免测试输出噪音
    silentMode();
    handler = new ErrorHandler({ enableLogging: false });
  });

  afterEach(() => {
    handler.destroy();
    enableLogs(LogLevel.Warn);
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      expect(handler.getErrors()).toEqual([]);
      expect(handler.getLastError()).toBeNull();
      expect(handler.getErrorCount()).toBe(0);
    });

    it('should use default config values', () => {
      const defaultHandler = new ErrorHandler();
      expect(defaultHandler.getErrors()).toEqual([]);
      defaultHandler.destroy();
    });
  });

  describe('handleError', () => {
    it('should create error record', () => {
      const error = new Error('Test error');

      const record = handler.handleError(error, ErrorType.Network);

      expect(record.id).toBeDefined();
      expect(record.type).toBe(ErrorType.Network);
      expect(record.message).toBe('Test error');
      expect(record.error).toBe(error);
      expect(record.timestamp).toBeDefined();
      expect(record.handled).toBe(false);
    });

    it('should use default error level', () => {
      const error = new Error('Test error');

      const record = handler.handleError(error, ErrorType.Unknown);

      expect(record.level).toBe(ErrorLevel.Error);
    });

    it('should use provided error level', () => {
      const error = new Error('Warning');

      const record = handler.handleError(
        error,
        ErrorType.Validation,
        ErrorLevel.Warning,
      );

      expect(record.level).toBe(ErrorLevel.Warning);
    });

    it('should store context', () => {
      const error = new Error('API error');
      const context = { url: '/api/chat', method: 'POST' };

      const record = handler.handleError(
        error,
        ErrorType.API,
        ErrorLevel.Error,
        context,
      );

      expect(record.context).toEqual(context);
    });

    it('should add error to list', () => {
      const error = new Error('Test error');

      handler.handleError(error, ErrorType.Network);

      expect(handler.getErrors()).toHaveLength(1);
    });

    it('should update lastError', () => {
      const error1 = new Error('First error');
      const error2 = new Error('Second error');

      handler.handleError(error1, ErrorType.Network);
      handler.handleError(error2, ErrorType.Timeout);

      expect(handler.getLastError()?.message).toBe('Second error');
    });

    it('should increment error count', () => {
      const error = new Error('Test error');

      handler.handleError(error, ErrorType.Network);
      handler.handleError(error, ErrorType.Network);
      handler.handleError(error, ErrorType.Network);

      expect(handler.getErrorCount()).toBe(3);
    });

    it('should limit error records to maxRecords', () => {
      const limitedHandler = new ErrorHandler({
        maxRecords: 3,
        enableLogging: false,
      });

      for (let i = 0; i < 5; i++) {
        limitedHandler.handleError(new Error(`Error ${i}`), ErrorType.Unknown);
      }

      expect(limitedHandler.getErrors()).toHaveLength(3);
      expect(limitedHandler.getErrors()[0]?.message).toBe('Error 2');
      expect(limitedHandler.getErrors()[2]?.message).toBe('Error 4');

      limitedHandler.destroy();
    });

    it('should call onError callback', () => {
      const onError = vi.fn();
      const handlerWithCallback = new ErrorHandler({
        onError,
        enableLogging: false,
      });
      const error = new Error('Test error');

      handlerWithCallback.handleError(error, ErrorType.Network);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error',
          type: ErrorType.Network,
        }),
      );

      handlerWithCallback.destroy();
    });

    it('should notify subscribers', () => {
      const listener = vi.fn();
      handler.subscribe(listener);

      handler.handleError(new Error('Test'), ErrorType.Unknown);

      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0]?.[0].errors).toHaveLength(1);
    });
  });

  describe('getErrors', () => {
    it('should return copy of errors array', () => {
      handler.handleError(new Error('Test'), ErrorType.Unknown);

      const errors1 = handler.getErrors();
      const errors2 = handler.getErrors();

      expect(errors1).not.toBe(errors2);
      expect(errors1).toEqual(errors2);
    });
  });

  describe('getLastError', () => {
    it('should return null when no errors', () => {
      expect(handler.getLastError()).toBeNull();
    });

    it('should return last error', () => {
      handler.handleError(new Error('First'), ErrorType.Network);
      handler.handleError(new Error('Second'), ErrorType.Timeout);

      const lastError = handler.getLastError();

      expect(lastError?.message).toBe('Second');
      expect(lastError?.type).toBe(ErrorType.Timeout);
    });
  });

  describe('getErrorCount', () => {
    it('should return total error count', () => {
      handler.handleError(new Error('Error 1'), ErrorType.Unknown);
      handler.handleError(new Error('Error 2'), ErrorType.Unknown);
      handler.handleError(new Error('Error 3'), ErrorType.Unknown);

      expect(handler.getErrorCount()).toBe(3);
    });

    it('should not decrease when errors are cleared', () => {
      handler.handleError(new Error('Error 1'), ErrorType.Unknown);
      handler.handleError(new Error('Error 2'), ErrorType.Unknown);

      handler.clearAllErrors();

      // Error count is cumulative
      expect(handler.getErrorCount()).toBe(2);
    });
  });

  describe('clearError', () => {
    it('should clear specific error by id', () => {
      const record1 = handler.handleError(
        new Error('Error 1'),
        ErrorType.Unknown,
      );
      handler.handleError(new Error('Error 2'), ErrorType.Unknown);

      const result = handler.clearError(record1.id);

      expect(result).toBe(true);
      expect(handler.getErrors()).toHaveLength(1);
      expect(handler.getErrors()[0]?.message).toBe('Error 2');
    });

    it('should return false for non-existent id', () => {
      handler.handleError(new Error('Error'), ErrorType.Unknown);

      const result = handler.clearError('non-existent-id');

      expect(result).toBe(false);
      expect(handler.getErrors()).toHaveLength(1);
    });

    it('should notify subscribers on clear', () => {
      const record = handler.handleError(new Error('Error'), ErrorType.Unknown);
      const listener = vi.fn();
      handler.subscribe(listener);

      handler.clearError(record.id);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('clearAllErrors', () => {
    it('should clear all errors', () => {
      handler.handleError(new Error('Error 1'), ErrorType.Unknown);
      handler.handleError(new Error('Error 2'), ErrorType.Unknown);
      handler.handleError(new Error('Error 3'), ErrorType.Unknown);

      handler.clearAllErrors();

      expect(handler.getErrors()).toEqual([]);
      expect(handler.getLastError()).toBeNull();
    });

    it('should notify subscribers', () => {
      handler.handleError(new Error('Error'), ErrorType.Unknown);
      const listener = vi.fn();
      handler.subscribe(listener);

      handler.clearAllErrors();

      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0]?.[0].errors).toEqual([]);
    });
  });

  describe('subscription (inherited from Observable)', () => {
    it('should subscribe and unsubscribe', () => {
      const listener = vi.fn();

      const unsubscribe = handler.subscribe(listener);
      handler.handleError(new Error('Error 1'), ErrorType.Unknown);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      handler.handleError(new Error('Error 2'), ErrorType.Unknown);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should provide state in callback', () => {
      const listener = vi.fn();
      handler.subscribe(listener);

      handler.handleError(new Error('Test'), ErrorType.Network);

      const state = listener.mock.calls[0]?.[0];
      expect(state.errors).toHaveLength(1);
      expect(state.lastError).toBeDefined();
      expect(state.errorCount).toBe(1);
    });
  });

  describe('logging', () => {
    it('should log errors when enableLogging is true', () => {
      const loggingHandler = new ErrorHandler({ enableLogging: true });

      // 这里只测试不抛错，实际日志输出被静默了
      expect(() => {
        loggingHandler.handleError(
          new Error('Test'),
          ErrorType.Unknown,
          ErrorLevel.Error,
        );
      }).not.toThrow();

      loggingHandler.destroy();
    });

    it('should log warnings for warn level', () => {
      const loggingHandler = new ErrorHandler({ enableLogging: true });

      expect(() => {
        loggingHandler.handleError(
          new Error('Warning'),
          ErrorType.Validation,
          ErrorLevel.Warning,
        );
      }).not.toThrow();

      loggingHandler.destroy();
    });

    it('should log fatal errors', () => {
      const loggingHandler = new ErrorHandler({ enableLogging: true });

      expect(() => {
        loggingHandler.handleError(
          new Error('Fatal'),
          ErrorType.Unknown,
          ErrorLevel.Fatal,
        );
      }).not.toThrow();

      loggingHandler.destroy();
    });
  });

  describe('createErrorHandler helper', () => {
    it('should create handler instance', () => {
      const newHandler = createErrorHandler();
      expect(newHandler).toBeInstanceOf(ErrorHandler);
      newHandler.destroy();
    });

    it('should accept config', () => {
      const onError = vi.fn();
      const newHandler = createErrorHandler({
        maxRecords: 10,
        enableLogging: false,
        onError,
      });

      newHandler.handleError(new Error('Test'), ErrorType.Unknown);

      expect(onError).toHaveBeenCalled();
      newHandler.destroy();
    });
  });

  describe('error types and levels', () => {
    it('should handle all error types', () => {
      const types = [
        ErrorType.Network,
        ErrorType.Timeout,
        ErrorType.Auth,
        ErrorType.Validation,
        ErrorType.Server,
        ErrorType.Abort,
        ErrorType.API,
        ErrorType.Unknown,
      ];

      for (const type of types) {
        const record = handler.handleError(new Error('Test'), type);
        expect(record.type).toBe(type);
      }
    });

    it('should handle all error levels', () => {
      const levels = [
        ErrorLevel.Info,
        ErrorLevel.Warning,
        ErrorLevel.Error,
        ErrorLevel.Fatal,
      ];

      for (const level of levels) {
        const record = handler.handleError(
          new Error('Test'),
          ErrorType.Unknown,
          level,
        );
        expect(record.level).toBe(level);
      }
    });
  });
});
