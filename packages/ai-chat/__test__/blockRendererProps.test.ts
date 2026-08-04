import { describe, it, expect } from 'vitest';
import type { BlockRendererProps, ContentBlock } from '../src/types';

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
