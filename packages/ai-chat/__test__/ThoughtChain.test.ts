import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { h } from 'vue';
import ThoughtChain from '../src/components/ThoughtChain.vue';
import type { ThoughtChainItem } from '../src/types';

const items: ThoughtChainItem[] = [
  {
    key: 'a',
    icon: '🤔',
    title: '获取用户输入',
    status: 'done',
    duration: '12.59秒',
    content: '用户输入信息为：生成一道题',
  },
  { key: 'b', icon: '📝', title: '正文创作', status: 'active', duration: '01.00秒' },
];

describe('ThoughtChain', () => {
  it('渲染每一步的图标、标题与耗时徽章', () => {
    const w = mount(ThoughtChain, { props: { items } });
    expect(w.findAll('.aix-thought-chain__item')).toHaveLength(2);
    expect(w.text()).toContain('获取用户输入');
    expect(w.text()).toContain('🤔');
    expect(w.findAll('.aix-thought-chain__badge')[0].text()).toBe('12.59秒');
  });

  it('active 步骤标题加 is-active（流光渐变）', () => {
    const w = mount(ThoughtChain, { props: { items } });
    const titles = w.findAll('.aix-thought-chain__title');
    expect(titles[0].classes()).not.toContain('is-active');
    expect(titles[1].classes()).toContain('is-active');
  });

  it('有 content 的步骤默认展开并渲染正文', async () => {
    const w = mount(ThoughtChain, { props: { items } });
    await flushPromises();
    expect(w.find('.aix-thought-chain__body').exists()).toBe(true);
    expect(w.text()).toContain('用户输入信息为');
  });

  it('点击步骤标题切换折叠', async () => {
    const w = mount(ThoughtChain, { props: { items } });
    await flushPromises();
    const firstHead = w.findAll('.aix-thought-chain__head')[0];
    await firstHead.trigger('click'); // 收起
    expect(w.findAll('.aix-thought-chain__body')).toHaveLength(0);
    await firstHead.trigger('click'); // 再展开
    await flushPromises();
    expect(w.text()).toContain('用户输入信息为');
  });

  it('defaultExpanded=false 的步骤初始折叠', () => {
    const w = mount(ThoughtChain, {
      props: { items: [{ key: 'x', title: '步骤', content: '隐藏正文', defaultExpanded: false }] },
    });
    expect(w.find('.aix-thought-chain__body').exists()).toBe(false);
  });

  it('无 content 且无 slot 的步骤不显示折叠箭头', () => {
    const w = mount(ThoughtChain, {
      props: { items: [{ key: 'only', title: '仅标题', duration: '1秒' }] },
    });
    expect(w.find('.aix-thought-chain__arrow').exists()).toBe(false);
  });

  it('不传 title 时无链级头部，步骤列表直接显示', () => {
    const w = mount(ThoughtChain, { props: { items } });
    expect(w.find('.aix-thought-chain__summary').exists()).toBe(false);
    expect(w.find('.aix-thought-chain__list').exists()).toBe(true);
  });

  it('传 title 渲染链级头部；collapsible+defaultCollapsed 初始折叠整链', () => {
    const w = mount(ThoughtChain, {
      props: { items, title: '已完成', collapsible: true, defaultCollapsed: true },
    });
    expect(w.find('.aix-thought-chain__summary-title').text()).toBe('已完成');
    // 初始折叠：步骤列表不渲染
    expect(w.find('.aix-thought-chain__list').exists()).toBe(false);
  });

  it('点击「已完成」头部展开整条思维链', async () => {
    const w = mount(ThoughtChain, {
      props: { items, title: '已完成', collapsible: true, defaultCollapsed: true },
    });
    expect(w.find('.aix-thought-chain__list').exists()).toBe(false);
    await w.find('.aix-thought-chain__summary').trigger('click');
    expect(w.find('.aix-thought-chain__list').exists()).toBe(true);
    expect(w.findAll('.aix-thought-chain__item')).toHaveLength(2);
  });

  it('可折叠汇总头带 aria-expanded；步骤头带 aria-expanded', () => {
    const wrapper = mount(ThoughtChain, {
      props: {
        title: '生成中',
        collapsible: true,
        items: [{ key: 'a', title: '步骤A', content: '正文' }],
      },
    });
    expect(wrapper.find('.aix-thought-chain__summary').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.aix-thought-chain__head').attributes('aria-expanded')).toBe('true');
  });

  it('item-content 作用域 slot 覆盖默认正文（用于检索卡片等富内容）', async () => {
    const w = mount(ThoughtChain, {
      props: { items: [{ key: 's', title: '深度检索', defaultExpanded: true }] },
      slots: {
        'item-content': ({ item }: { item: ThoughtChainItem }) =>
          h('div', { class: 'card' }, `卡片-${item.title}`),
      },
    });
    await flushPromises();
    expect(w.find('.card').text()).toBe('卡片-深度检索');
  });

  it('loading 时汇总标题加流光类 is-loading', () => {
    const wrapper = mount(ThoughtChain, {
      props: { title: '生成中…', loading: true, items: [{ key: 'a', title: 'A' }] },
    });
    expect(wrapper.find('.aix-thought-chain__summary-title').classes()).toContain('is-loading');
  });

  // ── 检索结果卡（result 字段，数据驱动） ──────────────────────────────
  describe('检索结果卡（result）', () => {
    it('含 title 与多个 chip：展开后渲染标题与对应数量的 chip', async () => {
      const w = mount(ThoughtChain, {
        props: {
          items: [
            {
              key: 'r',
              title: '深度检索',
              result: {
                title: '搜索 梵高《向日葵》单选题',
                chips: [{ text: '结果一' }, { text: '结果二' }, { text: '结果三' }],
              },
            },
          ],
        },
      });
      await flushPromises();
      const result = w.find('.aix-thought-chain__result');
      expect(result.exists()).toBe(true);
      expect(w.find('.aix-thought-chain__result-title').text()).toBe('搜索 梵高《向日葵》单选题');
      expect(w.findAll('.aix-thought-chain__chip')).toHaveLength(3);
      const texts = w.findAll('.aix-thought-chain__chip-text').map((n) => n.text());
      expect(texts).toEqual(['结果一', '结果二', '结果三']);
    });

    it('chip 带 thumbnail：渲染 img.__chip-thumb 且 src 正确，不渲染 icon', async () => {
      const w = mount(ThoughtChain, {
        props: {
          items: [
            {
              key: 'r',
              title: '深度检索',
              result: {
                chips: [
                  { text: '带缩略图', thumbnail: 'https://cdn.example.com/a.png', icon: '🔍' },
                ],
              },
            },
          ],
        },
      });
      await flushPromises();
      const chip = w.find('.aix-thought-chain__chip');
      const thumb = chip.find('img.aix-thought-chain__chip-thumb');
      expect(thumb.exists()).toBe(true);
      expect(thumb.attributes('src')).toBe('https://cdn.example.com/a.png');
      // thumbnail 存在时 icon 不渲染（v-else-if）
      expect(chip.find('.aix-thought-chain__chip-icon').exists()).toBe(false);
      expect(chip.find('.aix-thought-chain__chip-text').text()).toBe('带缩略图');
    });

    it('chip 带 icon（无 thumbnail）：渲染 .__chip-icon 文本，无 thumb', async () => {
      const w = mount(ThoughtChain, {
        props: {
          items: [
            {
              key: 'r',
              title: '深度检索',
              result: { chips: [{ text: '带图标', icon: '📄' }] },
            },
          ],
        },
      });
      await flushPromises();
      const chip = w.find('.aix-thought-chain__chip');
      expect(chip.find('.aix-thought-chain__chip-thumb').exists()).toBe(false);
      const icon = chip.find('.aix-thought-chain__chip-icon');
      expect(icon.exists()).toBe(true);
      expect(icon.text()).toBe('📄');
      expect(chip.find('.aix-thought-chain__chip-text').text()).toBe('带图标');
    });

    it('chip 带 url 渲染为 <a>（href/target/rel 正确）；无 url 的 chip 为 <div>', async () => {
      const w = mount(ThoughtChain, {
        props: {
          items: [
            {
              key: 'r',
              title: '深度检索',
              result: {
                chips: [
                  { text: '可点击', url: 'https://example.com/detail' },
                  { text: '不可点击' },
                ],
              },
            },
          ],
        },
      });
      await flushPromises();
      const chips = w.findAll('.aix-thought-chain__chip');
      expect(chips).toHaveLength(2);
      // 第一个：<a>
      expect(chips[0].element.tagName).toBe('A');
      expect(chips[0].attributes('href')).toBe('https://example.com/detail');
      expect(chips[0].attributes('target')).toBe('_blank');
      expect(chips[0].attributes('rel')).toBe('noopener noreferrer');
      // 第二个：<div>，无链接属性
      expect(chips[1].element.tagName).toBe('DIV');
      expect(chips[1].attributes('href')).toBeUndefined();
      expect(chips[1].attributes('target')).toBeUndefined();
      expect(chips[1].attributes('rel')).toBeUndefined();
    });

    it('result.title 缺省时不渲染 .__result-title', async () => {
      const w = mount(ThoughtChain, {
        props: {
          items: [
            {
              key: 'r',
              title: '深度检索',
              result: { chips: [{ text: '无标题结果' }] },
            },
          ],
        },
      });
      await flushPromises();
      expect(w.find('.aix-thought-chain__result').exists()).toBe(true);
      expect(w.find('.aix-thought-chain__result-title').exists()).toBe(false);
    });

    it('仅有 result（无 content / 无 slot）：仍显示折叠箭头并能展开看到 result', async () => {
      const w = mount(ThoughtChain, {
        props: {
          items: [
            {
              key: 'r',
              title: '深度检索',
              result: { title: '检索标题', chips: [{ text: '结果一' }] },
            },
          ],
        },
      });
      await flushPromises();
      // hasBody=true → 显示箭头
      expect(w.find('.aix-thought-chain__arrow').exists()).toBe(true);
      // 默认展开 → result 已渲染
      expect(w.find('.aix-thought-chain__result').exists()).toBe(true);
      expect(w.text()).toContain('结果一');

      // 点击收起后 body 不再渲染
      await w.find('.aix-thought-chain__head').trigger('click');
      expect(w.find('.aix-thought-chain__body').exists()).toBe(false);
      expect(w.find('.aix-thought-chain__result').exists()).toBe(false);
    });

    it('result 与 content 共存时两者都渲染', async () => {
      const w = mount(ThoughtChain, {
        props: {
          items: [
            {
              key: 'r',
              title: '深度检索',
              result: { title: '检索标题', chips: [{ text: '检索结果' }] },
              content: '这是正文内容说明',
            },
          ],
        },
      });
      await flushPromises();
      expect(w.find('.aix-thought-chain__result').exists()).toBe(true);
      expect(w.find('.aix-thought-chain__result-title').text()).toBe('检索标题');
      expect(w.text()).toContain('检索结果');
      expect(w.text()).toContain('这是正文内容说明');
    });
  });

  it('items 替换后裁剪 openMap：同 key 新步骤不继承已移除步骤的折叠态', async () => {
    const w = mount(ThoughtChain, {
      props: { items: [{ key: 'a', title: '步骤A', content: '正文', defaultExpanded: true }] },
    });
    const head = () => w.find('.aix-thought-chain__head');
    expect(head().attributes('aria-expanded')).toBe('true'); // 初始展开
    await head().trigger('click'); // 折叠
    expect(head().attributes('aria-expanded')).toBe('false');

    // 移除步骤 a → openMap 应裁剪掉 a 的残留态
    await w.setProps({ items: [] });
    // 同 key a 的新步骤回归 → 应回退 defaultExpanded（展开），而非沿用残留的折叠态
    await w.setProps({
      items: [{ key: 'a', title: '步骤A', content: '正文', defaultExpanded: true }],
    });
    expect(head().attributes('aria-expanded')).toBe('true');
  });
});
