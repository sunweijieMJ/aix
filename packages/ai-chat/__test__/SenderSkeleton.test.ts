import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import SenderSkeleton from '../src/components/SenderSkeleton.vue';

describe('SenderSkeleton（Sender 外壳骨架占位）', () => {
  it('渲染外壳：输入行骨架 + 两个工具占位 + 发送键占位', () => {
    const w = mount(SenderSkeleton);
    expect(w.find('.aix-sender-skeleton').exists()).toBe(true);
    expect(w.find('.aix-skeleton').exists()).toBe(true);
    expect(w.findAll('.aix-sender-skeleton__tool')).toHaveLength(1);
    expect(w.find('.aix-sender-skeleton__send').exists()).toBe(true);
  });
});
