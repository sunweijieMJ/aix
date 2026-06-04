import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ChoiceBlock from '../src/components/blocks/ChoiceBlock.vue';
import type { BlockAction, ContentBlock } from '../src/types';

/** 构造 choice 块（默认 review、单选、两项） */
const makeChoice = (
  over: Record<string, unknown> = {},
): Extract<ContentBlock, { type: 'choice' }> =>
  ({
    id: 'b1',
    type: 'choice',
    stem: '关于梵高《向日葵》正确的是（ ）',
    options: [
      { id: 'o1', label: 'A', content: '创作于巴黎' },
      { id: 'o2', label: 'B', content: '阿尔勒时期' },
    ],
    answer: 'o2',
    analysis: '系列多作于阿尔勒时期。',
    ...over,
  }) as Extract<ContentBlock, { type: 'choice' }>;

const lastCall = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0] as BlockAction;

// ====================================================================
// review 模式（choice 默认）
// ====================================================================
describe('ChoiceBlock review 模式', () => {
  it('渲染题干前缀、纯文本选项、标准答案、解析', () => {
    const w = mount(ChoiceBlock, { props: { block: makeChoice() } });
    // review 容器
    expect(w.find('.aix-choice__review').exists()).toBe(true);
    // 题干前缀「题干：」
    expect(w.find('.aix-choice__stem-prefix').text()).toBe('题干：');
    expect(w.find('.aix-choice__stem').text()).toContain('关于梵高');
    // 纯文本选项 {label}. {content}
    const opts = w.findAll('.aix-choice__review-option');
    expect(opts).toHaveLength(2);
    expect(opts[0].text()).toBe('A. 创作于巴黎');
    expect(opts[1].text()).toBe('B. 阿尔勒时期');
    // 标准答案：B
    expect(w.find('.aix-choice__answer').text()).toBe('标准答案：B');
    // 解析前缀
    expect(w.find('.aix-choice__analysis-prefix').text()).toBe('答案解析：');
    expect(w.find('.aix-choice__analysis').text()).toContain('系列多作于阿尔勒时期。');
  });

  it('review 模式不渲染可点击作答 DOM，且点击不发 select', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, { props: { block: makeChoice(), onBlockAction } });
    // 不应有 answer 模式的可点击 li.aix-choice__option
    expect(w.find('ul.aix-choice__options').exists()).toBe(false);
    expect(w.find('li.aix-choice__option').exists()).toBe(false);
    // review-option 不可点击（无 click 行为）
    await w.find('.aix-choice__review-option').trigger('click');
    expect(onBlockAction).not.toHaveBeenCalled();
  });

  it('多选标准答案用「、」连接多个选项 label', () => {
    const block = makeChoice({
      multiple: true,
      options: [
        { id: 'o1', label: 'A', content: '甲' },
        { id: 'o2', label: 'B', content: '乙' },
        { id: 'o3', label: 'C', content: '丙' },
      ],
      answer: ['o1', 'o3'],
    });
    const w = mount(ChoiceBlock, { props: { block } });
    expect(w.find('.aix-choice__answer').text()).toBe('标准答案：A、C');
  });

  it('无 answer / 无 analysis 时不渲染对应区块', () => {
    const w = mount(ChoiceBlock, {
      props: { block: makeChoice({ answer: undefined, analysis: undefined }) },
    });
    expect(w.find('.aix-choice__answer').exists()).toBe(false);
    expect(w.find('.aix-choice__analysis').exists()).toBe(false);
  });
});

