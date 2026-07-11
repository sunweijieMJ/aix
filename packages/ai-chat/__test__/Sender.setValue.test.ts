import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Sender from '../src/components/Sender.vue';

describe('Sender.setValue', () => {
  it('写入 textarea 并 emit update:modelValue', async () => {
    const w = mount(Sender);
    (w.vm as unknown as { setValue: (t: string) => void }).setValue('帮我解释这段');
    await w.vm.$nextTick();
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('帮我解释这段');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['帮我解释这段']);
  });

  // 回归：setValue 同步调 autosize 量到的是 DOM 旧内容——非受控（不绑 v-model）时
  // 没有 modelValue 回声 watch 纠正，多行注入后高度滞留旧值直到下次用户输入
  it('setValue 后高度按新内容计算（非受控使用，无 modelValue 回声纠正）', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea').element as HTMLTextAreaElement;
    // jsdom scrollHeight 恒 0：按当前 DOM value 行数模拟真实滚动高度
    Object.defineProperty(ta, 'scrollHeight', {
      get: () => 20 * ta.value.split('\n').length,
      configurable: true,
    });
    (w.vm as unknown as { setValue: (t: string) => void }).setValue('一\n二\n三');
    await w.vm.$nextTick();
    await w.vm.$nextTick();
    expect(ta.style.height).toBe('60px');
  });
});
