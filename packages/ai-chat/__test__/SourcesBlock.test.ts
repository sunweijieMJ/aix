import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SourcesBlock from '../src/components/blocks/SourcesBlock.vue';
import Bubble from '../src/components/Bubble.vue';
import type { ContentBlock } from '../src/types';
import { sourcesBlock } from '../src/utils/helpers';

const block = sourcesBlock([
  {
    title: '维基百科',
    url: 'https://example.com/a',
    snippet: '一段摘要内容',
    icon: 'https://example.com/favicon.ico',
  },
  { title: '无链接来源', snippet: '只有标题和摘要', icon: '📄' },
  { title: '仅标题' },
]) as Extract<ContentBlock, { type: 'sources' }>;

describe('SourcesBlock', () => {
  it('渲染标题、数量与全部来源项', () => {
    const w = mount(SourcesBlock, { props: { block } });
    expect(w.find('.aix-sources-block__title').text()).toContain('引用来源');
    expect(w.find('.aix-sources-block__count').text()).toBe('3');
    expect(w.findAll('.aix-sources-block__item')).toHaveLength(3);
    expect(w.text()).toContain('维基百科');
    expect(w.text()).toContain('一段摘要内容');
  });

  it('有 url 渲染为新窗口安全链接，无 url 渲染为非链接容器', () => {
    const w = mount(SourcesBlock, { props: { block } });
    const links = w.findAll('a.aix-sources-block__link');
    // 仅第 1 项有 url
    expect(links).toHaveLength(1);
    expect(links[0].attributes('href')).toBe('https://example.com/a');
    expect(links[0].attributes('target')).toBe('_blank');
    expect(links[0].attributes('rel')).toBe('noopener noreferrer');
    // 第 2、3 项无 url → 渲染为 div（非 a）
    expect(w.findAll('.aix-sources-block__link').length).toBe(3);
  });

  it('icon 为图片地址渲染 <img> favicon，为 emoji/文本渲染文本', () => {
    const w = mount(SourcesBlock, { props: { block } });
    const favicons = w.findAll('img.aix-sources-block__favicon');
    expect(favicons).toHaveLength(1); // 仅第 1 项 icon 是 url
    expect(favicons[0].attributes('src')).toBe('https://example.com/favicon.ico');
    // 第 2 项 icon 是 emoji → 文本节点
    expect(w.find('.aix-sources-block__emoji').text()).toBe('📄');
  });

  it('作为内置渲染器：Bubble 渲染 sources 块（防回归——此前未注册被静默跳过）', () => {
    const w = mount(Bubble, { props: { role: 'ai', status: 'success', content: [block] } });
    expect(w.find('.aix-sources-block').exists()).toBe(true);
    expect(w.text()).toContain('维基百科');
  });
});
