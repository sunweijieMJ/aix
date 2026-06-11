import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { defaultShouldFollow, useAutoScroll } from '../src/composables/useAutoScroll';

/** 构造一个可控滚动尺寸的伪元素（jsdom 不提供真实布局） */
function mockEl(
  o: Partial<{ scrollHeight: number; scrollTop: number; clientHeight: number }> = {},
) {
  const el = {
    scrollHeight: 1000,
    scrollTop: 0,
    clientHeight: 500,
    scrollTo(opt: { top?: number }) {
      if (typeof opt?.top === 'number') el.scrollTop = opt.top;
    },
    ...o,
  };
  return el as unknown as HTMLElement;
}

describe('defaultShouldFollow', () => {
  it('own-message 总是贴底', () => {
    expect(
      defaultShouldFollow({ reason: 'own-message', scrollState: 'SCROLLED_UP', autoScroll: true }),
    ).toBe(true);
  });
  it('new-message 在开启自动滚动时贴底', () => {
    expect(
      defaultShouldFollow({ reason: 'new-message', scrollState: 'SCROLLED_UP', autoScroll: true }),
    ).toBe(true);
  });
  it('streaming 仅在底部才跟随', () => {
    expect(
      defaultShouldFollow({ reason: 'streaming', scrollState: 'AT_BOTTOM', autoScroll: true }),
    ).toBe(true);
    expect(
      defaultShouldFollow({ reason: 'streaming', scrollState: 'SCROLLED_UP', autoScroll: true }),
    ).toBe(false);
  });
  it('autoScroll 关闭时一律不跟随', () => {
    expect(
      defaultShouldFollow({ reason: 'own-message', scrollState: 'AT_BOTTOM', autoScroll: false }),
    ).toBe(false);
  });
});

describe('useAutoScroll', () => {
  it('computeState：贴底时为 AT_BOTTOM 并清零未读', () => {
    const el = ref(mockEl({ scrollTop: 500 })); // distance = 1000-500-500 = 0
    const { scrollState, unreadCount, computeState } = useAutoScroll(el);
    unreadCount.value = 3;
    computeState();
    expect(scrollState.value).toBe('AT_BOTTOM');
    expect(unreadCount.value).toBe(0);
  });

  it('computeState：远离底部时为 SCROLLED_UP', () => {
    const el = ref(mockEl({ scrollTop: 0 })); // distance = 500
    const { scrollState, computeState } = useAutoScroll(el);
    computeState();
    expect(scrollState.value).toBe('SCROLLED_UP');
  });

  it('computeState：自定义 threshold 生效', () => {
    const el = ref(mockEl({ scrollTop: 440 })); // distance = 60
    const { scrollState, computeState } = useAutoScroll(el, { threshold: 100 });
    computeState();
    expect(scrollState.value).toBe('AT_BOTTOM'); // 60 <= 100
  });

  it('follow：不跟随时累计未读并标记 HAS_NEW_MESSAGES', () => {
    const el = ref(mockEl());
    const { scrollState, unreadCount, follow } = useAutoScroll(el, { autoScroll: false });
    follow('new-message');
    expect(unreadCount.value).toBe(1);
    expect(scrollState.value).toBe('HAS_NEW_MESSAGES');
    follow('new-message');
    expect(unreadCount.value).toBe(2);
  });

  it('follow：streaming 不跟随时不累计未读', () => {
    const el = ref(mockEl());
    const { unreadCount, follow } = useAutoScroll(el, { autoScroll: false });
    follow('streaming');
    expect(unreadCount.value).toBe(0);
  });

  it('follow：own-message 在默认策略下贴底', () => {
    const el = ref(mockEl({ scrollTop: 0 }));
    const { scrollState, follow } = useAutoScroll(el);
    follow('own-message');
    expect(scrollState.value).toBe('AT_BOTTOM');
  });

  it('scrollToBottom：滚动到底并清零未读', () => {
    const el = ref(mockEl({ scrollTop: 0 }));
    const { scrollState, unreadCount, scrollToBottom } = useAutoScroll(el);
    unreadCount.value = 5;
    scrollToBottom();
    expect(scrollState.value).toBe('AT_BOTTOM');
    expect(unreadCount.value).toBe(0);
    expect((el.value as HTMLElement).scrollTop).toBe(1000);
  });

  it('Bug3：autoScroll 为 getter 时运行时切换生效', () => {
    const flag = ref(true);
    const el = ref(mockEl({ scrollTop: 0 })); // 初始远离底部
    const { scrollState, unreadCount, follow } = useAutoScroll(el, {
      autoScroll: () => flag.value,
    });
    // flag=true：new-message 跟随贴底
    follow('new-message');
    expect(scrollState.value).toBe('AT_BOTTOM');
    expect(unreadCount.value).toBe(0);
    // 运行时切到 false：不再贴底，转为累计未读
    flag.value = false;
    follow('new-message');
    expect(scrollState.value).toBe('HAS_NEW_MESSAGES');
    expect(unreadCount.value).toBe(1);
  });
});

