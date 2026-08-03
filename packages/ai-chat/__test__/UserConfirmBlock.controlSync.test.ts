import { enableAutoUnmount, mount } from '@vue/test-utils';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import UserConfirmBlock from '../src/components/blocks/UserConfirmBlock.vue';
import type { BlockAction, ConfirmField, ContentBlock } from '../src/types';
import { userConfirmBlock } from '../src/utils/helpers';

type ConfirmBlock = Extract<ContentBlock, { type: 'user_confirm' }>;

enableAutoUnmount(afterEach);

/** 复刻 AiChat 的受控回路：onBlockAction → updateBlock(Object.assign) → props 更新 */
function mountControlled(type: 'radio' | 'checkbox', opts: { land?: boolean } = {}) {
  const land = opts.land ?? true;
  const block = reactive({
    ...userConfirmBlock('f1', [{ name: 'plan', question: 'q', type, options: ['A', 'B', 'C'] }]),
    state: 'awaiting',
  }) as ConfirmBlock;
  const w = mount(UserConfirmBlock, {
    props: {
      block,
      info: { role: 'ai', key: 'm1' },
      onBlockAction: (a: BlockAction) => {
        if (land) Object.assign(block, a.patch);
      },
    },
    attachTo: document.body,
  });
  const inputs = () => w.findAll('input').map((i) => i.element as HTMLInputElement);
  const checkedState = () => inputs().map((el) => el.checked);
  const answer = () => (block.fields[0] as ConfirmField).answer;
  return { w, block, inputs, checkedState, answer };
}

/**
 * 回归：单选「有时要点两次才选中」。
 *
 * 根因是 `:checked` 差分绑定 + radio 的原生跨兄弟副作用：同组另一个 radio 被选中时浏览器会
 * 静默把当前这个的 el.checked 置 false，Vue 的 vnode 仍记着 true；此后重渲染的差分恒为
 * true→true 被跳过，DOM 永远修不回来，用户得再点一次。多选无跨兄弟副作用，故不复现。
 * 组件现在在每次渲染后无条件把控件 DOM 拉回数据态。
 */
describe('UserConfirmBlock — 控件 DOM 与数据态同步', () => {
  it('单选：带外把已选中项置 false（模拟原生 radio 组副作用）后，重渲染拉回数据态', async () => {
    const { w, block, inputs, checkedState, answer } = mountControlled('radio');
    inputs()[0]!.click();
    await nextTick();
    expect(answer()).toBe('A');
    expect(checkedState()).toEqual([true, false, false]);

    // 浏览器在同组另一 radio 被选中时会静默清掉这一个，Vue 对此一无所知
    inputs()[0]!.checked = false;
    // 任意一次与答案无关的重渲染
    (block.fields[0] as ConfirmField).question = 'q2';
    await nextTick();

    expect(answer()).toBe('A');
    expect(checkedState()).toEqual([true, false, false]);
    void w;
  });

  it('单选：连续切换 A→B→C→A，每次都是一击即中', async () => {
    const { inputs, checkedState, answer } = mountControlled('radio');
    for (const [i, expected] of [
      [0, 'A'],
      [1, 'B'],
      [2, 'C'],
      [0, 'A'],
    ] as const) {
      inputs()[i]!.click();
      await nextTick();
      expect(answer()).toBe(expected);
      expect(checkedState()[i]).toBe(true);
      // 单选互斥：其余项必须都为假
      expect(checkedState().filter(Boolean)).toHaveLength(1);
    }
  });

  it('多选：带外改动同样会被拉回，且不影响其它已选项', async () => {
    const { block, inputs, checkedState } = mountControlled('checkbox');
    inputs()[0]!.click();
    await nextTick();
    inputs()[2]!.click();
    await nextTick();
    expect(checkedState()).toEqual([true, false, true]);

    inputs()[2]!.checked = false;
    (block.fields[0] as ConfirmField).question = 'q2';
    await nextTick();
    expect(checkedState()).toEqual([true, false, true]);
  });

  // 边界与取舍：宿主完全不落地补丁时不触发重渲染，同步钩子自然也不跑，DOM 停在用户这次
  // 乐观点击上。刻意不额外强制回滚——宿主异步落地（先请求后回写）是合法用法，强制回滚会让
  // 它先跳回未选中再跳回选中，白闪一下。「宿主没落地」本身已由 updateBlock 的 devWarn 兜底。
  it('宿主不落地补丁时保持乐观显示（不强制回滚，避免异步宿主闪烁）', async () => {
    const { inputs, checkedState, answer } = mountControlled('radio', { land: false });
    inputs()[1]!.click();
    await nextTick();
    expect(answer()).toBeUndefined();
    expect(checkedState()).toEqual([false, true, false]);
  });

  it('宿主异步落地补丁：一次点击即稳定选中，中途不回滚', async () => {
    const block = reactive({
      ...userConfirmBlock('f1', [
        { name: 'plan', question: 'q', type: 'radio', options: ['A', 'B'] },
      ]),
      state: 'awaiting',
    }) as ConfirmBlock;
    const w = mount(UserConfirmBlock, {
      props: {
        block,
        info: { role: 'ai', key: 'm1' },
        onBlockAction: (a: BlockAction) =>
          void Promise.resolve().then(() => Object.assign(block, a.patch)),
      },
      attachTo: document.body,
    });
    const els = () => w.findAll('input').map((i) => (i.element as HTMLInputElement).checked);
    (w.findAll('input')[1]!.element as HTMLInputElement).click();
    await nextTick();
    expect(els()).toEqual([false, true]); // 落地前不回滚
    await nextTick();
    expect((block.fields[0] as ConfirmField).answer).toBe('B');
    expect(els()).toEqual([false, true]); // 落地后仍是它
  });

  it('只读态下的回显同样按数据态渲染', async () => {
    const onBlockAction = vi.fn();
    const block: ConfirmBlock = {
      ...userConfirmBlock('f1', [
        { name: 'plan', question: 'q', type: 'radio', options: ['A', 'B'], answer: 'B' },
      ]),
      state: 'submitted',
    };
    const w = mount(UserConfirmBlock, {
      props: { block, info: { role: 'ai', key: 'm1' }, onBlockAction },
      attachTo: document.body,
    });
    const els = w.findAll('input').map((i) => i.element as HTMLInputElement);
    expect(els.map((e) => e.checked)).toEqual([false, true]);
    expect(els.every((e) => e.disabled)).toBe(true);
  });
});
