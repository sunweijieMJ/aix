import { describe, it, expect } from 'vitest';
import { useNamespace } from '../src/composables/useNamespace';

describe('useNamespace', () => {
  const ns = useNamespace('bubble');
  it('b/e/m/em 生成正确的 BEM class', () => {
    expect(ns.b()).toBe('aix-bubble');
    expect(ns.b('list')).toBe('aix-bubble-list');
    expect(ns.e('content')).toBe('aix-bubble__content');
    expect(ns.m('start')).toBe('aix-bubble--start');
    expect(ns.em('content', 'filled')).toBe('aix-bubble__content--filled');
    expect(ns.is('loading', true)).toBe('is-loading');
    expect(ns.is('loading', false)).toBe('');
  });
});
