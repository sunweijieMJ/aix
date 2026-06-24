import { describe, it, expect } from 'vitest';
import { extractPlaceholderNames } from '../src/utils/placeholder-utils';

describe('extractPlaceholderNames', () => {
  it('vue-i18n / react-intl 单括号 {name}', () => {
    expect(extractPlaceholderNames('共 {count} 件，{name} 你好')).toEqual(
      new Set(['count', 'name']),
    );
  });
  it('i18next 双括号 {{name}}', () => {
    expect(extractPlaceholderNames('total {{count}} items')).toEqual(new Set(['count']));
  });
  it('react-intl ICU 取首标识符', () => {
    expect(extractPlaceholderNames('{count, plural, one {# item} other {# items}}')).toEqual(
      new Set(['count']),
    );
  });
  it('无占位符 → 空集', () => {
    expect(extractPlaceholderNames('纯文本无变量')).toEqual(new Set());
  });
  it('同名占位符去重', () => {
    expect(extractPlaceholderNames('{x} 和 {x}')).toEqual(new Set(['x']));
  });
});
