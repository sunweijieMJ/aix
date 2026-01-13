import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useTouchEvents } from '../src/composables/useTouchEvents';

describe('useTouchEvents', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  // Helper function to create touch event
  function createTouchEvent(type: string, x: number, y: number): TouchEvent {
    const touch = {
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x,
      screenY: y,
      identifier: 0,
      target: container,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    } as unknown as Touch;

    return new TouchEvent(type, {
      touches: type === 'touchend' ? [] : [touch],
      changedTouches: [touch],
      bubbles: true,
    });
  }

  describe('初始化', () => {
    it('应该返回控制方法', () => {
      const containerRef = ref<HTMLElement | null>(null);
      const options = ref({ enabled: true });
      const result = useTouchEvents(containerRef, options);

      expect(result.bindEvents).toBeDefined();
      expect(result.unbindEvents).toBeDefined();
    });

    it('disabled 时不应该绑定事件', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onTap = vi.fn();

      useTouchEvents(containerRef, ref({ enabled: false, onTap }));
      await nextTick();

      // 触发点击
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      container.dispatchEvent(createTouchEvent('touchend', 100, 100));

      vi.advanceTimersByTime(500);
      expect(onTap).not.toHaveBeenCalled();
    });
  });

  describe('单击检测', () => {
    it('快速点击应该触发 onTap', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onTap = vi.fn();
      const options = ref({ enabled: true, onTap });

      useTouchEvents(containerRef, options);
      await nextTick();

      // 模拟快速点击
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      vi.advanceTimersByTime(100); // 100ms 后触摸结束
      container.dispatchEvent(createTouchEvent('touchend', 100, 100));

      // 等待单击延迟
      vi.advanceTimersByTime(250);

      expect(onTap).toHaveBeenCalledTimes(1);
    });

    it('移动过多不应该触发 onTap', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onTap = vi.fn();
      const options = ref({ enabled: true, onTap });

      useTouchEvents(containerRef, options);
      await nextTick();

      // 模拟滑动
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      vi.advanceTimersByTime(100);
      container.dispatchEvent(createTouchEvent('touchend', 200, 200)); // 移动了 100+px

      vi.advanceTimersByTime(500);
      expect(onTap).not.toHaveBeenCalled();
    });
  });

  describe('双击检测', () => {
    it('快速双击应该触发 onDoubleTap', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onTap = vi.fn();
      const onDoubleTap = vi.fn();
      const options = ref({ enabled: true, onTap, onDoubleTap });

      useTouchEvents(containerRef, options);
      await nextTick();

      // 第一次点击
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      vi.advanceTimersByTime(50);
      container.dispatchEvent(createTouchEvent('touchend', 100, 100));

      // 短间隔后第二次点击
      vi.advanceTimersByTime(100);
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      vi.advanceTimersByTime(50);
      container.dispatchEvent(createTouchEvent('touchend', 100, 100));

      vi.advanceTimersByTime(500);

      expect(onDoubleTap).toHaveBeenCalledTimes(1);
      expect(onTap).not.toHaveBeenCalled(); // 双击时不应该触发单击
    });
  });

  describe('滑动检测', () => {
    it('左滑应该触发 onSwipeLeft', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onSwipeLeft = vi.fn();
      const options = ref({ enabled: true, onSwipeLeft });

      useTouchEvents(containerRef, options);
      await nextTick();

      // 模拟左滑
      container.dispatchEvent(createTouchEvent('touchstart', 200, 100));
      vi.advanceTimersByTime(200);
      container.dispatchEvent(createTouchEvent('touchend', 100, 100)); // 向左滑动 100px

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('右滑应该触发 onSwipeRight', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onSwipeRight = vi.fn();
      const options = ref({ enabled: true, onSwipeRight });

      useTouchEvents(containerRef, options);
      await nextTick();

      // 模拟右滑
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      vi.advanceTimersByTime(200);
      container.dispatchEvent(createTouchEvent('touchend', 200, 100)); // 向右滑动 100px

      expect(onSwipeRight).toHaveBeenCalledTimes(1);
    });

    it('滑动距离不够不应该触发', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();
      const options = ref({ enabled: true, onSwipeLeft, onSwipeRight });

      useTouchEvents(containerRef, options);
      await nextTick();

      // 模拟短距离滑动
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      vi.advanceTimersByTime(200);
      container.dispatchEvent(createTouchEvent('touchend', 130, 100)); // 只滑动 30px

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('垂直滑动不应该触发水平滑动回调', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();
      const options = ref({ enabled: true, onSwipeLeft, onSwipeRight });

      useTouchEvents(containerRef, options);
      await nextTick();

      // 模拟垂直滑动
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      vi.advanceTimersByTime(200);
      container.dispatchEvent(createTouchEvent('touchend', 100, 200)); // 垂直滑动 100px

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });
  });

  describe('启用/禁用切换', () => {
    it('从禁用切换到启用应该绑定事件', async () => {
      const containerRef = ref<HTMLElement | null>(container);
      const onTap = vi.fn();
      const options = ref({ enabled: false, onTap });

      useTouchEvents(containerRef, options);
      await nextTick();

      // 禁用状态下的点击
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      container.dispatchEvent(createTouchEvent('touchend', 100, 100));
      vi.advanceTimersByTime(500);
      expect(onTap).not.toHaveBeenCalled();

      // 切换为启用
      options.value = { enabled: true, onTap };
      await nextTick();

      // 启用后的点击
      container.dispatchEvent(createTouchEvent('touchstart', 100, 100));
      vi.advanceTimersByTime(50);
      container.dispatchEvent(createTouchEvent('touchend', 100, 100));
      vi.advanceTimersByTime(250);

      expect(onTap).toHaveBeenCalledTimes(1);
    });
  });
});
