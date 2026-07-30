import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import Bubble from '../src/components/Bubble.vue';
import type { ContentBlock } from '../src/types';
import { textBlock } from '../src/utils/helpers';

const IDLE_CLASS = 'is-tail-idle';
const contentEl = (w: ReturnType<typeof mount>) => w.find('.aix-bubble__content');

/** 工具块（模拟流式拼参阶段） */
function toolBlock(id: string, argsText: string): ContentBlock {
  return {
    id,
    type: 'tool_use',
    toolCallId: `call_${id}`,
    toolName: 'search',
    state: 'input-streaming',
    argsText,
  };
}

describe('Bubble 末尾静默呼吸', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('默认关闭：流式静默也不加呼吸类', async () => {
    const w = mount(Bubble, {
      props: { status: 'updating', content: [textBlock('在输出')] },
    });
    vi.advanceTimersByTime(10000);
    await nextTick();
    expect(contentEl(w).classes()).not.toContain(IDLE_CLASS);
  });

  it('开启后：流式静默超阈值加呼吸类', async () => {
    const w = mount(Bubble, {
      props: { status: 'updating', content: [textBlock('在输出')], tailBreathing: true },
    });
    expect(contentEl(w).classes()).not.toContain(IDLE_CLASS);

    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(contentEl(w).classes()).toContain(IDLE_CLASS);
  });

  it('内容继续增长 → 撤销呼吸类', async () => {
    const blocks = [textBlock('在输出')];
    const w = mount(Bubble, {
      props: { status: 'updating', content: blocks, tailBreathing: true },
    });
    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(contentEl(w).classes()).toContain(IDLE_CLASS);

    // 就地 mutate（与流式实际行为一致：last.text += delta）
    await w.setProps({ content: [textBlock('在输出更多内容了')] });
    await nextTick();
    expect(contentEl(w).classes()).not.toContain(IDLE_CLASS);
  });

  it('消息收尾（success）→ 不呼吸', async () => {
    const w = mount(Bubble, {
      props: { status: 'success', content: [textBlock('说完了')], tailBreathing: true },
    });
    vi.advanceTimersByTime(10000);
    await nextTick();
    expect(contentEl(w).classes()).not.toContain(IDLE_CLASS);
  });

  it('自定义 idleMs 生效', async () => {
    const w = mount(Bubble, {
      props: {
        status: 'updating',
        content: [textBlock('在输出')],
        tailBreathing: { idleMs: 800 },
      },
    });
    vi.advanceTimersByTime(799);
    await nextTick();
    expect(contentEl(w).classes()).not.toContain(IDLE_CLASS);

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(contentEl(w).classes()).toContain(IDLE_CLASS);
  });

  // 核心回归用例：判定必须基于整条消息的内容指纹，而非单个块自身。
  // 若判定下沉到块内（各块只看自己的文本长度），[text, tool_use] 形态下
  // 首个 text 块在工具开始流式后就不再增长，会被误判为静默而呼吸。
  it('工具穿插：首块停止增长但工具仍在流式 → 不呼吸', async () => {
    const w = mount(Bubble, {
      props: {
        status: 'updating',
        content: [textBlock('我来查一下'), toolBlock('t1', '{"q":')],
        tailBreathing: true,
      },
    });

    // 文本块不再变，但工具参数持续拼接 → 整条消息仍在增长
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
      await w.setProps({
        content: [textBlock('我来查一下'), toolBlock('t1', `{"q":"${'x'.repeat(i + 1)}`)],
      });
      await nextTick();
      expect(contentEl(w).classes()).not.toContain(IDLE_CLASS);
    }

    // 工具也停下来后才进入静默
    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(contentEl(w).classes()).toContain(IDLE_CLASS);
  });

  it('多块消息：整条静默才呼吸', async () => {
    const w = mount(Bubble, {
      props: {
        status: 'updating',
        content: [textBlock('前言'), toolBlock('t1', '{}'), textBlock('结论')],
        tailBreathing: true,
      },
    });
    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(contentEl(w).classes()).toContain(IDLE_CLASS);
  });

  // 样式作用域回归：各块渲染器的根元素都是 .aix-bubble__content 的直接子元素，
  // 多个文本块会渲染出多个 .aix-markdown。呼吸只能命中最后一个，
  // 否则中间的文本块也会一起呼吸（后代选择器的经典陷阱）。
  it('多个文本块时呼吸只作用于最后一个 markdown 容器', async () => {
    const w = mount(Bubble, {
      props: {
        status: 'updating',
        content: [textBlock('前言'), toolBlock('t1', '{}'), textBlock('结论')],
        tailBreathing: true,
      },
    });
    vi.advanceTimersByTime(3000);
    await nextTick();

    // 确实存在多个 markdown 容器（否则本用例失去意义）
    expect(w.findAll('.aix-bubble__content > .aix-markdown').length).toBe(2);
    // 但作为「末子元素」的只有一个 —— 即选择器实际命中的目标
    expect(w.findAll('.aix-bubble__content > .aix-markdown:last-child').length).toBe(1);
    // 且它是最后那个文本块（内容为「结论」）
    expect(w.find('.aix-bubble__content > .aix-markdown:last-child').text()).toContain('结论');
  });

  it('末块非文本块时不命中呼吸目标（由块自身表达进度）', async () => {
    const w = mount(Bubble, {
      props: {
        status: 'updating',
        content: [textBlock('我来查一下'), toolBlock('t1', '{}')],
        tailBreathing: true,
      },
    });
    vi.advanceTimersByTime(3000);
    await nextTick();

    // 静默态成立，但末子元素不是 markdown → 选择器无命中，文本块不呼吸
    expect(contentEl(w).classes()).toContain(IDLE_CLASS);
    expect(w.findAll('.aix-bubble__content > .aix-markdown:last-child').length).toBe(0);
  });
});
