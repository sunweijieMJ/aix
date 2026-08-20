import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, effectScope, nextTick } from 'vue';
import { useVisibleMessage } from '../src/composables/useVisibleMessage';

/** 可编程的 IntersectionObserver 替身：记录观察目标，允许手工投递记录 */
class FakeIO {
  static instances: FakeIO[] = [];
  cb: IntersectionObserverCallback;
  observed: Element[] = [];
  disconnected = false;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    FakeIO.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((e) => e !== el);
  }
  disconnect() {
    this.disconnected = true;
    this.observed = [];
  }
  /** 投递「某些 id 进入视口，各自 top 值」 */
  emit(entries: Array<{ id: string; top: number; isIntersecting?: boolean }>) {
    const records = entries.map((e) => ({
      target: document.querySelector(`[data-aix-message-id="${e.id}"]`)!,
      isIntersecting: e.isIntersecting ?? true,
      boundingClientRect: { top: e.top } as DOMRectReadOnly,
    })) as unknown as IntersectionObserverEntry[];
    this.cb(records, this as unknown as IntersectionObserver);
  }
  static latest(): FakeIO {
    const last = FakeIO.instances[FakeIO.instances.length - 1];
    if (!last) throw new Error('没有已创建的 IntersectionObserver 实例');
    return last;
  }
}

function buildRoot(ids: string[]): HTMLElement {
  const root = document.createElement('div');
  for (const id of ids) {
    const el = document.createElement('div');
    el.dataset.aixMessageId = id;
    root.appendChild(el);
  }
  document.body.appendChild(root);
  return root;
}

function withScope<T>(fn: () => T) {
  const scope = effectScope();
  const result = scope.run(fn)!;
  return { result, dispose: () => scope.stop() };
}

