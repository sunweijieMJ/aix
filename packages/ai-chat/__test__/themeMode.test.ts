import { describe, it, expect, afterEach } from 'vitest';
import { isDarkMode } from '../src/utils/themeMode';

describe('isDarkMode', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  });

  it('默认（无 data-theme / .dark）判定为亮色', () => {
    expect(isDarkMode()).toBe(false);
  });

  it("data-theme='dark' 判定为暗色（@aix/theme setDataTheme 的标记方式）", () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(isDarkMode()).toBe(true);
  });

  it("data-theme='light' 判定为亮色", () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(isDarkMode()).toBe(false);
  });

  it('.dark class 同样判定为暗色（不要求走 data-theme 属性）', () => {
    document.documentElement.classList.add('dark');
    expect(isDarkMode()).toBe(true);
  });
});
