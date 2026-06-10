import { mount } from '@vue/test-utils';
import DOMPurify from 'dompurify';
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { createHtmlRenderers } from '../src/utils/htmlRenderers';
import type { MdToken } from '../src/utils/markdownWalker';

const renderers = createHtmlRenderers(DOMPurify);

const renderBlock = (content: string) => {
  const token = { type: 'html_block', content } as unknown as MdToken;
  const vnode = renderers.html_block!({
    token,
    renderChildren: () => [],
    info: { streaming: false },
  });
  const Harness = defineComponent({ render: () => h('div', vnode as never) });
  return mount(Harness).html();
};

describe('createHtmlRenderers（allowHtml：DOMPurify 消毒）', () => {
  it('块级 HTML 安全内容被渲染', () => {
    const html = renderBlock('<div class="card">内容</div>');
    expect(html).toContain('内容');
    expect(html).toContain('card');
  });

  it('块级 HTML 中的 XSS 被消毒（onerror / script 去除）', () => {
    const html = renderBlock('<img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  it('行内裸 HTML 标签被丢弃（P1：返回空，保留周边文本由 walker 处理）', () => {
    const token = { type: 'html_inline', content: '<b>' } as unknown as MdToken;
    const out = renderers.html_inline!({
      token,
      renderChildren: () => [],
      info: { streaming: false },
    });
    expect(out).toBe('');
  });
});
