import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import UserConfirmBlock from '../src/components/blocks/UserConfirmBlock.vue';
import Bubble from '../src/components/Bubble.vue';
import type {
  BlockAction,
  BlockIntent,
  ConfirmField,
  ContentBlock,
  MessageStatus,
  UserConfirmState,
} from '../src/types';
import { userConfirmBlock } from '../src/utils/helpers';

type ConfirmBlock = Extract<ContentBlock, { type: 'user_confirm' }>;

const FIELDS: ConfirmField[] = [
  { name: 'plan', question: '选择方案', type: 'radio', options: ['A', 'B'], defaultValue: 'A' },
  { name: 'tags', question: '选择标签', type: 'checkbox', options: ['x', 'y'] },
  { name: 'note', question: '补充说明', type: 'text' },
];

function mountCard(opts: {
  state?: UserConfirmState;
  status?: MessageStatus;
  fields?: ConfirmField[];
  createdAt?: number;
  timeout?: ConfirmBlock['timeout'];
  onBlockAction?: (a: BlockAction) => void;
  onBlockIntent?: (i: BlockIntent) => void;
}) {
  const block: ConfirmBlock = {
    ...userConfirmBlock('form-1', opts.fields ?? FIELDS, { title: '确认一下' }),
    state: opts.state ?? 'awaiting',
    ...(opts.createdAt !== undefined ? { createdAt: opts.createdAt } : {}),
    ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
  };
  const wrapper = mount(UserConfirmBlock, {
    props: {
      block,
      info: { role: 'ai', key: 'm1', status: opts.status ?? 'success' },
      onBlockAction: opts.onBlockAction,
      onBlockIntent: opts.onBlockIntent,
    },
  });
  return { wrapper, block };
}

describe('UserConfirmBlock — 渲染与四态', () => {
  it('awaiting：渲染标题与全部字段控件，提交按钮可用', () => {
    const { wrapper } = mountCard({});
    expect(wrapper.find('.aix-user-confirm__title').text()).toBe('确认一下');
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2);
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);
    expect(wrapper.findAll('input[type="text"]')).toHaveLength(1);
    const submit = wrapper.find('.aix-user-confirm__submit');
    expect(submit.attributes('disabled')).toBeUndefined();
  });

  it('消息已 success 时仍可交互（续流语义：success + awaiting 正是应填状态）', () => {
    const { wrapper } = mountCard({ status: 'success' });
    expect(wrapper.find('input[type="radio"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('.aix-user-confirm__submit').attributes('disabled')).toBeUndefined();
  });

  it('submitting：控件与提交按钮均禁用，按钮显示进行中文案', () => {
    const { wrapper } = mountCard({ state: 'submitting' });
    expect(wrapper.find('input[type="radio"]').attributes('disabled')).toBeDefined();
    const submit = wrapper.find('.aix-user-confirm__submit');
    expect(submit.attributes('disabled')).toBeDefined();
    expect(submit.text()).toBe('提交中…');
  });

  it('submitted：只读回显答案，无提交按钮', () => {
    const { wrapper } = mountCard({
      state: 'submitted',
      fields: [
        { name: 'plan', question: '选择方案', type: 'radio', options: ['A', 'B'], answer: 'B' },
      ],
    });
    const radios = wrapper.findAll('input[type="radio"]');
    expect(radios[1]!.attributes('checked')).toBeDefined();
    expect(radios[0]!.attributes('disabled')).toBeDefined();
    expect(wrapper.find('.aix-user-confirm__submit').exists()).toBe(false);
    expect(wrapper.find('.aix-user-confirm__status').text()).toBe('已提交');
  });

  it('expired：只读且不可提交，显示失效说明', () => {
    const { wrapper } = mountCard({ state: 'expired' });
    expect(wrapper.find('input[type="text"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.aix-user-confirm__submit').exists()).toBe(false);
    expect(wrapper.find('.aix-user-confirm__status').text()).toBe('该确认已失效');
  });
});

