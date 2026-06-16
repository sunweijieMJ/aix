import { describe, it, expect } from 'vitest';
import { useNamespace } from '../src/use-namespace';

describe('useNamespace', () => {
  const ns = useNamespace('button');

  it('b() should return block class', () => {
    expect(ns.b()).toBe('aix-button');
  });

  it('b(suffix) should return suffixed block class', () => {
    expect(ns.b('icon')).toBe('aix-button-icon');
  });

  it('e() should return element class', () => {
    expect(ns.e('text')).toBe('aix-button__text');
  });

  it('m() should return modifier class', () => {
    expect(ns.m('primary')).toBe('aix-button--primary');
  });

  it('em() should return element-modifier class', () => {
    expect(ns.em('text', 'sm')).toBe('aix-button__text--sm');
  });

  it('is() should return state class when active', () => {
    expect(ns.is('active')).toBe('is-active');
  });

  it('is() should return empty string when state is false', () => {
    expect(ns.is('active', false)).toBe('');
  });

  it('should isolate different blocks', () => {
    const other = useNamespace('bubble');
    expect(other.b()).toBe('aix-bubble');
    expect(other.e('content')).toBe('aix-bubble__content');
  });
});
