import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import ReasoningBlock from '../src/components/blocks/ReasoningBlock.vue';
import Bubble from '../src/components/Bubble.vue';
import type { ContentBlock } from '../src/types';
import { textBlock } from '../src/utils/helpers';

// 回归背景（completedIds 时序缺口）：
// useTypewriter 追平末尾即 fireComplete 并 stop——若追平早于消息终态（最后一个 token 与
// done 帧间隔 > interval 时必现），completedIds 只在终态登记、其后不再有任何 tick，
// 导致该消息 typing 永不关闭、虚拟列表重挂载时自定义块重播。
// 修复：Bubble 层按块聚合（text/reasoning 块全部有效追平 + 终态）才上抛消息级 typing-complete。
describe('Bubble 消息级 typing-complete 聚合（回归：completedIds 时序缺口）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    await nextTick();
  };

  it('追平早于终态：终态到达后补发消息级 typing-complete', async () => {
    const blk = textBlock('abc');
    const w = mount(Bubble, {
      props: { itemKey: 'm1', content: [blk], status: 'updating', typing: true },
    });
    // 打字机在 updating 期间追平（挂载快照即全文，首帧 tick 触发 complete）
    await advance(600);
    const before = w.emitted('typing-complete')?.length ?? 0;
    // 流 done：status 转终态，文本无变化 → 打字机不再有任何 tick
    await w.setProps({ status: 'success' });
    await advance(300);
    const after = w.emitted('typing-complete')?.length ?? 0;
    // 终态后必须有一次消息级完成事件，否则 BubbleList 的 completedIds 永不登记
    expect(after).toBeGreaterThan(before);
  });

  it('多 text 块：先追平的块不触发消息级完成，全部追平后才上抛', async () => {
    const blkA: ContentBlock = { ...textBlock(''), id: 'blk-a' };
    const blkB: ContentBlock = { ...textBlock(''), id: 'blk-b' };
    const w = mount(Bubble, {
      props: { itemKey: 'm2', content: [blkA, blkB], status: 'updating', typing: true },
    });
    await nextTick();
    // 终态到达时 A 很短、B 很长：A 先追平、B 仍在逐字
    const long = '这是一段较长的思考输出内容，需要打字机较长时间追平。'.repeat(20);
    await w.setProps({
      content: [
        { ...blkA, text: '短' },
        { ...blkB, text: long },
      ],
      status: 'success',
    });
    // A 追平（几帧即可），B 远未追平
    await advance(150);
    expect(w.emitted('typing-complete')).toBeUndefined();
    // B 追平（step 1~3/30ms，给足时间）
    await advance(long.length * 40);
    expect(w.emitted('typing-complete')).toBeTruthy();
  });

  it('ReasoningBlock 打字机追平后上抛 typing-complete（纯 reasoning 消息也能登记）', async () => {
    const w = mount(ReasoningBlock, {
      props: {
        block: { id: 'r1', type: 'reasoning', text: '思考内容' } as ContentBlock & {
          type: 'reasoning';
        },
        typing: true,
      },
    });
    await advance(600);
    expect(w.emitted('typing-complete')).toBeTruthy();
  });

  it('纯 tool_use 消息（无 text/reasoning 块）终态到达后仍需上抛消息级 typing-complete', async () => {
    // content 全部由非 text/reasoning 类型块组成时，typingBlockIds 恒为空数组，
    // 空集合的 every() 语义上视为「已追平」，不应因 !ids.length 提前 return 而永久卡住。
    const toolBlock: ContentBlock = {
      id: 'tool-1',
      type: 'tool_use',
      toolCallId: 'call_1',
      toolName: 'search',
      state: 'output-available',
    };
    const w = mount(Bubble, {
      props: { itemKey: 'm3', content: [toolBlock], status: 'updating', typing: true },
    });
    await nextTick();
    // 流 done：status 转终态，不存在任何 text/reasoning 块需要追平
    await w.setProps({ status: 'success' });
    await nextTick();
    expect(w.emitted('typing-complete')).toBeTruthy();
  });

  // 上一条（纯 tool_use / ids 为空）的对称情形：ids 非空、但其中某块文本长度为 0。
  // useTypewriter.fireComplete 有 `len > 0` 守卫，空源永不上抛块级完成事件 →
  // completedLens 里没有该块的记录（undefined），与 blockTextLen 的 0 判不相等 →
  // fireIfSettled 恒不满足，消息级 typing-complete 永不触发（BubbleList.completedIds
  // 不登记 → typing 常开 → 虚拟列表重挂载时自定义块渲染器重播）。
  // 空块可由业务 parser 的 1→N 拆分、或自定义 parseChunk 经 block 字段下发产生。
  it.each([
    ['空 text 块在末位', [textBlock('你好'), { ...textBlock(''), id: 'empty-tail' }]],
    ['空 text 块在首位', [{ ...textBlock(''), id: 'empty-head' }, textBlock('你好')]],
    [
      '空 reasoning 块',
      [textBlock('正文'), { id: 'empty-reasoning', type: 'reasoning', text: '' } as ContentBlock],
    ],
  ])('%s 不阻塞消息级 typing-complete', async (_name, content) => {
    const w = mount(Bubble, {
      props: {
        itemKey: 'm4',
        content: content as ContentBlock[],
        status: 'updating',
        typing: true,
      },
    });
    await advance(600); // 非空块追平
    await w.setProps({ status: 'success' });
    await advance(300);
    expect(w.emitted('typing-complete')).toBeTruthy();
  });

  it('空块场景仍遵守「未追平不上抛」：非空块尚在逐字时不得提前完成', async () => {
    const long = '这是一段较长的输出内容，需要打字机较长时间才能追平。'.repeat(20);
    const w = mount(Bubble, {
      props: {
        itemKey: 'm5',
        content: [
          { ...textBlock(''), id: 'e1' },
          { ...textBlock(''), id: 'long' },
        ],
        status: 'updating',
        typing: true,
      },
    });
    await nextTick();
    await w.setProps({
      content: [
        { ...textBlock(''), id: 'e1' },
        { ...textBlock(long), id: 'long' },
      ],
      status: 'success',
    });
    await advance(150); // 长块远未追平
    expect(w.emitted('typing-complete')).toBeUndefined();
    await advance(long.length * 40);
    expect(w.emitted('typing-complete')).toBeTruthy();
  });
});
