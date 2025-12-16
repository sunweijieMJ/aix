/**
 * @fileoverview Observable 模块测试
 * 测试 Observable 和 EventEmitter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Observable,
  EventEmitter,
  createObservable,
} from '../src/core/Observable';

describe('core/Observable', () => {
  interface TestState {
    count: number;
    name: string;
  }

  describe('basic functionality', () => {
    it('should initialize with initial state', () => {
      const observable = new Observable<TestState>({ count: 0, name: 'test' });

      const state = observable.getState();

      expect(state.count).toBe(0);
      expect(state.name).toBe('test');
    });

    it('should return deep clone from getState', () => {
      const observable = new Observable<TestState>({ count: 0, name: 'test' });

      const state1 = observable.getState();
      state1.count = 999;

      const state2 = observable.getState();

      expect(state2.count).toBe(0);
    });
  });

  describe('subscription', () => {
    it('should notify subscribers on state update', () => {
      const observable = new TestObservable({ count: 0, name: 'test' });
      const listener = vi.fn();

      observable.subscribe(listener);
      observable.publicUpdateState({ count: 1 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1 }),
      );
    });

    it('should allow multiple subscribers', () => {
      const observable = new TestObservable({ count: 0, name: 'test' });
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      observable.subscribe(listener1);
      observable.subscribe(listener2);
      observable.publicUpdateState({ count: 1 });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should unsubscribe correctly', () => {
      const observable = new TestObservable({ count: 0, name: 'test' });
      const listener = vi.fn();

      const unsubscribe = observable.subscribe(listener);
      observable.publicUpdateState({ count: 1 });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      observable.publicUpdateState({ count: 2 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle listener errors gracefully', () => {
      const observable = new TestObservable({ count: 0, name: 'test' });
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      observable.subscribe(errorListener);
      observable.subscribe(normalListener);

      // Should not throw
      expect(() => observable.publicUpdateState({ count: 1 })).not.toThrow();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return correct listener count', () => {
      const observable = new Observable<TestState>({ count: 0, name: 'test' });

      expect(observable.listenerCount).toBe(0);

      const unsub1 = observable.subscribe(() => {});
      expect(observable.listenerCount).toBe(1);

      observable.subscribe(() => {});
      expect(observable.listenerCount).toBe(2);

      unsub1();
      expect(observable.listenerCount).toBe(1);
    });
  });

  describe('hasListeners', () => {
    it('should return false when no listeners', () => {
      const observable = new Observable<TestState>({ count: 0, name: 'test' });
      expect(observable.hasListeners()).toBe(false);
    });

    it('should return true when has listeners', () => {
      const observable = new Observable<TestState>({ count: 0, name: 'test' });
      observable.subscribe(() => {});
      expect(observable.hasListeners()).toBe(true);
    });
  });

  describe('clearListeners', () => {
    it('should remove all listeners', () => {
      const observable = new Observable<TestState>({ count: 0, name: 'test' });
      observable.subscribe(() => {});
      observable.subscribe(() => {});

      observable.clearListeners();

      expect(observable.listenerCount).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should clear all listeners', () => {
      const observable = new Observable<TestState>({ count: 0, name: 'test' });
      observable.subscribe(() => {});

      observable.destroy();

      expect(observable.listenerCount).toBe(0);
    });
  });

  describe('throttling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should throttle notifications', () => {
      const observable = new TestObservable(
        { count: 0, name: 'test' },
        { throttleInterval: 100 },
      );
      const listener = vi.fn();
      observable.subscribe(listener);

      // First update should be immediate (leading edge)
      observable.publicUpdateState({ count: 1 });
      expect(listener).toHaveBeenCalledTimes(1);

      // Second update should be throttled
      observable.publicUpdateState({ count: 2 });
      expect(listener).toHaveBeenCalledTimes(1);

      // After throttle interval, pending update should fire (trailing edge)
      vi.advanceTimersByTime(100);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should not add trailing notification if no pending updates', () => {
      const observable = new TestObservable(
        { count: 0, name: 'test' },
        { throttleInterval: 100 },
      );
      const listener = vi.fn();
      observable.subscribe(listener);

      observable.publicUpdateState({ count: 1 });
      expect(listener).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('createObservable helper', () => {
    it('should create observable instance', () => {
      const observable = createObservable({ count: 0 });
      expect(observable.getState().count).toBe(0);
    });
  });
});

describe('core/EventEmitter', () => {
  // 使用兼容 EventEmitter 约束的事件类型
  type TestEvents = Record<string, (...args: unknown[]) => void> & {
    message: (text: string) => void;
    error: (error: Error) => void;
    data: (num: number, str: string) => void;
  };

  describe('on/emit', () => {
    it('should emit events to handlers', () => {
      // 使用类型断言以兼容泛型约束
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const handler = vi.fn();

      emitter.on('message', handler);
      emitter.emit('message', 'hello');

      expect(handler).toHaveBeenCalledWith('hello');
    });

    it('should support multiple handlers for same event', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('message', handler1);
      emitter.on('message', handler2);
      emitter.emit('message', 'hello');

      expect(handler1).toHaveBeenCalledWith('hello');
      expect(handler2).toHaveBeenCalledWith('hello');
    });

    it('should pass multiple arguments', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const handler = vi.fn();

      emitter.on('data', handler);
      emitter.emit('data', 42, 'test');

      expect(handler).toHaveBeenCalledWith(42, 'test');
    });
  });

  describe('off', () => {
    it('should remove handler', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const handler = vi.fn();

      emitter.on('message', handler);
      emitter.emit('message', 'first');
      expect(handler).toHaveBeenCalledTimes(1);

      emitter.off('message', handler);
      emitter.emit('message', 'second');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe from on', () => {
    it('should return unsubscribe function', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const handler = vi.fn();

      const unsubscribe = emitter.on('message', handler);
      emitter.emit('message', 'first');
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      emitter.emit('message', 'second');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('once', () => {
    it('should only trigger handler once', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const handler = vi.fn();

      emitter.once('message', handler);
      emitter.emit('message', 'first');
      emitter.emit('message', 'second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('should return unsubscribe function', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const handler = vi.fn();

      const unsubscribe = emitter.once('message', handler);
      unsubscribe();
      emitter.emit('message', 'hello');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all handlers for specific event', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const messageHandler = vi.fn();
      const errorHandler = vi.fn();

      emitter.on('message', messageHandler);
      emitter.on('error', errorHandler);

      emitter.removeAllListeners('message');

      emitter.emit('message', 'hello');
      emitter.emit('error', new Error('test'));

      expect(messageHandler).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should remove all handlers when no event specified', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const messageHandler = vi.fn();
      const errorHandler = vi.fn();

      emitter.on('message', messageHandler);
      emitter.on('error', errorHandler);

      emitter.removeAllListeners();

      emitter.emit('message', 'hello');
      emitter.emit('error', new Error('test'));

      expect(messageHandler).not.toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;

      expect(emitter.listenerCount('message')).toBe(0);

      emitter.on('message', () => {});
      expect(emitter.listenerCount('message')).toBe(1);

      emitter.on('message', () => {});
      expect(emitter.listenerCount('message')).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle handler errors gracefully', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      emitter.on('message', errorHandler);
      emitter.on('message', normalHandler);

      expect(() => emitter.emit('message', 'hello')).not.toThrow();
      expect(normalHandler).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clear all handlers', () => {
      const emitter = new EventEmitter() as unknown as EventEmitter<TestEvents>;
      emitter.on('message', () => {});
      emitter.on('error', () => {});

      emitter.destroy();

      expect(emitter.listenerCount('message')).toBe(0);
      expect(emitter.listenerCount('error')).toBe(0);
    });
  });
});

// Helper class to expose protected methods for testing
class TestObservable<S extends object> extends Observable<S> {
  publicUpdateState(partial: Partial<S>): void {
    this.updateState(partial);
  }

  publicSetState(newState: S): void {
    this.setState(newState);
  }
}
