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
});
