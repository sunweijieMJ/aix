import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import LoadingDots from '../src/components/LoadingDots.vue';

describe('LoadingDots（共享进度指示器）', () => {
  it('渲染三个跳动点', () => {
    const w = mount(LoadingDots);
    expect(w.find('.aix-loading-dots').exists()).toBe(true);
    expect(w.findAll('.aix-loading-dots__dot')).toHaveLength(3);
  });

  it('每个点有交错的 animationDelay', () => {
    const w = mount(LoadingDots);
    const dots = w.findAll('.aix-loading-dots__dot');
    expect(dots[0]!.attributes('style')).toContain('animation-delay: 0.15s');
    expect(dots[1]!.attributes('style')).toContain('animation-delay: 0.3s');
    expect(dots[2]!.attributes('style')).toContain('animation-delay: 0.45s');
  });
});
