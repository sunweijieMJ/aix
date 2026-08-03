import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import UserConfirmBlock from '../src/components/blocks/UserConfirmBlock.vue';
import type { BlockAction, BlockIntent, ConfirmField, ContentBlock } from '../src/types';
import { userConfirmBlock } from '../src/utils/helpers';

type ConfirmBlock = Extract<ContentBlock, { type: 'user_confirm' }>;

const FIELDS: ConfirmField[] = [
  { name: 'plan', question: '选择方案', type: 'radio', options: ['A', 'B'], defaultValue: 'A' },
  { name: 'note', question: '其他要求', type: 'text' },
];

const TIMEOUT = { hintAt: 75_000, autoFillAt: 105_000, autoSubmitAt: 120_000 };

function mountCard(opts: {
  createdAt?: number;
  timeout?: ConfirmBlock['timeout'];
  onBlockAction?: (a: BlockAction) => void;
  onBlockIntent?: (i: BlockIntent) => void;
}) {
  const block: ConfirmBlock = {
    ...userConfirmBlock('form-1', FIELDS),
    state: 'awaiting',
    ...(opts.createdAt !== undefined ? { createdAt: opts.createdAt } : {}),
    ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
  };
  return mount(UserConfirmBlock, {
    props: {
      block,
      info: { role: 'ai', key: 'm1', status: 'success' },
      onBlockAction: opts.onBlockAction,
      onBlockIntent: opts.onBlockIntent,
    },
  });
}

/**
 * 回归：awaiting 卡在「createdAt 已过 autoSubmitAt」时挂载。
 *
 * useConfirmDeadline 的装配 watch 是 immediate，会在其构造函数返回**之前**同步补发已过点的
 * 节点，从而回调进组件的 submit()。submit() 里若直接闭包下方声明的 `deadline` 常量，就会撞上
 * TDZ 抛 ReferenceError 打崩整个气泡渲染。触发路径极常规：刷新页面恢复一个久置的历史会话。
 */
describe('UserConfirmBlock — 挂载时已超时（补发时间线）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('挂载即补发整条时间线，不抛错且只提交一次', async () => {
    const onBlockIntent = vi.fn();
    const onBlockAction = vi.fn();
    expect(() =>
      mountCard({
        createdAt: Date.now() - 600_000,
        timeout: TIMEOUT,
        onBlockAction,
        onBlockIntent,
      }),
    ).not.toThrow();

    expect(onBlockIntent).toHaveBeenCalledTimes(1);
    const intent = onBlockIntent.mock.calls[0]![0] as BlockIntent;
    expect(intent.type).toBe('submit');
    // autoSubmit 前必定先补上 autoFill，答案不会因跳点而丢
    expect(intent.payload).toMatchObject({ autoFill: true });
    expect((intent.payload as { fields: ConfirmField[] }).fields[0]!.answer).toBe('A');
  });

  it('补发提交后卡片进入冻结态，且不再有残留定时器二次提交', async () => {
    const onBlockIntent = vi.fn();
    const wrapper = mountCard({
      createdAt: Date.now() - 600_000,
      timeout: TIMEOUT,
      onBlockIntent,
    });
    await nextTick();

    expect(wrapper.find('.aix-user-confirm__submit').attributes('disabled')).toBeDefined();
    vi.advanceTimersByTime(600_000);
    await nextTick();
    expect(onBlockIntent).toHaveBeenCalledTimes(1);
  });

  it('只过了 hintAt 时挂载：补发提示但不提交', async () => {
    const onBlockIntent = vi.fn();
    const wrapper = mountCard({
      createdAt: Date.now() - 80_000, // > hintAt(75s)，< autoFillAt(105s)
      timeout: TIMEOUT,
      onBlockIntent,
    });
    await nextTick();

    expect(wrapper.find('.aix-user-confirm__hint').exists()).toBe(true);
    expect(onBlockIntent).not.toHaveBeenCalled();
    // 剩余节点仍按绝对时刻正常排程
    vi.advanceTimersByTime(40_000); // 累计 120s，到达 autoSubmitAt
    await nextTick();
    expect(onBlockIntent).toHaveBeenCalledTimes(1);
  });
});
