/**
 * 颜色 → CSS 变量名映射
 *
 * 解析 CSS 文件中 `--prefix...: <color>` 的声明，建立色值反查表。
 * - 按声明所在的规则块识别主题（:root / 含 dark|light 的选择器或 @media），lookup 时按主题过滤
 * - 同值多名时优先语义变量（--aix-colorPrimary）而非调色板变量（--aix-tokenGreen6）
 *
 * 注意：只能告诉 agent「期望色对应哪个变量」；无法判断 DOM 实际值是否经由 var() 得到
 * （computed style 已解析）。
 */

import fs from 'node:fs/promises';

import { deltaE2000, parseCssColor } from '../../utils/color';
import type { Color } from './types';

export type TokenTheme = 'light' | 'dark' | 'any';

export interface TokenEntry {
  name: string;
  color: Color;
  theme: TokenTheme;
  /** 声明所在的选择器 / @media 上下文 */
  scope: string;
}

export interface TokenLookupOptions {
  /** 目标主题，默认 light；'any' 主题的变量始终可选 */
  theme?: 'light' | 'dark';
  maxDeltaE?: number;
}

const PALETTE_NAME = /(token|palette|scale|shade|tint|-\d+$|\d+$)/i;

export class TokenMapper {
  private entries: TokenEntry[] = [];

  static async fromFile(cssFile: string, prefix = '--'): Promise<TokenMapper> {
    const css = await fs.readFile(cssFile, 'utf-8');
    return TokenMapper.fromCss(css, prefix);
  }

  static fromCss(css: string, prefix = '--'): TokenMapper {
    const mapper = new TokenMapper();
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const block of splitBlocks(stripped)) {
      const theme = classifyTheme(block.scope);
      const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)(?:;|$)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(block.body)) !== null) {
        const name = m[1]!;
        if (!name.startsWith(prefix)) continue;
        const color = parseCssColor(m[2]!.trim());
        if (color) mapper.entries.push({ name, color, theme, scope: block.scope });
      }
    }
    return mapper;
  }

  get size(): number {
    return this.entries.length;
  }

  /**
   * 找到与给定颜色 ΔE 最小的变量；超过 maxDeltaE 返回 null。
   * 并列时优先语义名（非调色板名），再按文件顺序。
   */
  lookup(color: Color, options: TokenLookupOptions = {}): TokenEntry | null {
    const theme = options.theme ?? 'light';
    const maxDeltaE = options.maxDeltaE ?? 1;

    let best: TokenEntry | null = null;
    let bestDelta = Infinity;
    for (const entry of this.entries) {
      if (entry.theme !== 'any' && entry.theme !== theme) continue;
      if (Math.abs(entry.color.a - color.a) > 0.02) continue;
      const d = deltaE2000(entry.color, color);
      if (d < bestDelta - 1e-6) {
        bestDelta = d;
        best = entry;
      } else if (
        Math.abs(d - bestDelta) <= 1e-6 &&
        best &&
        isPaletteName(best.name) &&
        !isPaletteName(entry.name)
      ) {
        best = entry;
      }
    }
    return best && bestDelta <= maxDeltaE ? best : null;
  }

  /**
   * 与给定颜色完全同值（ΔE < 0.5）的全部变量名，供报告列出候选
   */
  candidates(color: Color, theme: 'light' | 'dark' = 'light'): string[] {
    return this.entries
      .filter(
        (e) => (e.theme === 'any' || e.theme === theme) && Math.abs(e.color.a - color.a) <= 0.02,
      )
      .filter((e) => deltaE2000(e.color, color) < 0.5)
      .map((e) => e.name);
  }
}

function isPaletteName(name: string): boolean {
  return PALETTE_NAME.test(name);
}

// ---- CSS 分块 ----

interface CssBlock {
  /** 选择器 + 外层 @media 上下文，如 "@media (prefers-color-scheme: dark) :root" */
  scope: string;
  body: string;
}

/**
 * 把 CSS 拆成「作用域 → 声明体」的块，支持 @media 嵌套一层以上
 */
export function splitBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  const stack: string[] = [];
  let buf = '';
  let i = 0;

  while (i < css.length) {
    const ch = css[i]!;
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const scope = stack.join(' ');
      if (buf.trim()) blocks.push({ scope, body: buf });
      stack.pop();
      buf = '';
    } else {
      buf += ch;
    }
    i++;
  }
  return blocks;
}

export function classifyTheme(scope: string): TokenTheme {
  const s = scope.toLowerCase();
  if (/dark/.test(s)) return 'dark';
  if (/light/.test(s)) return 'light';
  return 'any';
}