// ====================================================================
// answer 模式 · 单选
// ====================================================================
describe('ChoiceBlock answer 模式 · 单选', () => {
  const singleAnswer = (over: Record<string, unknown> = {}) =>
    makeChoice({ mode: 'answer', ...over });

  it('role=radiogroup / radio，选项含 aria 与 tabindex', () => {
    const w = mount(ChoiceBlock, { props: { block: singleAnswer() } });
    const ul = w.find('ul.aix-choice__options');
    expect(ul.exists()).toBe(true);
    expect(ul.attributes('role')).toBe('radiogroup');
    const li = w.findAll('li.aix-choice__option');
    expect(li).toHaveLength(2);
    expect(li[0].attributes('role')).toBe('radio');
    expect(li[0].attributes('tabindex')).toBe('0');
    expect(li[0].attributes('aria-checked')).toBe('false');
    // label + content 分区
    expect(li[0].find('.aix-choice__option-label').text()).toBe('A');
    expect(li[0].find('.aix-choice__option-content').text()).toBe('创作于巴黎');
  });

  it('点击选项 → select { selected: id }（string）', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, { props: { block: singleAnswer(), onBlockAction } });
    await w.findAll('li.aix-choice__option')[1].trigger('click');
    expect(onBlockAction).toHaveBeenCalledWith({
      blockId: 'b1',
      type: 'select',
      patch: { selected: 'o2' },
    } satisfies BlockAction);
  });

  it('Enter / Space 键盘作答与点击等价', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, { props: { block: singleAnswer(), onBlockAction } });
    const opts = w.findAll('li.aix-choice__option');
    await opts[0].trigger('keydown', { key: 'Enter' });
    expect(lastCall(onBlockAction).patch).toEqual({ selected: 'o1' });
    await opts[1].trigger('keydown', { key: ' ' });
    expect(lastCall(onBlockAction).patch).toEqual({ selected: 'o2' });
  });

  it('selected 命中的选项加 is-selected 且 aria-checked=true', () => {
    const w = mount(ChoiceBlock, { props: { block: singleAnswer({ selected: 'o2' }) } });
    const li = w.findAll('li.aix-choice__option');
    expect(li[1].classes()).toContain('is-selected');
    expect(li[1].attributes('aria-checked')).toBe('true');
    expect(li[0].classes()).not.toContain('is-selected');
  });
});

// ====================================================================
// answer 模式 · 多选
// ====================================================================
describe('ChoiceBlock answer 模式 · 多选', () => {
  const multiAnswer = (over: Record<string, unknown> = {}) =>
    makeChoice({
      mode: 'answer',
      multiple: true,
      options: [
        { id: 'o1', label: 'A', content: '甲' },
        { id: 'o2', label: 'B', content: '乙' },
        { id: 'o3', label: 'C', content: '丙' },
      ],
      answer: ['o1'],
      ...over,
    });

  it('role=group / checkbox', () => {
    const w = mount(ChoiceBlock, { props: { block: multiAnswer() } });
    expect(w.find('ul.aix-choice__options').attributes('role')).toBe('group');
    expect(w.findAll('li.aix-choice__option')[0].attributes('role')).toBe('checkbox');
  });

  it('点未选项 → 数组追加该 id', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, {
      props: { block: multiAnswer({ selected: ['o1'] }), onBlockAction },
    });
    await w.findAll('li.aix-choice__option')[2].trigger('click'); // 点 o3
    expect(lastCall(onBlockAction).patch).toEqual({ selected: ['o1', 'o3'] });
  });

  it('点已选项 → 数组移除该 id', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, {
      props: { block: multiAnswer({ selected: ['o1', 'o3'] }), onBlockAction },
    });
    await w.findAll('li.aix-choice__option')[0].trigger('click'); // 点已选 o1
    expect(lastCall(onBlockAction).patch).toEqual({ selected: ['o3'] });
  });
});

// ====================================================================
// 题型标签
// ====================================================================
describe('ChoiceBlock 题型标签', () => {
  it('multiple=false → 单项选择题', () => {
    const w = mount(ChoiceBlock, { props: { block: makeChoice() } });
    expect(w.find('.aix-result-card__title').text()).toBe('单项选择题');
  });

  it('multiple=true → 多项选择题', () => {
    const w = mount(ChoiceBlock, { props: { block: makeChoice({ multiple: true }) } });
    expect(w.find('.aix-result-card__title').text()).toBe('多项选择题');
  });
});

// ====================================================================
// 底部 pill
// ====================================================================
describe('ChoiceBlock 底部 pill', () => {
  it('插入视频 / 删除 分别发对应 action', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, { props: { block: makeChoice(), onBlockAction } });
    const insert = w.find('.aix-choice__pill:not(.aix-choice__pill-danger)');
    const del = w.find('.aix-choice__pill.aix-choice__pill-danger');
    await insert.trigger('click');
    expect(onBlockAction).toHaveBeenLastCalledWith({
      blockId: 'b1',
      type: 'insert-video',
      patch: {},
    } satisfies BlockAction);
    await del.trigger('click');
    expect(onBlockAction).toHaveBeenLastCalledWith({
      blockId: 'b1',
      type: 'delete',
      patch: {},
    } satisfies BlockAction);
  });

  it('review 与 answer 模式均渲染 pill；编辑态不渲染 pill', async () => {
    const wReview = mount(ChoiceBlock, { props: { block: makeChoice() } });
    expect(wReview.findAll('.aix-choice__pill')).toHaveLength(2);
    const wAnswer = mount(ChoiceBlock, { props: { block: makeChoice({ mode: 'answer' }) } });
    expect(wAnswer.findAll('.aix-choice__pill')).toHaveLength(2);

    const wEdit = mount(ChoiceBlock, { props: { block: makeChoice({ editable: true }) } });
    await wEdit.find('.aix-result-card__edit').trigger('click');
    expect(wEdit.findAll('.aix-choice__pill')).toHaveLength(0);
  });
});

