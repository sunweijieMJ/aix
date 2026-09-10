import { describe, it, expect } from 'vitest';
import { TokenMapper } from '../../../src/core/fidelity/token-mapper';
import { rgbaToColor } from '../../../src/utils/color';

const css = `
/* theme */
:root {
  --aix-colorPrimary: rgb(0 88 38);
  --aix-colorText: #1F2329;
  --aix-colorTextSecondary: rgba(100, 106, 115, 1);
  --aix-spacing: 8px; /* 非颜色，忽略 */
  --other-color: #ff0000;
}
`;

describe('TokenMapper', () => {
  it('parses color declarations with the given prefix', () => {
    const mapper = TokenMapper.fromCss(css, '--aix-');
    expect(mapper.size).toBe(3);
  });

  it('looks up exact and near colors', () => {
    const mapper = TokenMapper.fromCss(css, '--aix-');
    expect(mapper.lookup(rgbaToColor(0, 88, 38))!.name).toBe('--aix-colorPrimary');
    expect(mapper.lookup(rgbaToColor(31, 35, 42))!.name).toBe('--aix-colorText');
    expect(mapper.lookup(rgbaToColor(255, 255, 0))).toBeNull();
  });

  it('respects alpha difference', () => {
    const mapper = TokenMapper.fromCss(css, '--aix-');
    expect(mapper.lookup(rgbaToColor(0, 88, 38, 0.5))).toBeNull();
  });

  it('includes all variables when prefix is --', () => {
    const mapper = TokenMapper.fromCss(css, '--');
    expect(mapper.lookup(rgbaToColor(255, 0, 0))!.name).toBe('--other-color');
  });

  it('scopes variables by theme block and prefers semantic names over palette names', () => {
    const themed = `
      :root {
        --aix-tokenGreen6: rgb(0 88 38);
        --aix-colorPrimary: rgb(0 88 38);
        --aix-colorLink: rgb(0 88 38);
      }
      html[data-theme="dark"] {
        --aix-colorPrimary: rgb(0 189 82);
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) { --aix-colorText: #ffffff; }
      }
    `;
    const mapper = TokenMapper.fromCss(themed, '--aix-');
    expect(mapper.size).toBe(5);

    // 调色板名排在前面，仍应选语义名
    expect(mapper.lookup(rgbaToColor(0, 88, 38))!.name).toBe('--aix-colorPrimary');
    expect(mapper.candidates(rgbaToColor(0, 88, 38))).toEqual([
      '--aix-tokenGreen6',
      '--aix-colorPrimary',
      '--aix-colorLink',
    ]);

    // 暗色块里的值默认（light）查不到，theme=dark 才命中
    expect(mapper.lookup(rgbaToColor(0, 189, 82))).toBeNull();
    expect(mapper.lookup(rgbaToColor(0, 189, 82), { theme: 'dark' })!.name).toBe(
      '--aix-colorPrimary',
    );
    expect(mapper.lookup(rgbaToColor(255, 255, 255), { theme: 'dark' })!.name).toBe(
      '--aix-colorText',
    );
    expect(mapper.lookup(rgbaToColor(255, 255, 255))).toBeNull();
  });
});