describe('useVisibleMessage', () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('观察 ids 对应的 DOM 元素', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1', 'm2', 'm3']) }),
    );
    await nextTick();
    expect(FakeIO.latest().observed).toHaveLength(3);
    dispose();
  });

  it('取视口内最靠下（消息顺序最靠后）的一条作为 activeId', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1', 'm2', 'm3']) }),
    );
    await nextTick();
    FakeIO.latest().emit([
      { id: 'm1', top: 10 },
      { id: 'm2', top: 120 },
      { id: 'm3', top: 200 },
    ]);
    expect(result.activeId.value).toBe('m3');
    dispose();
  });

  it('元素离开视口后不再参与最靠下的比较', async () => {
    const root = buildRoot(['m1', 'm2']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1', 'm2']) }),
    );
    await nextTick();
    const io = FakeIO.latest();
    io.emit([
      { id: 'm1', top: 10 },
      { id: 'm2', top: 200 },
    ]);
    expect(result.activeId.value).toBe('m2');

    io.emit([{ id: 'm2', top: 200, isIntersecting: false }]);
    expect(result.activeId.value).toBe('m1');
    dispose();
  });

  // 点击大纲跳转时滚动会穿过途经消息，若不屏蔽观测，高亮会先乱跳
  it('定位期间屏蔽观测回写', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1', 'm2', 'm3']) }),
    );
    await nextTick();
    const io = FakeIO.latest();

    result.beginNavigate('m3');
    expect(result.activeId.value).toBe('m3');

    // 途经 m1/m2 的相交事件必须被忽略
    io.emit([
      { id: 'm1', top: 10 },
      { id: 'm2', top: 300 },
    ]);
    expect(result.activeId.value).toBe('m3');

    result.endNavigate();
    io.emit([{ id: 'm2', top: 300 }]);
    expect(result.activeId.value).toBe('m2');
    dispose();
  });

  // 连点两条刻度：前一次定位完成不能解掉后一次的闸门
  it('endNavigate 带 id 校验，过期的解闸调用被忽略', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1', 'm2', 'm3']) }),
    );
    await nextTick();
    const io = FakeIO.latest();

    result.beginNavigate('m2'); // 点第一条（慢）
    result.beginNavigate('m3'); // 未完成时点第二条，闸门目标变为 m3
    result.endNavigate('m2'); // 第一条迟到的解闸：应被忽略

    io.emit([{ id: 'm1', top: 500 }]);
    expect(result.activeId.value).toBe('m3'); // 闸门仍生效

    result.endNavigate('m3'); // 正确的解闸
    io.emit([{ id: 'm1', top: 500 }]);
    expect(result.activeId.value).toBe('m1');
    dispose();
  });

  it('root 为 null 时空转，不建 observer', async () => {
    const { dispose } = withScope(() => useVisibleMessage({ root: ref(null), ids: ref(['m1']) }));
    await nextTick();
    expect(FakeIO.instances).toHaveLength(0);
    dispose();
  });

  it('enabled=false 时不建 observer', async () => {
    const root = buildRoot(['m1']);
    const { dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1']), enabled: ref(false) }),
    );
    await nextTick();
    expect(FakeIO.instances).toHaveLength(0);
    dispose();
  });

  it('ids 变化后重建观察集合', async () => {
    const root = buildRoot(['m1', 'm2']);
    const ids = ref(['m1']);
    const { dispose } = withScope(() => useVisibleMessage({ root: ref(root), ids }));
    await nextTick();
    expect(FakeIO.latest().observed).toHaveLength(1);

    ids.value = ['m1', 'm2'];
    await nextTick();
    expect(FakeIO.latest().observed).toHaveLength(2);
    dispose();
  });

  // 虚拟列表滚动会增删行，且不改变 ids（大纲条目来自消息树，与 DOM 挂载无关）。
  // 若只在 setup 时一次性 querySelector，首屏之后进入视口的行永远不被观测，
  // intersecting 只减不增 → 最终为空 → 活跃项冻结在旧值。
  it('DOM 新挂载的行会被补挂观测（ids 不变）', async () => {
    const root = buildRoot(['m1']); // 首屏只挂载 m1
    const { dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1', 'm2', 'm3']) }),
    );
    await nextTick();
    expect(FakeIO.latest().observed).toHaveLength(1);

    // 模拟 virtua 滚动时新挂载 m2、m3（ids 不变）
    for (const id of ['m2', 'm3']) {
      const el = document.createElement('div');
      el.dataset.aixMessageId = id;
      root.appendChild(el);
    }
    // MutationObserver 是微任务级异步
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeIO.latest().observed).toHaveLength(3);
    dispose();
  });

  it('补挂的行能参与活跃项计算', async () => {
    const root = buildRoot(['m1']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1', 'm2']) }),
    );
    await nextTick();
    FakeIO.latest().emit([{ id: 'm1', top: 10 }]);
    expect(result.activeId.value).toBe('m1');

    const el = document.createElement('div');
    el.dataset.aixMessageId = 'm2';
    root.appendChild(el);
    await new Promise((r) => setTimeout(r, 0));

    // 新行进入视口且更靠下 → 成为活跃项
    FakeIO.latest().emit([{ id: 'm2', top: 400 }]);
    expect(result.activeId.value).toBe('m2');
    dispose();
  });

  it('DOM 移除的行从观测与相交集合中摘除', async () => {
    const root = buildRoot(['m1', 'm2']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1', 'm2']) }),
    );
    await nextTick();
    FakeIO.latest().emit([
      { id: 'm1', top: 10 },
      { id: 'm2', top: 400 },
    ]);
    expect(result.activeId.value).toBe('m2');

    // 移除更靠下的 m2 → 活跃项回退到 m1（而非停在已卸载的 m2）
    root.querySelector('[data-aix-message-id="m2"]')!.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(result.activeId.value).toBe('m1');
    dispose();
  });

  // domObserver 是 subtree 观测：流式期 markdown 的 TransitionGroup 会持续增删块元素，
  // 若「移除了任意元素」就重算活跃项，每个 chunk 都要空跑一次 pickLowest。
  // 用 ids getter 的调用次数当探针——pickLowest 内部会 toValue(ids)。
  it('移除的元素不在观测集合中时不重算活跃项', async () => {
    const root = buildRoot(['m1', 'm2']);
    let idsReads = 0;
    const { result, dispose } = withScope(() =>
      useVisibleMessage({
        root: ref(root),
        ids: () => {
          idsReads++;
          return ['m1', 'm2'];
        },
      }),
    );
    await nextTick();
    FakeIO.latest().emit([{ id: 'm1', top: 10 }]);
    expect(result.activeId.value).toBe('m1');

    // 模拟 markdown 块重排：在被观测的行内部增删一个无 data-aix-message-id 的元素
    const row = root.querySelector('[data-aix-message-id="m1"]')!;
    const blockEl = document.createElement('div');
    blockEl.className = 'aix-markdown__block';
    row.appendChild(blockEl);
    await new Promise((r) => setTimeout(r, 0));

    const before = idsReads;
    blockEl.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(idsReads).toBe(before);
    expect(result.activeId.value).toBe('m1');
    dispose();
  });

  it('不在 ids 中的行不被观测', async () => {
    const root = buildRoot(['m1']);
    const { dispose } = withScope(() => useVisibleMessage({ root: ref(root), ids: ref(['m1']) }));
    await nextTick();

    const el = document.createElement('div');
    el.dataset.aixMessageId = '不相关的消息';
    root.appendChild(el);
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeIO.latest().observed).toHaveLength(1);
    dispose();
  });

  it('嵌套多层的行也能被补挂（虚拟列表会包若干层容器）', async () => {
    const root = buildRoot([]);
    const { dispose } = withScope(() => useVisibleMessage({ root: ref(root), ids: ref(['m1']) }));
    await nextTick();

    const wrapper = document.createElement('div');
    const inner = document.createElement('div');
    const el = document.createElement('div');
    el.dataset.aixMessageId = 'm1';
    inner.appendChild(el);
    wrapper.appendChild(inner);
    root.appendChild(wrapper);
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeIO.latest().observed).toHaveLength(1);
    dispose();
  });

  it('scope 销毁后 observer 断开', async () => {
    const root = buildRoot(['m1']);
    const { dispose } = withScope(() => useVisibleMessage({ root: ref(root), ids: ref(['m1']) }));
    await nextTick();
    const io = FakeIO.latest();
    dispose();
    expect(io.disconnected).toBe(true);
  });

  // 环境守卫：无 IntersectionObserver 的环境（SSR / 旧 jsdom）不能抛错
  it('环境无 IntersectionObserver 时安全空转', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const root = buildRoot(['m1']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root: ref(root), ids: ref(['m1']) }),
    );
    await nextTick();
    expect(result.activeId.value).toBeUndefined();
    dispose();
  });
});

