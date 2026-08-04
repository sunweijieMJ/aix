import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import AttachmentCard from '../src/components/AttachmentCard.vue';
import ImageBlock from '../src/components/blocks/ImageBlock.vue';
import SourcesBlock from '../src/components/blocks/SourcesBlock.vue';
import ImagePreview from '../src/components/ImagePreview.vue';
import ImageThumb from '../src/components/ImageThumb.vue';
import Prompts from '../src/components/Prompts.vue';
import ThoughtChain from '../src/components/ThoughtChain.vue';
import { imageBlock, sourcesBlock } from '../src/utils/helpers';
import { __resetImageCache } from '../src/utils/imageLoadedCache';

const XSS = 'javascript:alert(1)';
// 「看着像图片地址、却不在图片白名单里」的形态：isImageSource 认它（data: 开头），
// safeImageSrc 拒它（非 data:image/*）。用来验证两步判定的第二步确实生效——
// 只做第一步（此前的 icon 路径）会让它直接落进 img[src]。
const BAD_DATA = 'data:text/html,<script>alert(1)</script>';

/**
 * 跨组件的协议白名单一致性回归。
 *
 * 此前只有 markdown 渲染路径（walker / imageRenderers）与 SourcesBlock、ThoughtChain 的 href
 * 过了白名单；结构化 image 块与图片预览的下载链接是裸传的 —— 而它们的 url 同样来自模型 /
 * 生图工具输出。本用例把「所有会把不可信 url 落进 DOM 属性的渲染点」一次性钉住，
 * 防止新增渲染点时再漏一处。
 */
describe('协议白名单 — 全部渲染点一致性', () => {
  it('SourcesBlock：不安全 href 降级为非链接', () => {
    const w = mount(SourcesBlock, {
      props: { block: sourcesBlock([{ title: 't', url: XSS }]) },
    });
    expect(w.find('.aix-sources-block__link').attributes('href')).toBeUndefined();
  });

  it('SourcesBlock：icon 判为图片地址但未过白名单时，既不渲染 img 也不当 emoji 显示', () => {
    const w = mount(SourcesBlock, {
      props: { block: sourcesBlock([{ title: 't', url: 'https://x/a', icon: BAD_DATA }]) },
    });
    expect(w.find('.aix-sources-block__favicon').exists()).toBe(false);
    expect(w.find('.aix-sources-block__emoji').exists()).toBe(false);
    expect(w.html()).not.toContain('data:text/html');
  });

  it('SourcesBlock：emoji icon 不得被当成 url 渲染成裂图，合法 favicon 照常出图', () => {
    const emoji = mount(SourcesBlock, {
      props: { block: sourcesBlock([{ title: 't', url: 'https://x/a', icon: '🔍' }]) },
    });
    expect(emoji.find('.aix-sources-block__favicon').exists()).toBe(false);
    expect(emoji.find('.aix-sources-block__emoji').text()).toBe('🔍');

    const favicon = mount(SourcesBlock, {
      props: { block: sourcesBlock([{ title: 't', url: 'https://x/a', icon: 'https://x/f.ico' }]) },
    });
    expect(favicon.find('.aix-sources-block__favicon').attributes('src')).toBe('https://x/f.ico');
  });

  it('Prompts：icon 与 SourcesBlock 同口径（白名单 + emoji 分流），select 仍抛原始 item', async () => {
    const bad = mount(Prompts, { props: { items: [{ key: 'k', label: 'L', icon: BAD_DATA }] } });
    expect(bad.find('img').exists()).toBe(false);
    expect(bad.html()).not.toContain('data:text/html');

    const emoji = mount(Prompts, { props: { items: [{ key: 'k', label: 'L', icon: '✨' }] } });
    expect(emoji.find('img').exists()).toBe(false);
    expect(emoji.find('.aix-prompts__icon').text()).toBe('✨');

    const ok = mount(Prompts, {
      props: { items: [{ key: 'k', label: 'L', icon: 'https://x/i.png' }] },
    });
    expect(ok.find('img').attributes('src')).toBe('https://x/i.png');
    // 派生渲染行不得泄漏到事件载荷里
    await ok.find('button').trigger('click');
    expect(ok.emitted('select')![0]![0]).toEqual({ key: 'k', label: 'L', icon: 'https://x/i.png' });
  });

  it('AttachmentCard：不安全 url 退回文件卡，不渲染缩略图', () => {
    const w = mount(AttachmentCard, {
      props: {
        item: { id: 'a1', name: 'p.png', mime: 'image/png', url: XSS, status: 'done' },
      },
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.classes()).not.toContain('aix-attachment-card--image');
  });

  it('ThoughtChain：不安全 chip.url 降级为非链接，不安全 thumbnail 不渲染 img', () => {
    const w = mount(ThoughtChain, {
      props: {
        items: [
          {
            key: 'k1',
            title: '检索',
            content: 'x',
            defaultExpanded: true,
            result: { chips: [{ text: 'c', url: XSS, thumbnail: XSS }] },
          },
        ],
      },
    });
    expect(w.find('.aix-thought-chain__chip').attributes('href')).toBeUndefined();
    expect(w.find('.aix-thought-chain__chip-thumb').exists()).toBe(false);
  });

  it('ImageThumb：不安全 src 走失败占位，不落进 img[src]', () => {
    __resetImageCache();
    const w = mount(ImageThumb, { props: { src: XSS, alt: '图' } });
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('.aix-md-image--error').exists()).toBe(true);
  });

  it('ImageThumb：blob: / data:image 属图片合法形态，必须放行', () => {
    __resetImageCache();
    const blob = mount(ImageThumb, { props: { src: 'blob:https://x/abc' } });
    expect(blob.find('img').attributes('src')).toBe('blob:https://x/abc');

    const data = mount(ImageThumb, { props: { src: 'data:image/png;base64,iVBOR' } });
    expect(data.find('img').attributes('src')).toBe('data:image/png;base64,iVBOR');
  });

  it('ImageBlock：不安全 url 经 ImageThumb 收口，不落进 img[src]', () => {
    __resetImageCache();
    const w = mount(ImageBlock, {
      props: { block: imageBlock([{ url: XSS, alt: '图' }]), info: { role: 'ai', key: 'm1' } },
    });
    expect(w.findAll('img')).toHaveLength(0);
  });

  it('ImagePreview：不安全 url 既不渲染下载链接也不渲染大图', () => {
    const w = mount(ImagePreview, {
      props: { open: true, images: [{ url: XSS, alt: '图' }] },
      attachTo: document.body,
    });
    const anchor = document.querySelector('a.aix-image-preview__action');
    expect(anchor).toBeNull();
    expect(document.querySelector('.aix-image-preview__image')).toBeNull();
    w.unmount();
  });

  it('ImagePreview：安全 url 正常渲染下载链接与大图', () => {
    const w = mount(ImagePreview, {
      props: { open: true, images: [{ url: 'https://cdn.example.com/a.png', alt: '图' }] },
      attachTo: document.body,
    });
    const anchor = document.querySelector('a.aix-image-preview__action') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('https://cdn.example.com/a.png');
    expect(
      (document.querySelector('.aix-image-preview__image') as HTMLImageElement).getAttribute('src'),
    ).toBe('https://cdn.example.com/a.png');
    w.unmount();
  });
});
