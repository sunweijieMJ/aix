import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import AttachmentBlock from '../src/components/blocks/AttachmentBlock.vue';
import Bubble from '../src/components/Bubble.vue';
import { attachmentBlock } from '../src/utils/helpers';

describe('AttachmentBlock', () => {
  const block = attachmentBlock([
    { id: 'a1', name: 'report.pdf', size: 1024, mime: 'application/pdf' },
    { id: 'a2', name: 'pic.png', mime: 'image/png', url: '/f/p.png' },
  ]);

  it('渲染只读卡片列表（无操作按钮）', () => {
    const w = mount(AttachmentBlock, { props: { block } });
    expect(w.findAll('.aix-attachment-card')).toHaveLength(2);
    expect(w.find('button').exists()).toBe(false);
  });

  // 防回归：注册表统一透传 typing（boolean | BubbleTypingConfig），收窄为 boolean 会触发 dev 警告
  it('typing 透传配置对象不触发 prop 类型校验警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount(AttachmentBlock, { props: { block, typing: { step: 2, interval: 20 } } });
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('Invalid prop'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('经 Bubble 内置注册表分发渲染', () => {
    const w = mount(Bubble, { props: { content: [block], itemKey: 'm1' } });
    const blockEl = w.find('.aix-attachment-block');
    expect(blockEl.findAll('.aix-attachment-card')).toHaveLength(2);
  });
});
