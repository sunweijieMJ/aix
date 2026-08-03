import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import UserConfirmBlock from '../src/components/blocks/UserConfirmBlock.vue';
import type { BlockAction, ConfirmField, ContentBlock } from '../src/types';
import { userConfirmBlock } from '../src/utils/helpers';

type ConfirmBlock = Extract<ContentBlock, { type: 'user_confirm' }>;

function mountCard(fields: ConfirmField[], onBlockAction?: (a: BlockAction) => void) {
  const block: ConfirmBlock = { ...userConfirmBlock('form-1', fields), state: 'awaiting' };
  return mount(UserConfirmBlock, {
    props: { block, info: { role: 'ai', key: 'm1' }, onBlockAction },
    attachTo: document.body,
  });
}

/**
 * 回归：选项的点击热区必须覆盖文字，而不只是方框本身。
 *
 * 实现上依赖 <label> 包裹控件的**隐式关联**，且刻意不加 for/id：uid 来自 useId()，只保证
 * 单个 Vue app 内唯一，同页多 app 会撞 id，而 for 的优先级高于后代查找 —— 撞了就会激活
 * 另一张卡的控件。下面第一个用例正是钉住这条约束（多次独立 mount 后仍各点各的）。
 */
describe('UserConfirmBlock — 选项标签关联', () => {
  it('用 label 包裹控件做隐式关联，不落 for/id（避免跨 app id 碰撞误激活）', () => {
    const w = mountCard([
      { name: 'plan', question: '选择方案', type: 'radio', options: ['A', 'B'] },
    ]);
    const labels = w.findAll('label.aix-user-confirm__option');
    const inputs = w.findAll('input[type="radio"]');

    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.attributes('for')).toBeUndefined();
      // 控件必须是 label 的后代，隐式关联才成立
      expect(label.find('input').exists()).toBe(true);
    }
    // 同字段共用一个 name 分组（单选互斥）
    expect(inputs[0]!.attributes('name')).toBe(inputs[1]!.attributes('name'));
    w.unmount();
  });

  it('同页存在多张卡时，点击各自的选项文字互不串扰', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const cardA = mountCard([{ name: 'plan', question: 'q', type: 'radio', options: ['A'] }], a);
    const cardB = mountCard([{ name: 'plan', question: 'q', type: 'radio', options: ['A'] }], b);

    (cardB.find('.aix-user-confirm__option-label').element as HTMLElement).click();
    await cardB.vm.$nextTick();

    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    cardA.unmount();
    cardB.unmount();
  });

  it('点击选项文字（而非方框）即可作答 — 单选', async () => {
    const onBlockAction = vi.fn();
    const w = mountCard(
      [{ name: 'plan', question: 'q', type: 'radio', options: ['A', 'B'] }],
      onBlockAction,
    );
    (w.findAll('.aix-user-confirm__option-label')[1]!.element as HTMLElement).click();
    await w.vm.$nextTick();

    expect(onBlockAction).toHaveBeenCalledTimes(1);
    const action = onBlockAction.mock.calls[0]![0] as BlockAction;
    expect((action.patch.fields as ConfirmField[])[0]!.answer).toBe('B');
    w.unmount();
  });

  it('点击选项文字（而非方框）即可作答 — 多选可累加', async () => {
    const onBlockAction = vi.fn();
    const w = mountCard(
      [{ name: 'tags', question: 'q', type: 'checkbox', options: ['x', 'y'] }],
      onBlockAction,
    );
    (w.findAll('.aix-user-confirm__option-label')[0]!.element as HTMLElement).click();
    await w.vm.$nextTick();

    const action = onBlockAction.mock.calls[0]![0] as BlockAction;
    expect((action.patch.fields as ConfirmField[])[0]!.answer).toEqual(['x']);
    w.unmount();
  });

  it('只读态（非 awaiting）下点击文字不产生作答', async () => {
    const onBlockAction = vi.fn();
    const block: ConfirmBlock = {
      ...userConfirmBlock('form-1', [
        { name: 'plan', question: 'q', type: 'radio', options: ['A', 'B'] },
      ]),
      state: 'submitted',
    };
    const w = mount(UserConfirmBlock, {
      props: { block, info: { role: 'ai', key: 'm1' }, onBlockAction },
      attachTo: document.body,
    });
    (w.find('.aix-user-confirm__option-label').element as HTMLElement).click();
    await w.vm.$nextTick();
    expect(onBlockAction).not.toHaveBeenCalled();
    w.unmount();
  });
});
