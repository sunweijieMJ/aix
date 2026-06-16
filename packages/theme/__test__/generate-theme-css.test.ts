import { describe, expect, it } from 'vitest';
import { generateThemeCSS } from '../src/core/generate-theme-css';

describe('generateThemeCSS', () => {
  it('默认输出含 light :root 与 dark 选择器块，前缀为 --aix-', () => {
    const css = generateThemeCSS();
    expect(css).toContain(':root {');
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('--aix-colorPrimary');
  });

  it('自定义 prefix 时所有变量名使用该前缀，无 --aix-', () => {
    const css = generateThemeCSS({ prefix: 'myapp' });
    expect(css).toContain('--myapp-colorPrimary');
    expect(css).not.toContain('--aix-');
  });

  it('自定义 seed.colorPrimary 影响派生输出', () => {
    const css = generateThemeCSS({ seed: { colorPrimary: 'rgb(255 0 0)' } });
    const def = generateThemeCSS();
    const line = (s: string) => s.split('\n').find((l) => l.includes('--aix-colorPrimary:'));
    expect(line(css)).not.toBe(line(def));
  });

  it('includeDark=false 时不输出暗色块', () => {
    const css = generateThemeCSS({ includeDark: false });
    expect(css).toContain(':root {');
    expect(css).not.toContain("[data-theme='dark']");
  });

  it('includePresetColors 控制 colorPreset* 是否出现', () => {
    expect(generateThemeCSS()).toContain('--aix-colorPreset');
    expect(generateThemeCSS({ includePresetColors: false })).not.toContain('--aix-colorPreset');
  });

  it('暗色块只含与亮色不同的 diff', () => {
    const css = generateThemeCSS();
    const darkBlock = css.slice(css.indexOf("[data-theme='dark']"));
    expect(darkBlock).not.toContain('--aix-colorPreset');
    expect(darkBlock).toContain('--aix-');
  });

  it('自定义 lightSelector / darkSelector 生效', () => {
    const css = generateThemeCSS({ lightSelector: '.theme-light', darkSelector: '.theme-dark' });
    expect(css).toContain('.theme-light {');
    expect(css).toContain('.theme-dark {');
  });
});
