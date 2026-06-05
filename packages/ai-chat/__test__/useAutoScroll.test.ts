import { describe, it, expect } from 'vitest';
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
