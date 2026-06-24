import { describe, it, expect } from 'vitest';
import { isModeExplicitlySet } from '../src/utils/command-utils';

describe('isModeExplicitlySet', () => {
  it('识别所有显式指定 mode 的写法（含短选项贴值）', () => {
    expect(isModeExplicitlySet(['--mode', 'generate'])).toBe(true);
    expect(isModeExplicitlySet(['--mode=generate'])).toBe(true);
    expect(isModeExplicitlySet(['-m', 'generate'])).toBe(true);
    expect(isModeExplicitlySet(['-m=generate'])).toBe(true); // 旧逻辑漏报
    expect(isModeExplicitlySet(['-mgenerate'])).toBe(true); // 旧逻辑漏报
  });

  it('未指定 mode 时返回 false', () => {
    expect(isModeExplicitlySet([])).toBe(false);
    expect(isModeExplicitlySet(['-i'])).toBe(false);
    expect(isModeExplicitlySet(['--custom', '--ci'])).toBe(false);
    expect(isModeExplicitlySet(['--config', './i18n.config.ts'])).toBe(false);
  });
});
