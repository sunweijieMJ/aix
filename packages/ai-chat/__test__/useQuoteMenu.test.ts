import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import type { EffectScope } from 'vue';
import { useQuoteMenu } from '../src/composables/useQuoteMenu';
import type { ActiveSelection, LongPressTrigger } from '../src/composables/useTextSelection';
import type { Quote, QuoteActionContext } from '../src/types';

const makeActive = (over: Partial<ActiveSelection> = {}): ActiveSelection => ({
  text: '选中文本',
  anchor: {
    source: { messageId: 'ai-1', blockId: 'b1', role: 'ai' },
    exact: '选中文本',
    start: 0,
    end: 4,
  },
  getRect: () => new DOMRect(0, 0, 10, 10),
  getClientRects: () => [],
  contextElement: document.createElement('div'),
  source: 'pointer',
  ...over,
});

const makeTrigger = (): LongPressTrigger => ({
  point: { x: 5, y: 5 },
  defaultTarget: { source: { messageId: 'ai-2', role: 'ai' }, exact: '整条消息文本' },
  contextElement: document.createElement('div'),
});

// 注：不用 `ReturnType<typeof vi.fn>` 标注字段类型——对未调用的泛型函数取 ReturnType 会按类型参数的
// 约束（Procedure | Constructable）而非默认值实例化，导致 di 与 UseQuoteMenuOptions 的具体函数签名
// （如 `(q: Quote) => void`）类型不兼容。改用工厂函数让 TS 按实际调用（默认参数）推断具体类型。
const createDi = () => ({
  insertQuote: vi.fn(),
  setSenderValue: vi.fn(),
  focusSender: vi.fn(),
  copy: vi.fn(),
  onLocate: vi.fn(),
});

let scope: EffectScope;
let di: ReturnType<typeof createDi>;
beforeEach(() => {
  scope = effectScope();
  di = createDi();
});

const setup = (
  selection = ref<ActiveSelection | null>(null),
  trigger = ref<LongPressTrigger | null>(null),
  extra: Record<string, unknown> = {},
) => ({
  selection,
  trigger,
  menu: scope.run(() => useQuoteMenu({ selection, trigger, ...di, ...extra }))!,
});

describe('useQuoteMenu / 可见性与模式', () => {
  it('active 出现 → visible + selecting + source=pointer；close 后隐藏', async () => {
    const { selection, menu } = setup();
    expect(menu.visible.value).toBe(false);
    selection.value = makeActive();
    await nextTick();
    expect(menu.visible.value).toBe(true);
    expect(menu.mode.value).toBe('selecting');
    expect(menu.source.value).toBe('pointer');
    menu.close();
    expect(menu.visible.value).toBe(false);
  });

  it('trigger 出现 → visible + menu 态 + source=longpress；active 优先于 trigger', async () => {
    const { selection, trigger, menu } = setup();
    trigger.value = makeTrigger();
    await nextTick();
    expect(menu.mode.value).toBe('menu');
    expect(menu.source.value).toBe('longpress');
    selection.value = makeActive();
    await nextTick();
    expect(menu.mode.value).toBe('selecting'); // 作用对象 = active 优先
  });

  it('默认动作解析为 4 项且带 locale 文案', async () => {
    const { selection, menu } = setup();
    selection.value = makeActive();
    await nextTick();
    expect(menu.items.value.map((i) => i.key)).toEqual(['explain', 'ask', 'translate', 'copy']);
    expect(menu.items.value[0]!.label).toBe('解释');
  });
});

describe('useQuoteMenu / 内置动作（以「是否写 textarea」区分三条出口）', () => {
  it('explain：insertQuote(intent=explain) + focusSender + close，textarea 不动', async () => {
    const { selection, menu } = setup();
    selection.value = makeActive();
    await nextTick();
    menu.invoke('explain');
    expect(di.insertQuote).toHaveBeenCalledTimes(1);
    const q: Quote = di.insertQuote.mock.calls[0]![0];
    expect(q.intent).toBe('explain');
    expect(q.anchor.exact).toBe('选中文本');
    expect(di.focusSender).toHaveBeenCalled();
    expect(di.setSenderValue).not.toHaveBeenCalled();
    expect(menu.visible.value).toBe(false);
  });

  it('ask：insertQuote(intent=ask) + 仅聚焦（内置无 prompt）+ 不自动 send', async () => {
    const send = vi.fn();
    const { selection, menu } = setup(undefined, undefined, { send });
    selection.value = makeActive();
    await nextTick();
    menu.invoke('ask');
    expect(di.insertQuote.mock.calls[0]![0].intent).toBe('ask');
    expect(di.setSenderValue).not.toHaveBeenCalled();
    expect(di.focusSender).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('copy：仅复制 exact，不加 chip、不聚焦', async () => {
    const { selection, menu } = setup();
    selection.value = makeActive();
    await nextTick();
    menu.invoke('copy');
    expect(di.copy).toHaveBeenCalledWith('选中文本');
    expect(di.insertQuote).not.toHaveBeenCalled();
    expect(menu.visible.value).toBe(false);
  });

  // 回归：exact 已被 normalizeText 折叠成单行，复制多行选区（代码块等）必须用原文
  it('copy：anchor 含 rawText 时优先复制原文（保留换行）', async () => {
    const { selection, menu } = setup();
    selection.value = makeActive({
      anchor: {
        source: { messageId: 'ai-1', blockId: 'b1', role: 'ai' },
        exact: '第一行 第二行',
        rawText: '第一行\n第二行',
      },
    });
    await nextTick();
    menu.invoke('copy');
    expect(di.copy).toHaveBeenCalledWith('第一行\n第二行');
  });

  it('menu 态（长按整条）下动作作用于 defaultTarget', async () => {
    const { trigger, menu } = setup();
    trigger.value = makeTrigger();
    await nextTick();
    menu.invoke('translate');
    const q: Quote = di.insertQuote.mock.calls[0]![0];
    expect(q.intent).toBe('translate');
    expect(q.anchor.source.messageId).toBe('ai-2');
    expect(q.anchor.start).toBeUndefined(); // 整条：无子范围偏移
  });
});

describe('useQuoteMenu / 自定义动作与回链', () => {
  it('自定义动作拿到完整 ctx（quote/message/insertQuote/ask/copy/close）', async () => {
    const onClick = vi.fn();
    const messageFor = vi.fn().mockReturnValue({ id: 'ai-1', role: 'ai', content: [] });
    const { selection, menu } = setup(undefined, undefined, {
      actions: ['explain', { key: 'save', label: '加入错题本', onClick }],
      messageFor,
    });
    selection.value = makeActive();
    await nextTick();
    expect(menu.items.value.map((i) => i.key)).toEqual(['explain', 'save']);
    menu.invoke('save');
    const ctx: QuoteActionContext = onClick.mock.calls[0]![0];
    expect(ctx.quote.anchor.exact).toBe('选中文本');
    expect(ctx.message?.id).toBe('ai-1');
    ctx.ask(undefined, '帮我讲讲');
    expect(di.setSenderValue).toHaveBeenCalledWith('帮我讲讲'); // ask 带 prompt → 写 textarea
  });

  it('locate 透传 onLocate(anchor)', () => {
    const { menu } = setup();
    const q: Quote = { id: 'q1', anchor: { source: { messageId: 'm' }, exact: 'x' } };
    menu.locate(q);
    expect(di.onLocate).toHaveBeenCalledWith(q.anchor);
  });
});