describe('useVisibleMessage — 活跃项按消息顺序判定（不依赖已过期的坐标）', () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  // IntersectionObserver 在 threshold:0 下只在「进出视口」时投递记录，一直停在视口内的行
  // 不会再有新记录 —— 存下来的 boundingClientRect.top 是它**进入那一刻**的坐标，之后一直过期。
  // 连续下滚时各行都是「从下沿进入」，记录到的 top 彼此接近甚至相同，按坐标比大小会退化成
  // 「谁先进集合谁赢」，活跃项反而停在更靠上的消息。改按 ids（即文档流）顺序取最靠后的一条。
  it('多行记录到相同 top（各自进入视口那一刻的坐标）→ 取消息顺序最靠后的一条', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root, ids: ['m1', 'm2', 'm3'] }),
    );
    await nextTick();

    // 三行先后从视口下沿进入，记录到的 top 相同
    FakeIO.latest().emit([{ id: 'm1', top: 700 }]);
    FakeIO.latest().emit([{ id: 'm2', top: 700 }]);
    FakeIO.latest().emit([{ id: 'm3', top: 700 }]);
    await nextTick();

    expect(result.activeId.value).toBe('m3');
    dispose();
  });

  it('乱序投递也按消息顺序判定，与记录到的坐标无关', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root, ids: ['m1', 'm2', 'm3'] }),
    );
    await nextTick();

    // 故意给「靠后的消息」一个更小的 top（模拟其记录早已过期）
    FakeIO.latest().emit([
      { id: 'm3', top: 10 },
      { id: 'm1', top: 900 },
    ]);
    await nextTick();

    expect(result.activeId.value).toBe('m3');
    dispose();
  });
});

describe('useVisibleMessage — 导航闸门在滚动静默后自动解除', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // 平滑滚动的动画时长远超「目标行挂载」的时刻，调用方拿到 scrollToBubble 的 resolve
  // 就解闸会让观测在动画途中把高亮抢走。闸门改由「滚动静默」自行解除。
  it('滚动持续期间闸门保持关闭（每次 scroll 重置静默计时）', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root, ids: ['m1', 'm2', 'm3'] }),
    );
    await nextTick();

    result.beginNavigate('m1');
    expect(result.activeId.value).toBe('m1');

    // 每 100ms 一次滚动事件，持续 500ms：静默计时被不断重置，闸门不解
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(100);
      root.dispatchEvent(new Event('scroll'));
    }
    FakeIO.latest().emit([{ id: 'm3', top: 300 }]);
    await nextTick();
    expect(result.activeId.value).toBe('m1');
    dispose();
  });

  it('滚动静默后自动解闸，观测回写恢复', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root, ids: ['m1', 'm2', 'm3'] }),
    );
    await nextTick();

    result.beginNavigate('m1');
    root.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(1000);

    FakeIO.latest().emit([{ id: 'm3', top: 300 }]);
    await nextTick();
    expect(result.activeId.value).toBe('m3');
    dispose();
  });

  it('始终没有滚动事件（目标已在视口内）→ 静默计时到点即解闸', async () => {
    const root = buildRoot(['m1', 'm2']);
    const { result, dispose } = withScope(() => useVisibleMessage({ root, ids: ['m1', 'm2'] }));
    await nextTick();

    result.beginNavigate('m1');
    vi.advanceTimersByTime(1000);

    FakeIO.latest().emit([{ id: 'm2', top: 300 }]);
    await nextTick();
    expect(result.activeId.value).toBe('m2');
    dispose();
  });

  it('滚动事件不断但超过最长锁定时长 → 兜底解闸，闸门不会永久持有', async () => {
    const root = buildRoot(['m1', 'm2', 'm3']);
    const { result, dispose } = withScope(() =>
      useVisibleMessage({ root, ids: ['m1', 'm2', 'm3'] }),
    );
    await nextTick();

    result.beginNavigate('m1');
    // 持续滚动 5s（如用户接管滚轮、或惯性滚动不停）
    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(100);
      root.dispatchEvent(new Event('scroll'));
    }
    FakeIO.latest().emit([{ id: 'm3', top: 300 }]);
    await nextTick();
    expect(result.activeId.value).toBe('m3');
    dispose();
  });
});
