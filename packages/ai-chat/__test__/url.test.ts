import { describe, it, expect } from 'vitest';
import { safeUrl } from '../src/utils/url';

describe('safeUrl', () => {
  // --- 安全协议：原样放行 ---
  it('放行 http / https', () => {
    expect(safeUrl('http://example.com')).toBe('http://example.com');
    expect(safeUrl('https://example.com/path?q=1#h')).toBe('https://example.com/path?q=1#h');
  });

  it('放行 mailto / tel', () => {
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeUrl('tel:+8610086')).toBe('tel:+8610086');
  });

  it('协议大小写不敏感', () => {
    expect(safeUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
  });

  // --- 无协议：视为相对/锚点，安全放行 ---
  it('放行无协议的相对路径 / 协议相对 / 锚点 / 查询', () => {
    expect(safeUrl('/path/to/page')).toBe('/path/to/page');
    expect(safeUrl('//cdn.example.com/x')).toBe('//cdn.example.com/x');
    expect(safeUrl('#section')).toBe('#section');
    expect(safeUrl('relative/page')).toBe('relative/page');
  });

  // --- 危险协议：拒绝（返回 undefined）---
  it('拒绝 javascript: 协议', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('JavaScript:alert(1)')).toBeUndefined();
  });

  it('拒绝 data: / vbscript: / file: 协议', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeUrl('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeUrl('file:///etc/passwd')).toBeUndefined();
  });

  it('拒绝用控制字符/空白混淆协议前缀的绕过尝试', () => {
    // 浏览器会忽略 URL 中的 \t \n 等控制字符，故须先剥离再判定
    expect(safeUrl('java\tscript:alert(1)')).toBeUndefined();
    expect(safeUrl('java\nscript:alert(1)')).toBeUndefined();
    expect(safeUrl('  javascript:alert(1)')).toBeUndefined();
    expect(safeUrl(' javascript:alert(1)')).toBeUndefined();
  });

  // --- 空值 ---
  it('空 / undefined 返回 undefined', () => {
    expect(safeUrl(undefined)).toBeUndefined();
    expect(safeUrl('')).toBeUndefined();
  });
});