// ====================================================================
// 编辑态
// ====================================================================
describe('ChoiceBlock 编辑态', () => {
  const enterEdit = async (w: ReturnType<typeof mount>) => {
    await w.find('.aix-result-card__edit').trigger('click');
  };

  it('editable 时显示编辑按钮，点击进入编辑表单', async () => {
    const w = mount(ChoiceBlock, { props: { block: makeChoice({ editable: true }) } });
    expect(w.find('.aix-result-card__edit').exists()).toBe(true);
    await enterEdit(w);
    expect(w.find('.aix-choice__edit').exists()).toBe(true);
    // 题干 / 解析输入框存在
    expect(w.find('.aix-choice__stem-input').exists()).toBe(true);
    expect(w.find('.aix-choice__analysis-input').exists()).toBe(true);
    // 每个选项一行
    expect(w.findAll('.aix-choice__edit-option')).toHaveLength(2);
  });

  it('editable=false 不显示编辑按钮', () => {
    const w = mount(ChoiceBlock, { props: { block: makeChoice() } });
    expect(w.find('.aix-result-card__edit').exists()).toBe(false);
  });

  it('改题干 + 选项 + 解析后保存 → edit patch（单选 answer 为 string）', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, {
      props: { block: makeChoice({ editable: true }), onBlockAction },
    });
    await enterEdit(w);
    await w.find('.aix-choice__stem-input').setValue('改后的题干');
    await w.findAll('.aix-choice__option-input')[0].setValue('改后的选项A');
    await w.find('.aix-choice__analysis-input').setValue('改后的解析');
    await w.find('.aix-choice__save').trigger('click');

    const call = lastCall(onBlockAction);
    expect(call.type).toBe('edit');
    const patch = call.patch as {
      stem: string;
      analysis: string;
      multiple: boolean;
      answer?: string;
      options: { content: string }[];
    };
    expect(patch.stem).toBe('改后的题干');
    expect(patch.analysis).toBe('改后的解析');
    expect(patch.multiple).toBe(false);
    expect(patch.options[0].content).toBe('改后的选项A');
    // 单选 answer 为 string（原 answer o2）
    expect(patch.answer).toBe('o2');
  });

  it('mark 标记答案 · 单选互斥（改标记后 answer 替换为新 id）', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, {
      props: { block: makeChoice({ editable: true, answer: 'o2' }), onBlockAction },
    });
    await enterEdit(w);
    // 第 1 行 mark（aria-label 为选项 label 'A'）
    const marks = w.findAll('.aix-choice__mark');
    // 初始：第 2 项被标记
    expect(marks[1].classes()).toContain('is-checked');
    expect(marks[0].classes()).not.toContain('is-checked');
    // 标记第 1 项 → 单选互斥
    await marks[0].trigger('click');
    expect(w.findAll('.aix-choice__mark')[0].classes()).toContain('is-checked');
    expect(w.findAll('.aix-choice__mark')[1].classes()).not.toContain('is-checked');
    await w.find('.aix-choice__save').trigger('click');
    expect((lastCall(onBlockAction).patch as { answer?: string }).answer).toBe('o1');
  });

  it('mark 标记答案 · 多选可多标，保存 answer 为数组', async () => {
    const onBlockAction = vi.fn();
    const block = makeChoice({
      editable: true,
      multiple: true,
      options: [
        { id: 'o1', label: 'A', content: '甲' },
        { id: 'o2', label: 'B', content: '乙' },
        { id: 'o3', label: 'C', content: '丙' },
      ],
      answer: ['o1'],
    });
    const w = mount(ChoiceBlock, { props: { block, onBlockAction } });
    await enterEdit(w);
    const marks = w.findAll('.aix-choice__mark');
    await marks[2].trigger('click'); // 追加标记 o3
    await w.find('.aix-choice__save').trigger('click');
    const patch = lastCall(onBlockAction).patch as { multiple: boolean; answer?: string[] };
    expect(patch.multiple).toBe(true);
    expect(patch.answer).toEqual(['o1', 'o3']);
  });

  it('新增选项后 label 连续重排为 A/B/C/D', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, {
      props: { block: makeChoice({ editable: true }), onBlockAction },
    });
    await enterEdit(w);
    await w.find('.aix-choice__add').trigger('click');
    await w.find('.aix-choice__add').trigger('click');
    await nextTick();
    expect(w.findAll('.aix-choice__edit-option')).toHaveLength(4);
    await w.find('.aix-choice__save').trigger('click');
    const patch = lastCall(onBlockAction).patch as { options: { label: string }[] };
    expect(patch.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('删除按钮仅 >2 项时显示；删除后 relabel 且移除其答案关联', async () => {
    const onBlockAction = vi.fn();
    const block = makeChoice({
      editable: true,
      options: [
        { id: 'o1', label: 'A', content: '甲' },
        { id: 'o2', label: 'B', content: '乙' },
        { id: 'o3', label: 'C', content: '丙' },
      ],
      answer: 'o3',
    });
    const w = mount(ChoiceBlock, { props: { block, onBlockAction } });
    await enterEdit(w);
    // 3 项时每行有删除按钮
    expect(w.findAll('[aria-label="删除"]').length).toBe(3);
    // 删除第 3 行（当前答案项）
    await w.findAll('.aix-choice__edit-option')[2].find('[aria-label="删除"]').trigger('click');
    await nextTick();
    // 剩 2 项 → 删除按钮消失
    expect(w.findAll('[aria-label="删除"]').length).toBe(0);
    await w.find('.aix-choice__save').trigger('click');
    const patch = lastCall(onBlockAction).patch as { options: unknown[]; answer?: string };
    expect(patch.options).toHaveLength(2);
    // 删除的是答案项 → answer 变 undefined
    expect(patch.answer).toBeUndefined();
  });

  it('上移选项后 relabel，但 answer 仍关联同一选项 id（不错位）', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, {
      props: { block: makeChoice({ editable: true, answer: 'o2' }), onBlockAction },
    });
    await enterEdit(w);
    // 第 2 行上移
    await w.findAll('.aix-choice__edit-option')[1].find('[aria-label="上移"]').trigger('click');
    await nextTick();
    await w.find('.aix-choice__save').trigger('click');
    const patch = lastCall(onBlockAction).patch as {
      options: { id: string; label: string }[];
      answer?: string;
    };
    expect(patch.options[0].id).toBe('o2');
    expect(patch.options[0].label).toBe('A');
    expect(patch.answer).toBe('o2');
  });

  it('下移选项后 relabel 顺序正确', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, {
      props: { block: makeChoice({ editable: true }), onBlockAction },
    });
    await enterEdit(w);
    // 第 1 行下移
    await w.findAll('.aix-choice__edit-option')[0].find('[aria-label="下移"]').trigger('click');
    await nextTick();
    await w.find('.aix-choice__save').trigger('click');
    const patch = lastCall(onBlockAction).patch as { options: { id: string; label: string }[] };
    expect(patch.options.map((o) => o.id)).toEqual(['o2', 'o1']);
    expect(patch.options.map((o) => o.label)).toEqual(['A', 'B']);
  });

  it('退出编辑 → 不发事件且丢弃草稿', async () => {
    const onBlockAction = vi.fn();
    const w = mount(ChoiceBlock, {
      props: { block: makeChoice({ editable: true }), onBlockAction },
    });
    await enterEdit(w);
    await w.find('.aix-choice__stem-input').setValue('改了但不保存');
    await w.find('.aix-choice__exit').trigger('click');
    expect(onBlockAction).not.toHaveBeenCalled();
    expect(w.find('.aix-choice__edit').exists()).toBe(false);
    // 重新进入编辑应是原始题干（草稿已丢弃）
    await enterEdit(w);
    expect((w.find('.aix-choice__stem-input').element as HTMLTextAreaElement).value).toContain(
      '关于梵高',
    );
  });
});
