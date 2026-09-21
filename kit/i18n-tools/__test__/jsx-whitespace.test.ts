import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { normalizeJsxTextSegment } from '../src/utils/ast-core';

/**
 * 回归（Bug3）：JSX 相邻插值之间的单个空格被丢弃。
 *
 * `<div>共 {a} {b} 项</div>` 里 {a} 与 {b} 之间是纯空白 JsxText（单个空格、不含换行）。
 * 旧逻辑对纯空白 JsxText 一律 `continue` 跳过 → 提取为 `共 ${a}${b} 项`，丢失词间空格。
 *
 * JSX 语义：含换行的纯空白会被 JSX 折叠删除（跳过正确）；不含换行的纯空白（同一行内的
 * 空格）会保留渲染（不该跳过）。修复：仅当纯空白含换行时跳过，否则并入重建文本。
 *
 * ⚠️ 关键约束：提取端（ReactTextExtractor）与转换端重建（common-ast-utils 的
 * reconstructJsxMixedContent）是同一模板的两次重建，逻辑必须完全一致，否则 transform
 * 时 `=== originalText` 失配导致漏替换。roundtrip 用例即验证两端一致。
 */
describe('JSX 相邻插值间的单空格保留（Bug3）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-ws-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const extract = async (code: string) => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    return adapter.getTextExtractor().extractFromFile(file);
  };

  it('提取 `共 {a} {b} 项` 保留 {a}{b} 之间的空格', async () => {
    const code = `import React from 'react';
export function C({ a, b }: { a: number; b: number }) {
  return <div>共 {a} {b} 项</div>;
}
`;
    const strings = await extract(code);
    const mixed = strings.find((s) => s.original.includes('${a}'));
    expect(mixed).toBeTruthy();
    // 关键：a、b 之间保留一个空格
    expect(mixed!.original).toContain('${a} ${b}');
  });

  it('含换行缩进的多行 JSX 行为不变（换行折叠为词间空格，回归）', async () => {
    const code = `import React from 'react';
export function C({ a }: { a: number }) {
  return (
    <div>
      共 {a} 项
    </div>
  );
}
`;
    const strings = await extract(code);
    const mixed = strings.find((s) => s.original.includes('${a}'));
    expect(mixed).toBeTruthy();
    // 边界换行/缩进被 trim；中间 `共 ` / ` 项` 的词间空格保留
    expect(mixed!.original).toBe('`共 ${a} 项`');
  });

  it('extract → transform roundtrip：源码被正确替换，证明两端重建一致', async () => {
    const code = `import React from 'react';
export function C({ a, b }: { a: number; b: number }) {
  return <div>共 {a} {b} 项</div>;
}
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // 两端一致 → 混合内容被真正替换（JSX 富文本走 <Trans>），中文不再残留。
    // 若两端空白处理不一致，findExactStringNode 的 `=== originalText` 失配 → 漏替换，
    // 中文会原样残留在源码里，下面两条断言即会失败。
    expect(out).toContain('i18nKey');
    expect(out).not.toContain('共');
    expect(out).not.toContain('项');
  });
});

/**
 * 提取端与重建端共用 normalizeJsxTextSegment：两端只要差一个空格，
 * `=== originalText` 比对就失配 → JSX 混合内容被静默漏替换。
 */
describe('normalizeJsxTextSegment — JSX 文本段空白归一', () => {
  it('纯空白且含换行 → null（JSX 折叠删除）', () => {
    expect(normalizeJsxTextSegment('\n      ')).toBeNull();
    expect(normalizeJsxTextSegment('\n')).toBeNull();
  });

  it('纯空白不含换行 → 原样保留（相邻插值间的词间空格）', () => {
    expect(normalizeJsxTextSegment(' ')).toBe(' ');
    expect(normalizeJsxTextSegment('  ')).toBe('  ');
  });

  it('含内容：换行 + 缩进压成单空格，词间空格保留', () => {
    expect(normalizeJsxTextSegment('\n      共 ')).toBe(' 共 ');
    expect(normalizeJsxTextSegment(' 项\n    ')).toBe(' 项 ');
    expect(normalizeJsxTextSegment('共 ')).toBe('共 ');
  });

  it('空串原样返回', () => {
    expect(normalizeJsxTextSegment('')).toBe('');
  });
});
