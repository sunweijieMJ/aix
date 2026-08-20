import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useQuoteMenu } from '../src/composables/useQuoteMenu';
import type { ActiveSelection } from '../src/composables/useTextSelection';
import type { QuoteActionsItems } from '../src/types';

const mkOpts = (actions: QuoteActionsItems) => ({
  selection: ref<ActiveSelection | null>(null),
  actions: () => actions,
  insertQuote: vi.fn(),
  focusSender: vi.fn(),
  copy: vi.fn(),
});

/**
 * BUILTIN 是对象字面量、继承 Object.prototype，而 actions 可能来自后端配置 / JS 消费方，
 * 未校验就 BUILTIN[key].label(...) 会抛穿整个划词菜单。
 * 对照 BubbleActions：它对未知内置 key 只是模板分支全不命中、静默跳过，不抛。
 */
describe('useQuoteMenu — 未知 / 原型链 action key', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('未知字符串 key 被跳过，合法项照常渲染', () => {
    const m = useQuoteMenu(mkOpts(['explain', 'nope' as never, 'copy']));
    expect(m.items.value.map((i) => i.key)).toEqual(['explain', 'copy']);
  });

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    '原型链键 "%s" 被跳过，不抛错',
    (key) => {
      const m = useQuoteMenu(mkOpts([key as never, 'copy']));
      expect(m.items.value.map((i) => i.key)).toEqual(['copy']);
    },
  );

  // 在组件外调用 composable 时 useLocale 的 inject 会产生一条无关的 Vue 警告，
  // 故只筛本 composable 自己发出的护栏告警
  const guardWarnings = (): string[] =>
    warn.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((s: string) => s.includes('quote actions'));

  it('跳过未知 key 时告警一次，重复读取不刷屏', () => {
    const m = useQuoteMenu(mkOpts(['nope' as never]));
    void m.items.value;
    void m.items.value;
    expect(guardWarnings()).toHaveLength(1);
    expect(guardWarnings()[0]).toContain('nope');
  });

  it('invoke 未知 key 不抛错、不产生副作用', () => {
    const opts = mkOpts(['nope' as never, 'copy']);
    const m = useQuoteMenu(opts);
    expect(() => m.invoke('nope')).not.toThrow();
    expect(opts.copy).not.toHaveBeenCalled();
  });

  it('对照：全部为内置 key 时不告警，四项齐全', () => {
    const m = useQuoteMenu(mkOpts(['explain', 'ask', 'translate', 'copy']));
    expect(m.items.value.map((i) => i.key)).toEqual(['explain', 'ask', 'translate', 'copy']);
    expect(guardWarnings()).toHaveLength(0);
  });

  it('对照：自定义对象项与内置项混排照常工作', () => {
    const onClick = vi.fn();
    const m = useQuoteMenu(mkOpts(['copy', { key: 'mine', label: '我的', onClick }]));
    expect(m.items.value.map((i) => i.key)).toEqual(['copy', 'mine']);
  });
});
