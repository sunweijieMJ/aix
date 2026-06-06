import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AttachmentCard from '../src/components/AttachmentCard.vue';

describe('AttachmentCard', () => {
  const base = { id: 'a1', name: 'report.pdf', size: 102400, mime: 'application/pdf' };

  it('渲染文件名与格式化大小', () => {
    const w = mount(AttachmentCard, { props: { item: { ...base, status: 'done' } } });
    expect(w.text()).toContain('report.pdf');
    expect(w.text()).toContain('100.0 KB');
  });

  it('图片 mime 且有 url 时渲染缩略图', () => {
    const w = mount(AttachmentCard, {
      props: {
        item: { ...base, name: 'p.png', mime: 'image/png', url: '/f/p.png', status: 'done' },
      },
    });
    expect(w.find('img').attributes('src')).toBe('/f/p.png');
  });

  it('uploading 渲染进度条（percent 驱动宽度）', () => {
    const w = mount(AttachmentCard, {
      props: { item: { ...base, status: 'uploading', percent: 30 } },
    });
    const bar = w.find('.aix-attachment-card__progress-bar');
    expect(bar.exists()).toBe(true);
    expect(bar.attributes('style')).toContain('30%');
  });

  it('uploading 无 percent 时进度条为不确定态', () => {
    const w = mount(AttachmentCard, { props: { item: { ...base, status: 'uploading' } } });
    expect(w.find('.aix-attachment-card__progress-bar').classes()).toContain('is-indeterminate');
  });

  it('error 渲染重试按钮并 emit retry', async () => {
    const w = mount(AttachmentCard, { props: { item: { ...base, status: 'error' } } });
    await w.find('[aria-label="重试上传"]').trigger('click');
    expect(w.emitted('retry')).toHaveLength(1);
  });

  it('error 有 error 字段时根元素 title 渲染错误信息', () => {
    const w = mount(AttachmentCard, {
      props: { item: { ...base, status: 'error', error: new Error('网络超时') } },
    });
    expect(w.attributes('title')).toContain('网络超时');
  });

  it('图片 mime 但无 url 时降级渲染图标而非 img', () => {
    const w = mount(AttachmentCard, {
      props: { item: { ...base, name: 'p.png', mime: 'image/png', status: 'done' } },
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('svg').exists()).toBe(true);
  });

  it('removable 时渲染删除按钮（__remove）并 emit remove；默认（回显态）无任何操作按钮', async () => {
    const w = mount(AttachmentCard, {
      props: { item: { ...base, status: 'done' }, removable: true },
    });
    const removeBtn = w.find('.aix-attachment-card__remove');
    expect(removeBtn.exists()).toBe(true);
    await removeBtn.trigger('click');
    expect(w.emitted('remove')).toHaveLength(1);

    // 默认只读态：无任何 button
    const readonly = mount(AttachmentCard, { props: { item: { ...base, status: 'done' } } });
    expect(readonly.find('button').exists()).toBe(false);
  });

  it('pdf 文件图标区颜色 style 包含 colorError', () => {
    const w = mount(AttachmentCard, {
      props: { item: { ...base, name: 'report.pdf', mime: 'application/pdf', status: 'done' } },
    });
    const icon = w.find('.aix-attachment-card__icon');
    expect(icon.exists()).toBe(true);
    expect(icon.attributes('style')).toContain('--aix-colorError');
  });

  it('xlsx 文件图标区颜色 style 包含 colorSuccess', () => {
    const w = mount(AttachmentCard, {
      props: {
        item: {
          id: 'x1',
          name: 'data.xlsx',
          size: 2048,
          mime: 'application/vnd.ms-excel',
          status: 'done',
        },
      },
    });
    const icon = w.find('.aix-attachment-card__icon');
    expect(icon.attributes('style')).toContain('--aix-colorSuccess');
  });

  it('未知类型文件图标区颜色 style 包含 colorTextSecondary', () => {
    const w = mount(AttachmentCard, {
      props: {
        item: {
          id: 'u1',
          name: 'mystery.xyz',
          size: 100,
          mime: 'application/octet-stream',
          status: 'done',
        },
      },
    });
    const icon = w.find('.aix-attachment-card__icon');
    expect(icon.attributes('style')).toContain('--aix-colorTextSecondary');
  });
});
