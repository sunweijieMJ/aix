import { describe, it, expect } from 'vitest';
import { BUILTIN_BLOCK_RENDERERS } from '../src/components/blocks/builtinRenderers';
import type { BlockRendererProps, ContentBlock } from '../src/types';

/** 编译后 SFC 的运行时 props 声明（`defineProps<T>()` 的产物） */
type RuntimeProps = Record<string, { type?: unknown } | undefined>;
const runtimeProps = (comp: unknown): RuntimeProps =>
  ((comp as { props?: RuntimeProps }).props ?? {}) as RuntimeProps;

/**
 * `BlockRendererProps` 的契约锁。
 *
 * 这批断言由 `vue-tsc --noEmit -p tsconfig.json` 校验（tsconfig 的 include 覆盖 __test__），
 * vitest 侧只负责让文件被执行到——真正的价值在 `@ts-expect-error`：没有这些**负向**断言，
 * "泛型收窄生效"就是一句无法证伪的话（把 block 退回成 any 也照样能通过正向赋值）。
 */
describe('BlockRendererProps — 块渲染器 props 契约', () => {
  it('按块类型精确收窄 block，无需手写 Extract', () => {
    const props: BlockRendererProps<'user_confirm'> = {
      block: {
        id: 'b1',
        type: 'user_confirm',
        formId: 'f1',
        fields: [{ name: 'q', question: '选一个', type: 'radio', options: ['A', 'B'] }],
        state: 'awaiting',
      },
    };
    // 收窄后可直接访问该块类型独有的字段
    expect(props.block.formId).toBe('f1');
    expect(props.block.fields[0]!.options).toEqual(['A', 'B']);

    // @ts-expect-error text 是 text/reasoning 块的字段，不在 user_confirm 上
    expect(props.block.text).toBeUndefined();
  });

  it('拒绝与泛型参数不符的 block', () => {
    const wrong: BlockRendererProps<'chart'> = {
      // @ts-expect-error 声明为 chart 渲染器却传入 image 块
      block: { id: 'b2', type: 'image', images: [{ url: 'https://x/a.png' }] },
    };
    expect(wrong.block.type).toBe('image'); // 运行时不做校验，仅类型层拦截
  });

  it('info / typing / 两个回调均为可选，只传 block 即可满足契约', () => {
    const minimal: BlockRendererProps<'text'> = {
      block: { id: 'b3', type: 'text', text: 'hi' },
    };
    expect(minimal.info).toBeUndefined();
    expect(minimal.onBlockAction).toBeUndefined();
    expect(minimal.onBlockIntent).toBeUndefined();
  });

  it('两条上抛通道的签名分别对齐 BlockAction / BlockIntent', () => {
    const seen: string[] = [];
    const props: BlockRendererProps<'chart'> = {
      block: { id: 'b4', type: 'chart', engine: 'echarts', kind: 'bar', spec: {} },
      info: { role: 'ai', key: 'm1', status: 'success' },
      typing: false,
      onBlockAction: (action) => seen.push(`action:${action.type}:${action.blockId}`),
      onBlockIntent: (intent) => seen.push(`intent:${intent.type}`),
    };
    props.onBlockAction?.({ blockId: 'b4', type: 'switch-kind', patch: { kind: 'line' } });
    props.onBlockIntent?.({ blockId: 'b4', type: 'drill-down', payload: { i: 1 } });
    expect(seen).toEqual(['action:switch-kind:b4', 'intent:drill-down']);
  });

  it('省略泛型参数时 block 为全部块类型的联合（通用渲染器场景）', () => {
    const generic: BlockRendererProps = {
      block: { id: 'b5', type: 'sources', items: [{ title: 't' }] },
    };
    // 联合态下须先判别再取字段，与直接用 ContentBlock 一致
    const asUnion: ContentBlock = generic.block;
    if (asUnion.type === 'sources') expect(asUnion.items).toHaveLength(1);

    // @ts-expect-error 未收窄时不能直接访问某一分支的独有字段
    expect(generic.block.items).toBeDefined();
  });
});

/**
 * 内置渲染器对契约的**运行时**遵从（上面那批断言只锁类型层的 `BlockRendererProps` 本身）。
 *
 * 遍历注册表而非逐个块写单点用例：这批声明是各文件手抄的，抄漏 / 抄窄不会报错，
 * 而单点用例同样要"记得补"——漏补时静默通过，与它要防的漂移是同一种失败。
 * 遍历后新增块自动纳入覆盖。
 */
describe('内置块渲染器 — 契约遵从（遍历注册表，新增块自动覆盖）', () => {
  const entries = Object.entries(BUILTIN_BLOCK_RENDERERS);

  it('注册表非空（防止导入形态变化导致下面的遍历静默空转）', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it.each(entries)('%s：typing 接受 boolean 与节奏配置对象两种形态', (_type, Comp) => {
    const decl = runtimeProps(Comp).typing;
    // 不声明 typing 是允许的（注册表透传的多余 prop 会落进 attrs，各块已 inheritAttrs:false）；
    // 一旦声明，就必须同时容纳 BubbleTypingConfig —— 收窄成 Boolean 时 Vue 会对
    // `<BubbleList :typing="{ step, interval }">` 逐次渲染打 "Invalid prop" 告警。
    if (!decl) return;
    const t = decl.type;
    const accepted = Array.isArray(t) ? t : [t];
    expect(accepted).toContain(Object);
    expect(accepted).toContain(Boolean);
  });

  it.each(entries)('%s：block 必填，info 可选（支持脱离 Bubble 单独挂载测试）', (_type, Comp) => {
    const p = runtimeProps(Comp);
    expect(p.block).toBeDefined();
    expect((p.block as { required?: boolean }).required).toBe(true);
    if (p.info) expect((p.info as { required?: boolean }).required).toBe(false);
  });
});
