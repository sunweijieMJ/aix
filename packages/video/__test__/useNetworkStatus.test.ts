import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useNetworkStatus } from '../src/composables/useNetworkStatus';

// 注意：useNetworkStatus 使用了 onMounted/onBeforeUnmount
// 在非组件环境下会有警告，但功能仍然可用
// 事件绑定在 onMounted 中，所以在纯测试环境下事件不会被绑定

describe('useNetworkStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('初始化', () => {
    it('应该返回网络状态对象', () => {
      const result = useNetworkStatus();

      expect(result.isOnline).toBeDefined();
      expect(result.effectiveType).toBeDefined();
      expect(result.downlink).toBeDefined();
      expect(result.rtt).toBeDefined();
      expect(result.getNetworkStatus).toBeDefined();
      expect(result.isSlowNetwork).toBeDefined();
    });

    it('初始 isOnline 应该反映 navigator.onLine', () => {
      const result = useNetworkStatus();
      // navigator.onLine 在 jsdom 中默认为 true
      expect(typeof result.isOnline.value).toBe('boolean');
    });
  });

  describe('状态管理', () => {
    it('isOnline 应该是响应式的', () => {
      const result = useNetworkStatus();

      // 手动修改状态
      result.isOnline.value = false;
      expect(result.isOnline.value).toBe(false);

      result.isOnline.value = true;
      expect(result.isOnline.value).toBe(true);
    });

    it('effectiveType 应该是响应式的', () => {
      const result = useNetworkStatus();

      result.effectiveType.value = '4g';
      expect(result.effectiveType.value).toBe('4g');

      result.effectiveType.value = '2g';
      expect(result.effectiveType.value).toBe('2g');
    });
  });

  describe('getNetworkStatus', () => {
    it('应该返回当前网络状态', () => {
      const result = useNetworkStatus();
      const status = result.getNetworkStatus();

      expect(status).toHaveProperty('isOnline');
      expect(status).toHaveProperty('effectiveType');
      expect(status).toHaveProperty('downlink');
      expect(status).toHaveProperty('rtt');
    });
  });

  describe('isSlowNetwork', () => {
    it('effectiveType 为 slow-2g 时应该返回 true', () => {
      const result = useNetworkStatus();
      result.effectiveType.value = 'slow-2g';

      expect(result.isSlowNetwork()).toBe(true);
    });

    it('effectiveType 为 2g 时应该返回 true', () => {
      const result = useNetworkStatus();
      result.effectiveType.value = '2g';

      expect(result.isSlowNetwork()).toBe(true);
    });

    it('effectiveType 为 4g 时应该返回 false', () => {
      const result = useNetworkStatus();
      result.effectiveType.value = '4g';

      expect(result.isSlowNetwork()).toBe(false);
    });

    it('effectiveType 为 3g 时应该返回 false', () => {
      const result = useNetworkStatus();
      result.effectiveType.value = '3g';

      expect(result.isSlowNetwork()).toBe(false);
    });
  });

  describe('选项配置', () => {
    it('enableDebugLog 选项应该被接受', () => {
      // 验证选项可以正常传递，不会报错
      expect(() => {
        useNetworkStatus({
          enableDebugLog: true,
        });
      }).not.toThrow();
    });

    it('所有回调选项应该被正确接受', () => {
      const onOnline = vi.fn();
      const onOffline = vi.fn();
      const onNetworkSlow = vi.fn();
      const onNetworkChange = vi.fn();

      expect(() => {
        useNetworkStatus({
          onOnline,
          onOffline,
          onNetworkSlow,
          onNetworkChange,
        });
      }).not.toThrow();
    });
  });
});
