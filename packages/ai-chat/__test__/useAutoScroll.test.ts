import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { defaultShouldFollow, useAutoScroll } from '../src/composables/useAutoScroll';
import type { ShouldFollow } from '../src/composables/useAutoScroll';

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
    // scrollToBottom 现在无论 smooth 与否都可能起一轮贴底轮询（见修复③），会挂 wheel/
    // touchmove 监听——这里只关心滚动位置/状态断言的用例不需要真的追踪监听，给空实现
    // 即可，避免调用方因为这个精简 mock 缺方法而报错。
    addEventListener() {},
    removeEventListener() {},
    ...o,
  };
  return el as unknown as HTMLElement;
}

/**
 * 可手动驱动的 requestAnimationFrame mock：贴底意图收尾改为 rAF 轮询后，测试需要精确
 * 控制"第几帧"发生了什么（而不是依赖真实 ~16ms 延迟或 vitest fake timers 是否覆盖 rAF），
 * 故直接替换全局 rAF/cAF，用队列 + runFrame() 单步推进。
 */
function mockRaf() {
  const queue: Array<() => void> = [];
  const prevRAF = globalThis.requestAnimationFrame;
  const prevCAF = globalThis.cancelAnimationFrame;
  let idSeq = 0;
  const idToCb = new Map<number, () => void>();
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = (idSeq += 1);
    const wrapped = () => cb(0);
    idToCb.set(id, wrapped);
    queue.push(wrapped);
    return id;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    const cb = idToCb.get(id);
    if (cb) {
      const i = queue.indexOf(cb);
      if (i >= 0) queue.splice(i, 1);
    }
    idToCb.delete(id);
  }) as typeof cancelAnimationFrame;
  return {
    /** 执行队列里最早排入、尚未执行的一帧回调（不存在则空操作） */
    runFrame: () => queue.shift()?.(),
    /** 排空当前队列里所有已排入的帧（含执行过程中新排入的），用于让贴底轮询跑到自然收尾 */
    drain: (maxFrames = 100) => {
      let n = 0;
      while (queue.length && n < maxFrames) {
        queue.shift()?.();
        n += 1;
      }
    },
    restore: () => {
      globalThis.requestAnimationFrame = prevRAF;
      globalThis.cancelAnimationFrame = prevCAF;
    },
  };
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

  it('shouldFollow 三种形态均生效：裸策略函数（旧 API）/ getter / ref', () => {
    // 裸策略：直接按 FollowContext 求值，不被误当 getter 零参调用
    const el1 = ref(mockEl({ scrollTop: 0 }));
    const bare = useAutoScroll(el1, { shouldFollow: ({ reason }) => reason === 'own-message' });
    bare.follow('own-message');
    expect(bare.scrollState.value).toBe('AT_BOTTOM');
    bare.follow('new-message');
    expect(bare.scrollState.value).toBe('HAS_NEW_MESSAGES');

    // getter：运行时切换策略即时生效；求得 undefined 回退默认策略
    const el2 = ref(mockEl({ scrollTop: 0 }));
    const strategy = ref<ShouldFollow | undefined>(() => false);
    const viaGetter = useAutoScroll(el2, { shouldFollow: () => strategy.value });
    viaGetter.follow('new-message');
    expect(viaGetter.scrollState.value).toBe('HAS_NEW_MESSAGES');
    strategy.value = () => true;
    viaGetter.follow('new-message');
    expect(viaGetter.scrollState.value).toBe('AT_BOTTOM');
    strategy.value = undefined; // 回退默认：new-message 且 autoScroll 默认 true → 跟随
    viaGetter.follow('new-message');
    expect(viaGetter.scrollState.value).toBe('AT_BOTTOM');

    // ref：取 .value 作为策略
    const el3 = ref(mockEl({ scrollTop: 0 }));
    const viaRef = useAutoScroll(el3, { shouldFollow: ref<ShouldFollow>(() => false) });
    viaRef.follow('new-message');
    expect(viaRef.scrollState.value).toBe('HAS_NEW_MESSAGES');
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

  it('真正到底后贴底轮询自然收尾：之后用户滚上去能正常翻 SCROLLED_UP', () => {
    // 修复④回归：轮询进行中"此刻恰好到底"不等于"内容已稳定"（批量加载多条消息时，
    // 我们自己 scrollTo 触发的原生 scroll 事件很容易恰好命中"刚追平"的瞬间），
    // 不能因为这一下 computeState 判到 distance<=threshold 就提前清掉轮询——
    // 必须等轮询自己走完稳定帧判定才算真正结束，之后 computeState 才会正常响应用户滚动。
    const raf = mockRaf();
    try {
      const el = smoothMockEl();
      const { scrollToBottom, computeState, scrollState } = useAutoScroll(asEl(el));
      scrollToBottom(true);
      el.scrollTop = 500; // 动画完成到底（distance=0）
      computeState(); // 此刻恰好到底，但轮询仍在跑，不会被这一下提前清除
      expect(scrollState.value).toBe('AT_BOTTOM');
      raf.drain(); // 内容全程未变化，轮询自己很快连续 4 帧判定稳定并收尾

      el.scrollTop = 0; // 用户滚到顶
      computeState();
      expect(scrollState.value).toBe('SCROLLED_UP'); // 守卫不会永久吞掉用户滚动
    } finally {
      raf.restore();
    }
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

  it('内容不再变化后（连续 4 帧稳定）贴底意图收尾，按真实位置计算', () => {
    // 对应原 500ms 超时用例的语义：动画实际没追上（scrollTop 停在 200，scrollHeight 不再变），
    // 收尾时用真实位置揭示 SCROLLED_UP，而不会永久假装 AT_BOTTOM。
    const raf = mockRaf();
    try {
      const el = smoothMockEl();
      const { scrollToBottom, scrollState } = useAutoScroll(asEl(el));
      scrollToBottom(true); // smooth：scrollTop 暂不移动，排入第 1 帧轮询
      el.scrollTop = 200; // 模拟动画卡在半途；scrollHeight 全程不变（1000）
      for (let i = 0; i < 4; i += 1) raf.runFrame(); // 连续 4 帧高度未变 → 收尾
      expect(scrollState.value).toBe('SCROLLED_UP'); // 收尾用 computeState 按真实位置计算
    } finally {
      raf.restore();
    }
  });

  it('内容持续异常增长超过保底帧数上限：仍会收尾，不会永久轮询', () => {
    const raf = mockRaf();
    try {
      const el = smoothMockEl();
      const { scrollToBottom, scrollState } = useAutoScroll(asEl(el));
      scrollToBottom(true); // 排入第 1 帧
      // 每帧都变高，stableFrames 永远清零，只能靠 MAX_SETTLE_FRAMES（60）上限收尾
      for (let i = 0; i < 60; i += 1) {
        el.scrollHeight += 10;
        raf.runFrame();
      }
      expect(scrollState.value).toBe('AT_BOTTOM'); // 每帧都重定目标追上，收尾时已在（当时的）底部
      // 收尾后不再排入新帧：轮询已停止，不再响应后续变化
      const before = el.scrollTop;
      el.scrollHeight += 10;
      raf.runFrame();
      expect(el.scrollTop).toBe(before);
    } finally {
      raf.restore();
    }
  });

  it('虚拟列表新行分几帧才测量出真实高度：持续轮询直到稳定才收尾，最终真正贴底', () => {
    // 复现原 bug 场景：插入一条自定义卡片消息后，虚拟列表先给一个偏低的估算高度，
    // 真实（更高的）高度要再过几帧测量/布局后才反映到 scrollHeight。
    const raf = mockRaf();
    try {
      const el = smoothMockEl();
      const { scrollToBottom, scrollState } = useAutoScroll(asEl(el));
      scrollToBottom(true); // smooth：scrollTop 暂不移动，排入第 1 帧轮询；lastHeight 记为当前 1000

      el.scrollHeight = 1400; // 第 1 帧：虚拟列表测量出卡片真实高度，比估算的更高
      raf.runFrame();
      expect(el.scrollTop).toBe(1400); // 发现变化，立即瞬时重定目标追上新底部

      el.scrollHeight = 1600; // 第 2 帧：布局又有一次微调（如内部异步内容继续撑高）
      raf.runFrame();
      expect(el.scrollTop).toBe(1600);

      // 之后不再变化：连续 STABLE_FRAMES_TO_SETTLE（4）帧后应收尾并稳定在 AT_BOTTOM
      for (let i = 0; i < 4; i += 1) raf.runFrame();
      expect(scrollState.value).toBe('AT_BOTTOM');
      expect(el.scrollTop).toBe(1600); // 最终真正停在卡片底部，而不是过期的估算高度
    } finally {
      raf.restore();
    }
  });

  it('刷新页面等瞬时（非 smooth）首屏滚动场景：同样会持续轮询追高，直到真正贴底（修复③）', () => {
    // 复现真实 bug：BubbleList 挂载时 syncScrollState 调用的是 scrollToBottom()（不传 smooth，
    // 即瞬时/behavior:auto），不是 items.length watcher 那条 smooth=true 的路径。若最后一条
    // 恰好是内容复杂的自定义卡片消息，首屏这次瞬时滚动读到的 scrollHeight 往往还是虚拟列表
    // 给的估算值，真实高度要再等几帧才测量出来——旧实现只有 smooth=true 才会起轮询追高，
    // 瞬时滚动这条路径完全没有轮询兜底，会停在卡片中间。
    const raf = mockRaf();
    try {
      const el = smoothMockEl();
      const { scrollToBottom, scrollState } = useAutoScroll(asEl(el));
      scrollToBottom(); // 瞬时：smooth 默认 false，auto 立即跳到当时的 scrollHeight
      expect(el.scrollTop).toBe(1000);

      el.scrollHeight = 1400; // 卡片真实高度分帧测量出来，比首屏估算的更高
      raf.runFrame();
      expect(el.scrollTop).toBe(1400); // 瞬时滚动之后依然有轮询在追高，不是"滚一次就不管了"

      el.scrollHeight = 1600;
      raf.runFrame();
      expect(el.scrollTop).toBe(1600);

      for (let i = 0; i < 4; i += 1) raf.runFrame();
      expect(scrollState.value).toBe('AT_BOTTOM');
      expect(el.scrollTop).toBe(1600); // 最终真正贴底，而不是停在估算高度
    } finally {
      raf.restore();
    }
  });

  it('轮询进行中原生 scroll 事件恰好命中"刚追平"瞬间：不应提前结束轮询（修复④）', () => {
    // 复现真实 bug：批量加载多条历史消息（含若干卡片）时，我们自己每帧 el.scrollTo() 之后，
    // 浏览器几乎必然异步补发一次原生 scroll 事件（此处用直接调用 computeState() 模拟）——
    // 这类事件很容易恰好读到"刚 snap 过去、暂时追平"的瞬间（distance<=threshold）。若这一下
    // 就把轮询清掉，之后内容继续变高（如下一张卡片渲染完成）就没人再追，最终停在半途。
    const raf = mockRaf();
    try {
      const el = smoothMockEl();
      const { scrollToBottom, computeState, scrollState } = useAutoScroll(asEl(el));
      scrollToBottom(true); // 排入第 1 帧轮询

      el.scrollHeight = 6765; // 第 1 帧：内容大幅增高（如批量渲染出的历史消息+卡片）
      raf.runFrame();
      expect(el.scrollTop).toBe(6765); // 立即重定目标追上

      // 模拟浏览器为上面这次 el.scrollTo() 异步补发的原生 scroll 事件：此刻 scrollTop 恰好
      // 追平 scrollHeight，distance=0，但内容马上还会继续变高（下一张卡片还没渲染完）
      computeState();
      expect(scrollState.value).toBe('AT_BOTTOM'); // 判定没错，但轮询不能因此被提前掐掉

      el.scrollHeight = 8152; // 第 2 帧：内容继续增高（另一张卡片渲染完成）
      raf.runFrame();
      expect(el.scrollTop).toBe(8152); // 若轮询被提前掐掉，这里会仍停在 6765（bug 复现值）

      for (let i = 0; i < 4; i += 1) raf.runFrame();
      expect(scrollState.value).toBe('AT_BOTTOM');
      expect(el.scrollTop).toBe(8152); // 最终真正贴底
    } finally {
      raf.restore();
    }
  });

  it('新消息插入引发多个 watcher 几乎同时 follow：不应互相打断，贴底轮询继续追高直到真正稳定', () => {
    // 复现真实场景（BubbleList.vue）：插入新消息时 items.length watcher（own/new-message，
    // smooth=true）与末条消息内容 watcher（streaming，smooth=false，因为"末条消息"换成了
    // 刚插入的新消息，其内容统计值也跟着变化）几乎同时触发。后者不应该把前者刚起步、
    // 一帧都还没轮询过的贴底轮询提前打断，否则虚拟列表/自定义卡片后续继续撑高时就没人
    // 再追，最终会停在内容中间（这正是修复前复现到的真实 bug）。
    const raf = mockRaf();
    try {
      const el = smoothMockEl();
      const { scrollToBottom, follow, scrollState } = useAutoScroll(asEl(el));
      scrollToBottom(true); // own/new-message：排入第 1 帧轮询
      follow('streaming'); // 几乎同时触发的另一个 watcher：smooth=false 的瞬时校正

      el.scrollHeight = 1400; // 虚拟列表/自定义卡片继续异步撑高
      raf.runFrame();
      expect(el.scrollTop).toBe(1400); // 若轮询被打断，这里会仍停在初始 1000（bug 复现值）

      el.scrollHeight = 1600;
      raf.runFrame();
      expect(el.scrollTop).toBe(1600);

      for (let i = 0; i < 4; i += 1) raf.runFrame();
      expect(scrollState.value).toBe('AT_BOTTOM');
      expect(el.scrollTop).toBe(1600); // 最终真正贴底，而不是停在中途
    } finally {
      raf.restore();
    }
  });

  it('环境无 requestAnimationFrame 时安全空转（不抛错，直接按即时位置判定）', () => {
    const prevRAF = globalThis.requestAnimationFrame;
    const prevCAF = globalThis.cancelAnimationFrame;
    (globalThis as any).requestAnimationFrame = undefined;
    (globalThis as any).cancelAnimationFrame = undefined;
    try {
      const el = smoothMockEl();
      const { scrollToBottom, scrollState } = useAutoScroll(asEl(el));
      expect(() => scrollToBottom(true)).not.toThrow();
      // 没有 rAF 可用：不开贴底意图窗口，scrollToBottom 内已乐观置位的 AT_BOTTOM 保留
      expect(scrollState.value).toBe('AT_BOTTOM');
    } finally {
      globalThis.requestAnimationFrame = prevRAF;
      globalThis.cancelAnimationFrame = prevCAF;
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
    const raf = mockRaf();
    try {
      const el = mockEl({ scrollHeight: 1000, scrollTop: 500, clientHeight: 500 }); // 距底=0 → AT_BOTTOM
      const { observeContent, computeState, scrollState } = useAutoScroll(ref(el));
      computeState();
      expect(scrollState.value).toBe('AT_BOTTOM');

      observeContent(mockEl());
      (el as any).scrollHeight = 2000; // 内容增高
      cb();
      expect(el.scrollTop).toBe(2000); // 已贴底

      // cb() 触发的 follow('streaming') 现在也会起一轮贴底轮询（修复③：轮询是否开启与
      // smooth 无关），需要先让它在内容不再变化后自然收尾（连续 4 帧稳定），
      // 期间 computeState 不受用户滚动影响是设计内的短暂保护窗口，排空后才是「真正静止」态。
      raf.drain();

      el.scrollTop = 0; // 用户滚到顶
      computeState();
      expect(scrollState.value).toBe('SCROLLED_UP');
      (el as any).scrollHeight = 3000;
      cb();
      expect(el.scrollTop).toBe(0); // 不贴底
    } finally {
      (globalThis as any).ResizeObserver = prev;
      raf.restore();
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