describe('UserConfirmBlock — 两条通道', () => {
  it('改单选答案 → BlockAction(answer) 携带整份 fields，且不 mutate props', async () => {
    const onBlockAction = vi.fn();
    const { wrapper, block } = mountCard({ onBlockAction });

    await wrapper.findAll('input[type="radio"]')[1]!.setValue(true);

    expect(onBlockAction).toHaveBeenCalledTimes(1);
    const action = onBlockAction.mock.calls[0]![0] as BlockAction;
    expect(action.blockId).toBe(block.id);
    expect(action.type).toBe('answer');
    expect((action.patch.fields as ConfirmField[])[0]!.answer).toBe('B');
    // 组件不就地改 props：落地由 useChat.updateBlock 统一入口完成
    expect(block.fields[0]!.answer).toBeUndefined();
  });

  it('多选累加 / 取消勾选从答案中移除', async () => {
    const onBlockAction = vi.fn();
    const fields: ConfirmField[] = [
      { name: 'tags', question: '标签', type: 'checkbox', options: ['x', 'y'], answer: ['x'] },
    ];
    const { wrapper } = mountCard({ fields, onBlockAction });
    const boxes = wrapper.findAll('input[type="checkbox"]');

    await boxes[1]!.setValue(true);
    expect(
      ((onBlockAction.mock.calls[0]![0] as BlockAction).patch.fields as ConfirmField[])[0]!.answer,
    ).toEqual(['x', 'y']);

    await boxes[0]!.setValue(false);
    expect(
      ((onBlockAction.mock.calls[1]![0] as BlockAction).patch.fields as ConfirmField[])[0]!.answer,
    ).toEqual([]);
  });

  it('文本输入 → BlockAction 回写', async () => {
    const onBlockAction = vi.fn();
    const { wrapper } = mountCard({ onBlockAction });

    await wrapper.find('input[type="text"]').setValue('补充');
    const action = onBlockAction.mock.calls[0]![0] as BlockAction;
    expect((action.patch.fields as ConfirmField[])[2]!.answer).toBe('补充');
  });

  it('点提交 → BlockIntent(submit) 携带 formId 与 fields，不走 action 通道', async () => {
    const onBlockAction = vi.fn();
    const onBlockIntent = vi.fn();
    const { wrapper, block } = mountCard({ onBlockAction, onBlockIntent });

    await wrapper.find('.aix-user-confirm__submit').trigger('click');

    expect(onBlockIntent).toHaveBeenCalledTimes(1);
    const intent = onBlockIntent.mock.calls[0]![0] as BlockIntent;
    expect(intent).toMatchObject({ blockId: block.id, type: 'submit' });
    expect(intent.payload).toMatchObject({ formId: 'form-1' });
    expect((intent.payload as { fields: ConfirmField[] }).fields).toHaveLength(3);
    expect(onBlockAction).not.toHaveBeenCalled();
  });

  it('提交后本地冻结，防重复点击造成二次提交', async () => {
    const onBlockIntent = vi.fn();
    const { wrapper } = mountCard({ onBlockIntent });

    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    expect(onBlockIntent).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.aix-user-confirm__submit').attributes('disabled')).toBeDefined();
  });

  it('宿主提交失败把 state 回置 awaiting → 解冻可重试（冻结不是死角）', async () => {
    const onBlockIntent = vi.fn();
    const { wrapper, block } = mountCard({ onBlockIntent });

    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    expect(wrapper.find('.aix-user-confirm__submit').attributes('disabled')).toBeDefined();

    // 宿主推进到 submitting，请求失败后回置 awaiting（重试信号）
    await wrapper.setProps({ block: { ...block, state: 'submitting' } });
    await wrapper.setProps({ block: { ...block, state: 'awaiting' } });

    expect(wrapper.find('.aix-user-confirm__submit').attributes('disabled')).toBeUndefined();
    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    expect(onBlockIntent).toHaveBeenCalledTimes(2);
  });

  it('宿主未推进 state 时保持冻结（仅 state 往返才是重试信号，不因重渲染误解冻）', async () => {
    const onBlockIntent = vi.fn();
    const { wrapper, block } = mountCard({ onBlockIntent });

    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    // state 始终是 awaiting，只是块数据被别处更新
    await wrapper.setProps({ block: { ...block, title: '换个标题' } });

    expect(wrapper.find('.aix-user-confirm__submit').attributes('disabled')).toBeDefined();
    expect(onBlockIntent).toHaveBeenCalledTimes(1);
  });
});

