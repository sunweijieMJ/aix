import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useTimerWithVisibility } from '../src/composables/useTimerWithVisibility';

describe('useTimerWithVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock document.hidden
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('基础功能', () => {
    it('应该创建定时器控制器', () => {
      const callback = vi.fn();
      const timer = useTimerWithVisibility(callback, 1000);

      expect(timer.start).toBeDefined();
      expect(timer.stop).toBeDefined();
      expect(timer.destroy).toBeDefined();
    });

    it('start 应该启动定时器', () => {
      const callback = vi.fn();
      const timer = useTimerWithVisibility(callback, 1000);

      timer.start();
      vi.advanceTimersByTime(3000);

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('stop 应该停止定时器', () => {
      const callback = vi.fn();
      const timer = useTimerWithVisibility(callback, 1000);

      timer.start();
      vi.advanceTimersByTime(2000);
      timer.stop();
      vi.advanceTimersByTime(2000);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('destroy 应该清理定时器和事件监听', () => {
      const callback = vi.fn();
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const timer = useTimerWithVisibility(callback, 1000);
      timer.start();
      timer.destroy();

      vi.advanceTimersByTime(3000);
      expect(callback).toHaveBeenCalledTimes(0);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      );
    });
  });

  describe('页面可见性', () => {
    it('页面隐藏时不应该启动定时器', () => {
      Object.defineProperty(document, 'hidden', { value: true });

      const callback = vi.fn();
      const timer = useTimerWithVisibility(callback, 1000);

      timer.start();
      vi.advanceTimersByTime(3000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('visibilitychange 事件应该触发暂停/恢复', () => {
      const onPause = vi.fn();
      const onResume = vi.fn();
      const callback = vi.fn();

      const timer = useTimerWithVisibility(callback, 1000, {
        onPause,
        onResume,
      });

      timer.start();

      // 模拟页面隐藏
      Object.defineProperty(document, 'hidden', { value: true });
      timer.handleVisibilityChange();

      expect(onPause).toHaveBeenCalled();

      // 模拟页面显示
      Object.defineProperty(document, 'hidden', { value: false });
      timer.handleVisibilityChange();

      expect(onResume).toHaveBeenCalled();
    });
  });

  describe('canStart 选项', () => {
    it('canStart 返回 false 时不应该启动定时器', () => {
      const callback = vi.fn();
      const timer = useTimerWithVisibility(callback, 1000, {
        canStart: () => false,
      });

      timer.start();
      vi.advanceTimersByTime(3000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('canStart 返回 true 时应该正常启动定时器', () => {
      const callback = vi.fn();
      const timer = useTimerWithVisibility(callback, 1000, {
        canStart: () => true,
      });

      timer.start();
      vi.advanceTimersByTime(3000);

      expect(callback).toHaveBeenCalledTimes(3);
    });
  });

  describe('重复调用', () => {
    it('多次调用 start 不应该创建多个定时器', () => {
      const callback = vi.fn();
      const timer = useTimerWithVisibility(callback, 1000);

      timer.start();
      timer.start();
      timer.start();

      vi.advanceTimersByTime(3000);

      // 只有一个定时器，所以只调用 3 次
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('多次调用 stop 不应该报错', () => {
      const callback = vi.fn();
      const timer = useTimerWithVisibility(callback, 1000);

      timer.start();
      timer.stop();
      timer.stop();
      timer.stop();

      expect(() => timer.stop()).not.toThrow();
    });
  });
});
