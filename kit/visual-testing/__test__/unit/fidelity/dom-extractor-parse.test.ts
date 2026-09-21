/**
 * parseStyles 边界值：直接喂 computed-style 字符串，不需要浏览器
 */

import { describe, it, expect } from 'vitest';
import { parseStyles, lengthToPx } from '../../../src/core/fidelity/dom-extractor';
import type { BrowserRenderNode } from '../../../src/core/fidelity/dom-extractor.browser';

const raw = (over: Partial<BrowserRenderNode['styles']> = {}): BrowserRenderNode['styles'] => ({
  color: 'rgb(0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  backgroundImage: 'none',
  fontFamily: 'Arial',
  fontWeight: '400',
  fontSize: '14px',
  lineHeight: 'normal',
  letterSpacing: 'normal',
  textAlign: 'start',
  borderRadius: ['0px', '0px', '0px', '0px'],
  borderWidths: ['0px', '0px', '0px', '0px'],
  borderColors: ['rgb(0, 0, 0)', 'rgb(0, 0, 0)', 'rgb(0, 0, 0)', 'rgb(0, 0, 0)'],
  borderStyles: ['none', 'none', 'none', 'none'],
  padding: ['', '', '', ''],
  rowGap: '',
  columnGap: '',
  display: 'block',
  flexDirection: '',
  boxShadow: 'none',
  opacity: '1',
  ...over,
});

const bounds = { x: 0, y: 0, width: 40, height: 60 };

describe('lengthToPx', () => {
  it('converts percentages against the reference and passes px through', () => {
    expect(lengthToPx('50%', 40)).toBe(20);
    expect(lengthToPx('12.5px', 40)).toBe(12.5);
    expect(lengthToPx('', 40)).toBe(0);
  });
});

describe('parseStyles', () => {
  it('resolves percentage border-radius against min(width, height)', () => {
    const s = parseStyles(raw({ borderRadius: ['50%', '50%', '50%', '50%'] }), bounds);
    expect(s.borderRadius).toEqual([20, 20, 20, 20]);
  });

  it('keeps row/column gap separate and treats normal as null', () => {
    const s = parseStyles(
      raw({
        display: 'flex',
        rowGap: 'normal',
        columnGap: '12px',
        padding: ['0px', '0px', '0px', '0px'],
      }),
      bounds,
    );
    expect(s.rowGap).toBeNull();
    expect(s.columnGap).toBe(12);
    expect(s.padding).toEqual([0, 0, 0, 0]);

    const block = parseStyles(raw({ rowGap: '12px', columnGap: '12px' }), bounds);
    expect(block.rowGap).toBeNull();
    expect(block.padding).toBeNull();
  });

  it('takes the max side width and the color of the first visible side; ignores style none', () => {
    const s = parseStyles(
      raw({
        borderWidths: ['0px', '0px', '2px', '0px'],
        borderColors: ['rgb(0, 0, 0)', 'rgb(0, 0, 0)', 'rgb(0, 0, 255)', 'rgb(0, 0, 0)'],
        borderStyles: ['none', 'none', 'solid', 'none'],
      }),
      bounds,
    );
    expect(s.borderWidth).toBe(2);
    expect(s.borderWidths).toEqual([0, 0, 2, 0]);
    expect(s.borderColor?.hex).toBe('#0000ff');

    // 宽度非零但 style: none 的边不算可见
    const hidden = parseStyles(raw({ borderWidths: ['3px', '3px', '3px', '3px'] }), bounds);
    expect(hidden.borderWidth).toBe(0);
    expect(hidden.borderColor).toBeNull();
  });

  it('normalises font weight keywords and letter-spacing normal', () => {
    expect(parseStyles(raw({ fontWeight: 'bold' }), bounds).fontWeight).toBe(700);
    expect(parseStyles(raw({ fontWeight: 'normal' }), bounds).fontWeight).toBe(400);
    expect(parseStyles(raw({ letterSpacing: 'normal' }), bounds).letterSpacing).toBe(0);
    expect(parseStyles(raw({ letterSpacing: '0.5px' }), bounds).letterSpacing).toBe(0.5);
    expect(parseStyles(raw({ lineHeight: 'normal' }), bounds).lineHeight).toBeNull();
    expect(parseStyles(raw({ lineHeight: '22.4px' }), bounds).lineHeight).toBe(22.4);
  });

  it('classifies background kinds', () => {
    expect(parseStyles(raw(), bounds).backgroundKind).toBe('none');
    expect(parseStyles(raw({ backgroundColor: 'rgb(255, 0, 0)' }), bounds).backgroundKind).toBe(
      'solid',
    );
    expect(
      parseStyles(raw({ backgroundImage: 'linear-gradient(red, blue)' }), bounds).backgroundKind,
    ).toBe('gradient');
    expect(parseStyles(raw({ backgroundImage: 'url("a.png")' }), bounds).backgroundKind).toBe(
      'image',
    );
  });
});
