import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import AttachmentsPanel from '../src/components/AttachmentsPanel.vue';
import type { PendingAttachment } from '../src/composables/useAttachments';

const items: PendingAttachment[] = [
  { id: 'a1', name: 'report.pdf', size: 1024, mime: 'application/pdf', status: 'done' },
  { id: 'a2', name: 'fail.png', mime: 'image/png', status: 'error', error: new Error('x') },
];

describe('AttachmentsPanel', () => {
  it('渲染标题（含数量）、placeholder、文件卡片列表', () => {
    const w = mount(AttachmentsPanel, { props: { items } });
    expect(w.find('.aix-attachments-panel__title').text()).toContain('附件');
    expect(w.find('.aix-attachments-panel__count').text()).toContain('2');
    expect(w.find('.aix-attachments-panel__placeholder').text()).toContain(
      '点击或拖拽文件到此区域上传',
    );
    expect(w.find('.aix-attachments-panel__placeholder-hint').text()).toContain('支持图片');
    expect(w.findAll('.aix-attachment-card')).toHaveLength(2);
  });

  it('placeholder 点击 emit pick；关闭按钮 emit close', async () => {
    const w = mount(AttachmentsPanel, { props: { items: [] } });
    await w.find('.aix-attachments-panel__placeholder').trigger('click');
    expect(w.emitted('pick')).toHaveLength(1);
    await w.find('[aria-label="收起附件面板"]').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('卡片 remove/retry 事件透传（携带 id）', async () => {
    const w = mount(AttachmentsPanel, { props: { items } });
    // 按文件名定位目标卡片，不依赖数组顺序
    const cards = w.findAll('.aix-attachment-card');
    const pdfCard = cards.find((c) => c.text().includes('report.pdf'));
    const pngCard = cards.find((c) => c.text().includes('fail.png'));
    await pdfCard!.find('.aix-attachment-card__remove').trigger('click');
    expect(w.emitted('remove')?.[0]).toEqual(['a1']);
    await pngCard!.find('[aria-label="重试上传"]').trigger('click');
    expect(w.emitted('retry')?.[0]).toEqual(['a2']);
  });

  it('drag-in 态：dragenter 加类，子元素间移动不闪烁，真实离开移除', async () => {
    const w = mount(AttachmentsPanel, { props: { items: [] } });
    const root = w.find('.aix-attachments-panel');
    await root.trigger('dragenter');
    expect(w.find('.aix-attachments-panel__placeholder').classes()).toContain('is-drag-in');
    // 子元素间移动：relatedTarget 是面板内部节点 → 不移除
    const inner = w.find('.aix-attachments-panel__placeholder').element;
    await root.trigger('dragleave', { relatedTarget: inner });
    expect(w.find('.aix-attachments-panel__placeholder').classes()).toContain('is-drag-in');
    // 真实离开：relatedTarget 在面板外（document.body）
    await root.trigger('dragleave', { relatedTarget: document.body });
    expect(w.find('.aix-attachments-panel__placeholder').classes()).not.toContain('is-drag-in');
  });

  it('drop：清除 drag-in 并 emit drop(files)', async () => {
    const w = mount(AttachmentsPanel, { props: { items: [] } });
    const root = w.find('.aix-attachments-panel');
    await root.trigger('dragenter');
    const f = new File(['x'], 'd.pdf');
    // dataTransfer mock 为数组鸭子类型即可：组件侧仅用 .files.length 与对其迭代，
    // 不依赖原生 DataTransfer（jsdom 下其构造不稳定）。
    await root.trigger('drop', { dataTransfer: { files: [f] } });
    expect(w.find('.aix-attachments-panel__placeholder').classes()).not.toContain('is-drag-in');
    const payload = w.emitted('drop')?.[0]?.[0] as FileList | File[];
    expect(Array.from(payload as ArrayLike<File>)[0]?.name).toBe('d.pdf');
  });
});