describe('useAutoScroll smooth 贴底意图（快速流式期间贴底跟随不被打断）', () => {
  /**
   * smooth 滚动模拟元素：behavior=smooth 不立即移动 scrollTop（模拟动画进行中，jsdom 无真实
   * smooth 动画）；auto 立即跳到目标。附带最小事件系统以驱动 wheel/touchmove 用户输入打断。
   */
  function smoothMockEl() {
    const listeners = new Map<string, Set<() => void>>();
    const el = {
      scrollHeight: 1000,
      scrollTop: 0,
      clientHeight: 500,
      scrollTo(opt: { top?: number; behavior?: string }) {
        if (opt?.behavior !== 'smooth' && typeof opt?.top === 'number') el.scrollTop = opt.top;
      },
      addEventListener(type: string, fn: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: () => void) {
        listeners.get(type)?.delete(fn);
      },
      dispatch(type: string) {
        listeners.get(type)?.forEach((fn) => fn());
      },
      listenerCount(type: string) {
        return listeners.get(type)?.size ?? 0;
      },
    };
    return el;
  }
  const asEl = (el: ReturnType<typeof smoothMockEl>) => ref(el as unknown as HTMLElement);

  it('smooth 动画途中 scroll 事件不把乐观 AT_BOTTOM 翻回 SCROLLED_UP', () => {
    const el = smoothMockEl();
    const { scrollToBottom, computeState, scrollState } = useAutoScroll(asEl(el));
    scrollToBottom(true); // 乐观置 AT_BOTTOM，动画进行中（mock 不移动 scrollTop）
    expect(scrollState.value).toBe('AT_BOTTOM');
    el.scrollTop = 200; // 动画途中位置：distance = 1000-200-500 = 300 > threshold(40)
    computeState(); // BubbleList @scroll 入口
    expect(scrollState.value).toBe('AT_BOTTOM'); // 贴底意图存续期间不得翻回
  });

  it('smooth 动画期间内容继续增高：follow(streaming) 仍跟随并瞬时重定目标到真实底部', () => {
    const el = smoothMockEl();
    const { scrollToBottom, computeState, follow } = useAutoScroll(asEl(el));
    scrollToBottom(true);
    el.scrollTop = 200; // 动画途中
    computeState();
    el.scrollHeight = 2000; // 流式增高 >40px
    follow('streaming'); // defaultShouldFollow 要求 AT_BOTTOM——贴底意图存续故满足
    expect(el.scrollTop).toBe(2000); // 瞬时重定目标，最终真正贴底（不停在过期底部 1000）
  });

  it('真正到底后贴底意图清除：之后用户滚上去能正常翻 SCROLLED_UP', () => {
    const el = smoothMockEl();
    const { scrollToBottom, computeState, scrollState } = useAutoScroll(asEl(el));
    scrollToBottom(true);
    el.scrollTop = 500; // 动画完成到底（distance=0）
    computeState(); // 到底 → 清除标记
    el.scrollTop = 0; // 用户滚到顶
    computeState();
    expect(scrollState.value).toBe('SCROLLED_UP'); // 守卫不会永久吞掉用户滚动
  });

  it('用户 wheel 输入打断贴底意图：状态按真实位置重算，后续 streaming 不再跟随', () => {
    const el = smoothMockEl();
    const { scrollToBottom, scrollState, follow } = useAutoScroll(asEl(el));
    scrollToBottom(true);
    el.scrollTop = 200;
    el.dispatch('wheel'); // 用户主动滚轮输入
    expect(scrollState.value).toBe('SCROLLED_UP'); // 立即按真实位置重算
    expect(el.listenerCount('wheel')).toBe(0); // 打断后监听已清理
    el.scrollHeight = 2000;
    follow('streaming');
    expect(el.scrollTop).toBe(200); // 用户已主动离开底部，不再跟随
  });

  it('500ms 保底超时后贴底意图清除，不会永久守护过期状态', () => {
    vi.useFakeTimers();
    try {
      const el = smoothMockEl();
      const { scrollToBottom, computeState, scrollState } = useAutoScroll(asEl(el));
      scrollToBottom(true);
      el.scrollTop = 200;
      computeState();
      expect(scrollState.value).toBe('AT_BOTTOM'); // 超时前仍受守护
      vi.advanceTimersByTime(500); // 保底超时
      computeState();
      expect(scrollState.value).toBe('SCROLLED_UP'); // 超时后按真实位置计算
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useAutoScroll observeContent（内容增高时钉底）', () => {
  it('处于底部时内容增高自动贴底；用户滚上去后不再贴底', () => {
    let cb: () => void = () => {};
    class RO {
      constructor(c: () => void) {
        cb = c;
      }
      observe() {}
      disconnect() {}
    }
    const prev = (globalThis as any).ResizeObserver;
    (globalThis as any).ResizeObserver = RO;
    try {
      const el = mockEl({ scrollHeight: 1000, scrollTop: 500, clientHeight: 500 }); // 距底=0 → AT_BOTTOM
      const { observeContent, computeState, scrollState } = useAutoScroll(ref(el));
      computeState();
      expect(scrollState.value).toBe('AT_BOTTOM');

      observeContent(mockEl());
      (el as any).scrollHeight = 2000; // 内容增高
      cb();
      expect(el.scrollTop).toBe(2000); // 已贴底

      el.scrollTop = 0; // 用户滚到顶
      computeState();
      expect(scrollState.value).toBe('SCROLLED_UP');
      (el as any).scrollHeight = 3000;
      cb();
      expect(el.scrollTop).toBe(0); // 不贴底
    } finally {
      (globalThis as any).ResizeObserver = prev;
    }
  });

  it('环境无 ResizeObserver 时安全空转（不抛错）', () => {
    const prev = (globalThis as any).ResizeObserver;
    (globalThis as any).ResizeObserver = undefined;
    try {
      const { observeContent } = useAutoScroll(ref(mockEl()));
      expect(() => observeContent(mockEl())).not.toThrow();
    } finally {
      (globalThis as any).ResizeObserver = prev;
    }
  });
});