describe('UserConfirmBlock — 开发期护栏', () => {
  it('字段重名 → 告警（重名会让 radio 分组与答案回写同时错乱），每块只告警一次', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { wrapper, block } = mountCard({
      fields: [
        { name: 'dup', question: '问题一', type: 'radio', options: ['A'] },
        { name: 'dup', question: '问题二', type: 'text' },
      ],
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('dup');

    // 重渲染不刷屏
    await wrapper.setProps({ block: { ...block, title: '换个标题' } });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('字段名唯一时不告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountCard({});
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('UserConfirmBlock — 必填校验', () => {
  const required: ConfirmField[] = [
    { name: 'plan', question: '选择方案', type: 'radio', options: ['A', 'B'], required: true },
  ];

  it('必填未答 → 阻止提交并提示', async () => {
    const onBlockIntent = vi.fn();
    const { wrapper } = mountCard({ fields: required, onBlockIntent });

    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    expect(onBlockIntent).not.toHaveBeenCalled();
    expect(wrapper.find('.aix-user-confirm__error').text()).toBe('请先完成必填项');
    // 未真正提交 → 仍可继续作答
    expect(wrapper.find('input[type="radio"]').attributes('disabled')).toBeUndefined();
  });

  it('多选必填：空数组按未答处理', async () => {
    const onBlockIntent = vi.fn();
    const { wrapper } = mountCard({
      fields: [
        {
          name: 't',
          question: '标签',
          type: 'checkbox',
          options: ['x'],
          required: true,
          answer: [],
        },
      ],
      onBlockIntent,
    });

    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    expect(onBlockIntent).not.toHaveBeenCalled();
  });

  it('已答必填 → 正常提交', async () => {
    const onBlockIntent = vi.fn();
    const { wrapper } = mountCard({
      fields: [{ ...required[0]!, answer: 'A' }],
      onBlockIntent,
    });

    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    expect(onBlockIntent).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.aix-user-confirm__error').exists()).toBe(false);
  });
});

describe('UserConfirmBlock — 超时时间线', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  const TIMEOUT = { hintAt: 75_000, autoFillAt: 105_000, autoSubmitAt: 120_000 };

  it('hintAt 到点显示提示文案', async () => {
    const { wrapper } = mountCard({ createdAt: Date.now(), timeout: TIMEOUT });
    expect(wrapper.find('.aix-user-confirm__hint').exists()).toBe(false);

    vi.advanceTimersByTime(75_000);
    await nextTick();
    expect(wrapper.find('.aix-user-confirm__hint').text()).toBe('需要帮您选一个吗？');
  });

  it('autoFillAt 到点按 defaultValue 回写并标记', async () => {
    const onBlockAction = vi.fn();
    const { wrapper } = mountCard({ createdAt: Date.now(), timeout: TIMEOUT, onBlockAction });

    vi.advanceTimersByTime(105_000);
    await nextTick();
    const action = onBlockAction.mock.calls[0]![0] as BlockAction;
    expect((action.patch.fields as ConfirmField[])[0]!.answer).toBe('A');
    expect(wrapper.find('.aix-user-confirm__auto-filled').exists()).toBe(true);
  });

  it('autoSubmitAt 到点自动提交，payload 带 autoFill 标记与已填答案', async () => {
    const onBlockIntent = vi.fn();
    const { wrapper } = mountCard({ createdAt: Date.now(), timeout: TIMEOUT, onBlockIntent });

    vi.advanceTimersByTime(120_000);
    await nextTick();
    const intent = onBlockIntent.mock.calls[0]![0] as BlockIntent;
    expect(intent.payload).toMatchObject({ formId: 'form-1', autoFill: true });
    // 宿主未落地 autoFill 补丁时也不丢答案：提交前重放同一份默认值填充
    expect((intent.payload as { fields: ConfirmField[] }).fields[0]!.answer).toBe('A');
    expect(wrapper.find('.aix-user-confirm__submit').attributes('disabled')).toBeDefined();
  });

  it('必填未答不阻断自动提交（autoFill 语义下由宿主判定）', async () => {
    const onBlockIntent = vi.fn();
    mountCard({
      fields: [{ name: 'plan', question: 'q', type: 'text', required: true }],
      createdAt: Date.now(),
      timeout: { autoSubmitAt: 10_000 },
      onBlockIntent,
    });

    vi.advanceTimersByTime(10_000);
    expect(onBlockIntent).toHaveBeenCalledTimes(1);
  });

  it('手动作答撤销整条时间线：不再自动填充/自动提交', async () => {
    const onBlockIntent = vi.fn();
    const { wrapper } = mountCard({
      createdAt: Date.now(),
      timeout: TIMEOUT,
      onBlockIntent,
    });

    await wrapper.findAll('input[type="radio"]')[1]!.setValue(true);
    vi.advanceTimersByTime(600_000);
    await nextTick();

    expect(onBlockIntent).not.toHaveBeenCalled();
    expect(wrapper.find('.aix-user-confirm__hint').exists()).toBe(false);
  });

  it('非 awaiting 态不启用时间线（历史 submitted 卡不会被自动提交）', async () => {
    const onBlockIntent = vi.fn();
    mountCard({
      state: 'submitted',
      createdAt: Date.now() - 600_000,
      timeout: TIMEOUT,
      onBlockIntent,
    });

    vi.advanceTimersByTime(600_000);
    expect(onBlockIntent).not.toHaveBeenCalled();
  });

  it('缺 createdAt → 不启用超时', async () => {
    const onBlockIntent = vi.fn();
    mountCard({ timeout: TIMEOUT, onBlockIntent });

    vi.advanceTimersByTime(600_000);
    expect(onBlockIntent).not.toHaveBeenCalled();
  });
});

describe('UserConfirmBlock — 经 Bubble 内置注册表渲染', () => {
  it('user_confirm 块由内置注册表分发，提交意图逐层上抛到 Bubble', async () => {
    const block = userConfirmBlock('form-1', [
      { name: 'plan', question: '选择方案', type: 'radio', options: ['A'], answer: 'A' },
    ]);
    const w = mount(Bubble, { props: { itemKey: 'm1', content: [block] } });

    expect(w.find('.aix-user-confirm').exists()).toBe(true);
    await w.find('.aix-user-confirm__submit').trigger('click');
    expect(w.emitted('block-intent')![0]![0]).toMatchObject({
      messageKey: 'm1',
      intent: { blockId: block.id, type: 'submit' },
    });
  });
});

describe('UserConfirmBlock — 无障碍', () => {
  it('选项组用 fieldset/legend 关联问题，文本字段用 label 关联输入', () => {
    const { wrapper } = mountCard({});
    const groups = wrapper.findAll('fieldset');
    expect(groups).toHaveLength(2);
    expect(groups[0]!.find('legend').text()).toContain('选择方案');

    const input = wrapper.find('input[type="text"]');
    const label = wrapper.find(`label[for="${input.attributes('id')}"]`);
    expect(label.text()).toContain('补充说明');
  });

  it('必填星号的无障碍名是「必填」，而不是整句校验提示', () => {
    const { wrapper } = mountCard({
      fields: [{ name: 'n', question: 'q', type: 'text', required: true }],
    });
    expect(wrapper.find('.aix-user-confirm__required').attributes('aria-label')).toBe('必填');
  });

  it('必填校验提示用 role="alert" 播报', async () => {
    const { wrapper } = mountCard({
      fields: [{ name: 'n', question: 'q', type: 'text', required: true }],
    });
    await wrapper.find('.aix-user-confirm__submit').trigger('click');
    expect(wrapper.find('.aix-user-confirm__error').attributes('role')).toBe('alert');
  });
});
