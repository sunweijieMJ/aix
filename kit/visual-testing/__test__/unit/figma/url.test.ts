import { describe, it, expect } from 'vitest';
import { parseFigmaRef, normalizeNodeId, isBareNodeId } from '../../../src/core/figma/url';

describe('normalizeNodeId', () => {
  it('converts URL form to API form', () => {
    expect(normalizeNodeId('12-34')).toBe('12:34');
    expect(normalizeNodeId('12%3A34')).toBe('12:34');
    expect(normalizeNodeId('12:34')).toBe('12:34');
  });
});

describe('isBareNodeId', () => {
  it('accepts node ids and instance paths', () => {
    expect(isBareNodeId('12:34')).toBe(true);
    expect(isBareNodeId('12-34')).toBe(true);
    expect(isBareNodeId('I12:34;56:78')).toBe(true);
  });
  it('rejects file keys', () => {
    expect(isBareNodeId('abcKEY123')).toBe(false);
    expect(isBareNodeId('abc:12:34')).toBe(false);
  });
});

describe('parseFigmaRef', () => {
  it('parses /design URL with node-id', () => {
    const ref = parseFigmaRef('https://www.figma.com/design/AbC123/My-File?node-id=12-34&t=xyz');
    expect(ref).toEqual({ fileKey: 'AbC123', nodeId: '12:34' });
  });

  it('parses legacy /file URL with encoded node-id', () => {
    const ref = parseFigmaRef('https://figma.com/file/KEY/Name?node-id=12%3A34');
    expect(ref).toEqual({ fileKey: 'KEY', nodeId: '12:34' });
  });

  it('parses short form fileKey:nodeId', () => {
    expect(parseFigmaRef('KEY:12:34')).toEqual({ fileKey: 'KEY', nodeId: '12:34' });
    expect(parseFigmaRef('KEY:12-34')).toEqual({ fileKey: 'KEY', nodeId: '12:34' });
  });

  it('uses default fileKey for bare node id', () => {
    expect(parseFigmaRef('12:34', 'DEF')).toEqual({ fileKey: 'DEF', nodeId: '12:34' });
    expect(parseFigmaRef('I12:34;56:78', 'DEF')).toEqual({
      fileKey: 'DEF',
      nodeId: 'I12:34;56:78',
    });
  });

  it('throws when fileKey missing', () => {
    expect(() => parseFigmaRef('12:34')).toThrow(/fileKey is missing/);
  });

  it('throws on URL without node-id', () => {
    expect(() => parseFigmaRef('https://www.figma.com/design/KEY/Name')).toThrow(/no node-id/);
  });

  it('throws on non-figma host', () => {
    expect(() => parseFigmaRef('https://example.com/design/KEY?node-id=1-2')).toThrow(
      /Not a figma.com/,
    );
  });

  it('throws on garbage', () => {
    expect(() => parseFigmaRef('hello world')).toThrow(/Cannot parse/);
  });
});
