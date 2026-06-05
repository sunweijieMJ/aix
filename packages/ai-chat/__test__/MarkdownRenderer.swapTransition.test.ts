import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownRenderer from '../src/components/MarkdownRenderer.vue';
import { __resetMarkdownEngineCache } from '../src/composables/useMarkdownRenderer';

// 流式块"形态切换"（残片代码块 → KaTeX 公式）的高度 FLIP 过渡：
// 两种盒子高度天然不同，切换瞬间用高度过渡取代跳变，消除底部跟随滚动下的抖动。
describe('MarkdownRenderer 流式形态切换高度过渡', () => {
  beforeEach(() => __resetMarkdownEngineCache());
  afterEach(() => vi.restoreAllMocks());

  it('残片代码块切换为 KaTeX 公式时启动高度过渡（FLIP）', async () => {
    // jsdom 不做布局，offsetHeight 恒 0 → stub 递增高度，制造"前后高度不同"
    let height = 24;
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => (height += 8));

    const w = mount(MarkdownRenderer, {
      props: { content: '$$ \\frac{a}{b}', streaming: true },
    });
    // 流式中：残片以 latex 围栏代码块呈现
    await vi.waitFor(() => expect(w.find('pre').exists()).toBe(true));

    // 闭合：同一顶层块原地从 pre 替换为 KaTeX 块
    await w.setProps({ content: '$$ \\frac{a}{b} $$' });
    await vi.waitFor(() => expect(w.find('.aix-md-katex-block').exists()).toBe(true));

    // 形态切换被检测到 → 新元素带高度过渡内联样式（FLIP 启动）
    const el = w.find('.aix-md-katex-block').element as HTMLElement;
    expect(el.style.transition).toContain('height');
    expect(el.style.height).not.toBe('');
  });

  it('同元素原地更新（普通逐字增长）不触发过渡', async () => {
    let height = 24;
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => (height += 8));

    const w = mount(MarkdownRenderer, {
      props: { content: '正文逐字', streaming: true },
    });
    await vi.waitFor(() => expect(w.find('p').exists()).toBe(true));

    await w.setProps({ content: '正文逐字增长中' });
    await vi.waitFor(() => expect(w.html()).toContain('正文逐字增长中'));

    const el = w.find('p').element as HTMLElement;
    expect(el.style.transition ?? '').toBe('');
  });

  it('非流式（streaming=false）的内容更新不触发过渡', async () => {
    let height = 24;
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => (height += 8));

    const w = mount(MarkdownRenderer, {
      props: { content: '$$ a $$', streaming: false },
    });
    await vi.waitFor(() => expect(w.find('.aix-md-katex-block').exists()).toBe(true));

    // 整体替换为代码块（元素类型变化），但非流式 → 不做动画
    await w.setProps({ content: '```js\nconst a = 1\n```' });
    await vi.waitFor(() => expect(w.find('pre').exists()).toBe(true));

    const el = w.find('pre').element as HTMLElement;
    expect(el.style.transition ?? '').toBe('');
  });
});
