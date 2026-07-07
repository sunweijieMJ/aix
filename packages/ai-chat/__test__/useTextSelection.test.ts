import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { EffectScope } from 'vue';
import { useTextSelection } from '../src/composables/useTextSelection';

/** 搭一个符合 Task 4 打标契约的迷你消息 DOM */
const buildDom = () => {
  document.body.innerHTML = `
    <div id="root">
      <div class="aix-bubble" data-aix-message-id="ai-1" data-aix-role="ai">
        <div class="aix-bubble__content">
          <div data-aix-block-id="b1">快速排序的<strong>平均复杂度</strong>是低的。<a href="#">链接文字</a></div>
        </div>
      </div>
      <div class="aix-bubble" data-aix-message-id="u-1" data-aix-role="user">
        <div class="aix-bubble__content"><div data-aix-block-id="b2">用户说的话</div></div>
      </div>
    </div>`;
  return document.getElementById('root') as HTMLElement;
};

/** 选中某文本节点的 [from, to) 并派发 selectionchange */
const selectText = (node: Node, from: number, to: number) => {
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
};

const firstTextNode = (selector: string): Node => document.querySelector(selector)!.firstChild!;

let scope: EffectScope;
beforeEach(() => {
  vi.useFakeTimers();
  scope = effectScope();
});
afterEach(() => {
  scope.stop();
  vi.useRealTimers();
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

const setup = (root: HTMLElement, extra: Record<string, unknown> = {}) =>
  scope.run(() => useTextSelection({ root: ref(root), ...extra }))!;

describe('useTextSelection / PC 拖选', () => {
  it('AI 气泡内选区 → active，anchor 携带 messageId/blockId/exact/偏移/上下文', async () => {
    const root = buildDom();
    const r = setup(root);
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    selectText(firstTextNode('[data-aix-block-id="b1"]'), 0, 4); // 「快速排序」
    vi.runAllTimers();
    await nextTick();
    expect(r.active.value).not.toBeNull();
    const a = r.active.value!;
    expect(a.text).toBe('快速排序');
    expect(a.source).toBe('pointer');
    expect(a.anchor.source).toMatchObject({ messageId: 'ai-1', blockId: 'b1', role: 'ai' });
    expect(a.anchor.start).toBe(0);
    expect(a.anchor.end).toBe(4);
    expect(a.anchor.suffix).toContain('的');
  });

  it('user 气泡（默认 roles=[ai]）不触发', () => {
    const root = buildDom();
    const r = setup(root);
    selectText(firstTextNode('[data-aix-block-id="b2"]'), 0, 3);
    vi.runAllTimers();
    expect(r.active.value).toBeNull();
  });

  it('落在 a 链接内不触发（排除交互元素）', () => {
    const root = buildDom();
    const r = setup(root);
    selectText(document.querySelector('a')!.firstChild!, 0, 2);
    vi.runAllTimers();
    expect(r.active.value).toBeNull();
  });

  it('选区收窄为 collapsed → active 清空；clear() 主动清空', () => {
    const root = buildDom();
    const r = setup(root);
    selectText(firstTextNode('[data-aix-block-id="b1"]'), 0, 4);
    vi.runAllTimers();
    expect(r.active.value).not.toBeNull();
    window.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    vi.runAllTimers();
    expect(r.active.value).toBeNull();
  });

  it('enabled=false 时不产出', () => {
    const root = buildDom();
    const r = setup(root, { enabled: ref(false) });
    selectText(firstTextNode('[data-aix-block-id="b1"]'), 0, 4);
    vi.runAllTimers();
    expect(r.active.value).toBeNull();
  });

  it('无近期指针活动的选区变化（keyboard 默认 true）→ source=keyboard', () => {
    const root = buildDom();
    const r = setup(root);
    selectText(firstTextNode('[data-aix-block-id="b1"]'), 0, 4);
    vi.advanceTimersByTime(1000); // 超过指针活动窗口
    document.dispatchEvent(new Event('selectionchange'));
    vi.runAllTimers();
    expect(r.active.value?.source).toBe('keyboard');
  });

  it('keyboard:false 时忽略键盘触发的选区变化，active 保持 null', () => {
    const root = buildDom();
    const r = setup(root, { keyboard: false });
    selectText(firstTextNode('[data-aix-block-id="b1"]'), 0, 4);
    vi.advanceTimersByTime(1000); // 超过指针活动窗口，确保被判定为 keyboard 来源
    document.dispatchEvent(new Event('selectionchange'));
    vi.runAllTimers();
    expect(r.active.value).toBeNull();
  });

  it('选区跨两条消息 → 钳制到起点气泡，text 只含气泡 A 内容；缺块覆盖时 start/end 退化为 undefined', async () => {
    const root = buildDom();
    const r = setup(root);
    const range = document.createRange();
    range.setStart(firstTextNode('[data-aix-block-id="b1"]'), 0);
    range.setEnd(firstTextNode('[data-aix-block-id="b2"]'), 2); // 落在气泡 B（user）内
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    vi.runAllTimers();
    await nextTick();
    expect(r.active.value).not.toBeNull();
    const a = r.active.value!;
    expect(a.text).toContain('快速排序');
    expect(a.text).not.toContain('用户说的话');
    expect(a.anchor.source.messageId).toBe('ai-1');
    // 钳制后 range 终点落在气泡容器上，不在 blockEl(b1) 内，rangeToOffsets 判定退化为 null
    expect(a.anchor.start).toBeUndefined();
    expect(a.anchor.end).toBeUndefined();
  });

  it('跨消息选区钳制到内容区末尾：气泡 footer 文本不混入 exact，偏移换算不退化', async () => {
    // 气泡根在 content 之后含 footer（模拟分支切换器 "‹ 1/2 ›" 的真实文本节点）；
    // content 内无 block 打标，故 offsetHost 退回 content。钳到 content 末尾使终点留在
    // offsetHost 内，rangeToOffsets 才能成立、getContext 得以计算出 prefix
    document.body.innerHTML = `
      <div id="root">
        <div class="aix-bubble" data-aix-message-id="ai-1" data-aix-role="ai">
          <div class="aix-bubble__content">人工智能回答的正文内容</div>
          <div class="aix-bubble__footer">‹ 1/2 ›</div>
        </div>
        <div class="aix-bubble" data-aix-message-id="u-1" data-aix-role="user">
          <div class="aix-bubble__content">用户说的话</div>
        </div>
      </div>`;
    const root = document.getElementById('root') as HTMLElement;
    const r = setup(root);
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const range = document.createRange();
    // 从内容区偏移 2 起选（留出前缀），终点落在后一条消息内 → 跨消息选区（原始终点越过 footer）
    range.setStart(
      document.querySelector('[data-aix-message-id="ai-1"] .aix-bubble__content')!.firstChild!,
      2,
    );
    range.setEnd(
      document.querySelector('[data-aix-message-id="u-1"] .aix-bubble__content')!.firstChild!,
      2,
    );
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    vi.runAllTimers();
    await nextTick();
    expect(r.active.value).not.toBeNull();
    const a = r.active.value!;
    expect(a.text).toBe('智能回答的正文内容'); // 只含气泡 A 内容区文本
    expect(a.text).not.toContain('1/2'); // footer 分支切换器文本不混入
    expect(a.text).not.toContain('用户说的话');
    // 终点钳到内容区末尾（仍在 offsetHost=content 内），rangeToOffsets 不再返回 null，
    // getContext 据此算出前缀；无 block 打标故 anchor.start/end 按设计仍为消息级（undefined）
    expect(a.anchor.prefix).toBe('人工');
    expect(a.anchor.start).toBeUndefined();
  });

  it('选区整体位于内容区之前（header 插槽内选词）→ 不钳制，exact 不向前扩张成整段正文', async () => {
    // 钳制用终点边界比较而非 contains：终点在 content 之前时 setEnd 会把选区向前
    // 「扩张」成「header 选中点 → 整段正文」，此场景必须保持原选区不动
    document.body.innerHTML = `
      <div id="root">
        <div class="aix-bubble" data-aix-message-id="ai-1" data-aix-role="ai">
          <div class="aix-bubble__header">助手昵称与时间戳</div>
          <div class="aix-bubble__content">人工智能回答的正文内容</div>
        </div>
      </div>`;
    const root = document.getElementById('root') as HTMLElement;
    const r = setup(root);
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const headerText = document.querySelector('.aix-bubble__header')!.firstChild!;
    const range = document.createRange();
    range.setStart(headerText, 0);
    range.setEnd(headerText, 4); // 仅选中 header 内的「助手昵称」
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    vi.runAllTimers();
    await nextTick();
    expect(r.active.value).not.toBeNull();
    expect(r.active.value!.text).toBe('助手昵称'); // 未被扩张成「助手昵称…正文内容」
  });

  it('选区收窄为 collapsed 时同步清空 savedRange，避免 preserve() 恢复过期选区', () => {
    const root = buildDom();
    const r = setup(root);
    selectText(firstTextNode('[data-aix-block-id="b1"]'), 0, 4);
    vi.runAllTimers();
    expect(r.active.value).not.toBeNull();
    window.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    vi.runAllTimers();
    expect(r.active.value).toBeNull();
    r.preserve();
    // savedRange 已被清空，preserve() 应为 no-op，不应恢复出旧选区
    expect(window.getSelection()!.rangeCount).toBe(0);
  });

  it('clear() 取消 pending 的 readTimer：selectionchange 已调度但未触发时 clear，定时器触发后不应复活选区', () => {
    const root = buildDom();
    const r = setup(root);
    // 先让选区正常生效（结算 jsdom 对 Selection 变化的原生异步 selectionchange，避免干扰下面的断言）
    selectText(firstTextNode('[data-aix-block-id="b1"]'), 0, 4);
    vi.runAllTimers();
    expect(r.active.value).not.toBeNull();
    // 再触发一次 selectionchange（不改变底层 Selection，不会引出 jsdom 原生异步派发）→
    // 调度 readTimer（120ms 去抖，尚未 runAllTimers）
    document.dispatchEvent(new Event('selectionchange'));
    // 立即 clear()，此时 readTimer 仍处于 pending 状态
    r.clear();
    expect(r.active.value).toBeNull();
    // 让 pending 的 readTimer（若未被取消）触发
    vi.runAllTimers();
    // clear() 后 pending 读取不应复活选区
    expect(r.active.value).toBeNull();
  });

  it('clear() 主动折叠 DOM 选区：残留选区不会被后续 selectionchange（如聚焦输入框）重新读回 active', () => {
    const root = buildDom();
    const r = setup(root);
    selectText(firstTextNode('[data-aix-block-id="b1"]'), 0, 4);
    vi.runAllTimers();
    expect(r.active.value).not.toBeNull();
    r.clear();
    // DOM 选区应被主动折叠（而不仅仅是内部 active/savedRange 置空）
    expect(window.getSelection()!.rangeCount).toBe(0);
    // 模拟菜单关闭后聚焦输入框引发的 selectionchange：残留选区已被折叠，不应复活 active
    document.dispatchEvent(new Event('selectionchange'));
    vi.runAllTimers();
    expect(r.active.value).toBeNull();
  });
});

describe('useTextSelection / 移动长按整条（模式 B）', () => {
  const touch = (target: Element, type: string, x = 10, y = 10) => {
    const e = new Event(type, { bubbles: true, cancelable: true }) as Event & {
      touches: { clientX: number; clientY: number }[];
    };
    Object.defineProperty(e, 'touches', { value: [{ clientX: x, clientY: y }] });
    target.dispatchEvent(e);
  };

  it('长按 AI 气泡 → trigger（整条消息，无 start/end，不动选区）', () => {
    const root = buildDom();
    const r = setup(root);
    const block = document.querySelector('[data-aix-block-id="b1"]')!;
    touch(block, 'touchstart');
    vi.advanceTimersByTime(500);
    expect(r.trigger.value).not.toBeNull();
    const t = r.trigger.value!;
    expect(t.defaultTarget.source.messageId).toBe('ai-1');
    expect(t.defaultTarget.exact).toContain('快速排序');
    expect(t.defaultTarget.start).toBeUndefined();
    expect(t.point).toEqual({ x: 10, y: 10 });
  });

  it('长按未到时限先 touchend → 取消；移动超阈值 → 取消', () => {
    const root = buildDom();
    const r = setup(root);
    const block = document.querySelector('[data-aix-block-id="b1"]')!;
    touch(block, 'touchstart');
    vi.advanceTimersByTime(200);
    touch(block, 'touchend');
    vi.advanceTimersByTime(500);
    expect(r.trigger.value).toBeNull();

    touch(block, 'touchstart', 10, 10);
    touch(block, 'touchmove', 30, 10); // 超过 moveThreshold=10
    vi.advanceTimersByTime(500);
    expect(r.trigger.value).toBeNull();
  });

  it('长按 user 气泡（默认 roles）不触发', () => {
    const root = buildDom();
    const r = setup(root);
    touch(document.querySelector('[data-aix-block-id="b2"]')!, 'touchstart');
    vi.advanceTimersByTime(500);
    expect(r.trigger.value).toBeNull();
  });

  it('长按进行中第二指按下 → 取消长按（双指不应触发整条选取）', () => {
    const root = buildDom();
    const r = setup(root);
    const block = document.querySelector('[data-aix-block-id="b1"]')!;
    touch(block, 'touchstart'); // 单指按下，开始计时
    const secondFinger = new Event('touchstart', { bubbles: true, cancelable: true }) as Event & {
      touches: { clientX: number; clientY: number }[];
    };
    Object.defineProperty(secondFinger, 'touches', {
      value: [
        { clientX: 10, clientY: 10 },
        { clientX: 50, clientY: 50 },
      ],
    });
    block.dispatchEvent(secondFinger); // 第二指落下，touches.length=2
    vi.advanceTimersByTime(500);
    expect(r.trigger.value).toBeNull();
  });

  it('长按进行中（trigger 尚未置位）contextmenu 也被抑制，缓解系统菜单竞态', () => {
    const root = buildDom();
    setup(root);
    const block = document.querySelector('[data-aix-block-id="b1"]')!;
    touch(block, 'touchstart');
    vi.advanceTimersByTime(200); // 未到 500ms 长按阈值，trigger 尚未置位
    const e = new Event('contextmenu', { bubbles: true, cancelable: true });
    block.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
