import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Skeleton from '../src/components/Skeleton.vue';

describe('Skeleton（通用骨架占位）', () => {
  it('loading 时渲染骨架块并标注 aria-busy，不渲染插槽内容', () => {
    const w = mount(Skeleton, {
      props: { loading: true, height: '120px' },
      slots: { default: '<div class="real">真实内容</div>' },
    });
    expect(w.find('.aix-skeleton').exists()).toBe(true);
    expect(w.find('.aix-skeleton').attributes('aria-busy')).toBe('true');
    expect(w.find('.aix-skeleton__block').attributes('style')).toContain('height: 120px');
    expect(w.find('.real').exists()).toBe(false);
  });

  it('rows 模式渲染指定行数（末行短行）', () => {
    const w = mount(Skeleton, { props: { loading: true, rows: 3 } });
    expect(w.findAll('.aix-skeleton__row')).toHaveLength(3);
  });

  it('aspectRatio 模式透传比例', () => {
    const w = mount(Skeleton, { props: { loading: true, aspectRatio: '2 / 1' } });
    expect(w.find('.aix-skeleton__block').attributes('style')).toContain('aspect-ratio: 2 / 1');
  });

  it('loading=false 渲染插槽真实内容，骨架消失', () => {
    const w = mount(Skeleton, {
      props: { loading: false },
      slots: { default: '<div class="real">真实内容</div>' },
    });
    expect(w.find('.real').exists()).toBe(true);
    expect(w.find('.aix-skeleton').exists()).toBe(false);
  });
});
