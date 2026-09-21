import { describe, it, expect } from 'vitest';
import { diffNode, fontFamilyMatches } from '../../../src/core/fidelity/property-diff';
import { TokenMapper } from '../../../src/core/fidelity/token-mapper';
import { rgbaToColor } from '../../../src/utils/color';
import type { DesignNode, RenderNode, RenderStyles } from '../../../src/core/fidelity/types';

const tolerances = {
  position: 2,
  size: 2,
  colorDeltaE: 3,
  colorDeltaEMajor: 6,
  geometryMajor: 8,
  spacing: 2,
  radius: 2,
  lineHeight: 1,
  letterSpacing: 1,
  borderWidth: 0.5,
  opacity: 0.05,
};

const baseStyles: RenderStyles = {
  color: rgbaToColor(31, 35, 41),
  backgroundColor: null,
  backgroundKind: 'none',
  fontFamily: '-apple-system, "PingFang SC", sans-serif',
  fontWeight: 600,
  fontSize: 28,
  lineHeight: 40,
  letterSpacing: 0,
  textAlign: 'left',
  borderRadius: [0, 0, 0, 0],
  borderColor: null,
  borderWidth: 0,
  borderWidths: [0, 0, 0, 0],
  padding: null,
  rowGap: null,
  columnGap: null,
  display: 'block',
  flexDirection: null,
  boxShadow: 'none',
  opacity: 1,
};

const titleDesign: DesignNode = {
  id: '12:36',
  name: 'Title',
  type: 'TEXT',
  visible: true,
  bounds: { x: 48, y: 48, width: 300, height: 40 },
  opacity: 1,
  fills: [],
  fillKind: 'none',
  strokes: [],
  cornerRadius: [0, 0, 0, 0],
  effects: [],
  isLeaf: false,
  children: [],
  text: {
    content: '欢迎使用管理后台',
    fontFamily: 'PingFang SC',
    fontWeight: 600,
    fontSize: 28,
    lineHeight: 40,
    letterSpacing: 0,
    align: 'LEFT',
    color: rgbaToColor(31, 35, 41),
  },
};

const titleRender = (
  over: Partial<RenderStyles> = {},
  bounds = titleDesign.bounds,
  text: string | undefined = '欢迎使用管理后台',
): RenderNode => ({
  selector: '.hero__title',
  tag: 'h1',
  text,
  bounds,
  styles: { ...baseStyles, ...over },
  children: [],
});

describe('fontFamilyMatches', () => {
  it('matches when family is anywhere in the stack', () => {
    expect(fontFamilyMatches('PingFang SC', '-apple-system, "PingFang SC", sans-serif')).toBe(true);
    expect(fontFamilyMatches('pingfang sc', 'PingFangSC')).toBe(true);
    expect(fontFamilyMatches('Inter', 'Roboto, sans-serif')).toBe(false);
    expect(fontFamilyMatches('', 'anything')).toBe(true);
  });
});

describe('diffNode', () => {
  it('returns no diffs for an identical text node', () => {
    expect(diffNode(titleDesign, titleRender(), { tolerances })).toEqual([]);
  });

  it('reports fontSize as major and color by ΔE', () => {
    const diffs = diffNode(
      titleDesign,
      titleRender({ fontSize: 24, color: rgbaToColor(45, 49, 56) }),
      { tolerances },
    );
    const fontSize = diffs.find((d) => d.property === 'fontSize')!;
    expect(fontSize.severity).toBe('major');
    expect(fontSize.expected).toBe('28px');
    expect(fontSize.actual).toBe('24px');

    const color = diffs.find((d) => d.property === 'color')!;
    expect(color.severity).toBe('minor'); // #1F2329 vs #2D3138 ΔE ≈ 4.5，在 3~6 之间
    expect(color.delta).toBeGreaterThan(3);
    expect(color.delta).toBeLessThan(6);

    const major = diffNode(titleDesign, titleRender({ color: rgbaToColor(51, 51, 51) }), {
      tolerances,
    });
    expect(major.find((d) => d.property === 'color')!.severity).toBe('major'); // ΔE ≈ 6.7
  });

  it('ignores geometry within tolerance and escalates large deltas to major', () => {
    const small = diffNode(
      titleDesign,
      titleRender({}, { x: 49.5, y: 47, width: 301, height: 40 }),
      { tolerances },
    );
    expect(small).toEqual([]);

    const big = diffNode(titleDesign, titleRender({}, { x: 60, y: 48, width: 300, height: 40 }), {
      tolerances,
    });
    expect(big.find((d) => d.property === 'x')!.severity).toBe('major');
    expect(big.find((d) => d.property === 'x')!.delta).toBe(12);
  });

  it('caps geometry severity to minor when the font family is missing', () => {
    const diffs = diffNode(
      titleDesign,
      titleRender({ fontFamily: 'Arial' }, { x: 48, y: 48, width: 340, height: 40 }),
      { tolerances },
    );
    expect(diffs.find((d) => d.property === 'fontFamily')!.severity).toBe('minor');
    expect(diffs.find((d) => d.property === 'width')!.severity).toBe('minor');
  });

  it('reports text content mismatch as major', () => {
    const diffs = diffNode(titleDesign, titleRender({}, titleDesign.bounds, '欢迎使用'), {
      tolerances,
    });
    expect(diffs.find((d) => d.property === 'text')!.severity).toBe('major');
  });

  it('tolerates sub-pixel font sizes from clamp() / vw', () => {
    // 48px 经 clamp 计算常落成 47.95，不该报成 major
    // titleDesign 的字号是 28
    expect(diffNode(titleDesign, titleRender({ fontSize: 27.95 }), { tolerances })).toEqual([]);
    expect(
      diffNode(titleDesign, titleRender({ fontSize: 27 }), { tolerances }).find(
        (d) => d.property === 'fontSize',
      )!.severity,
    ).toBe('major');
  });

  it('downgrades split inline text to info when the subtree text still matches', () => {
    const design: DesignNode = {
      ...titleDesign,
      text: { ...titleDesign.text!, content: '共 1234 条相关结果' },
    };
    // 实现把数字单独包了一层换颜色，直接文本只剩两段
    const render = titleRender({}, titleDesign.bounds, '共  条相关结果');
    // fullText 由浏览器按文档顺序采集，父元素直接文本与子元素文本是交错的
    render.fullText = '共 1234 条相关结果';
    const diff = diffNode(design, render, { tolerances }).find((d) => d.property === 'text')!;
    expect(diff.severity).toBe('info');
    expect(diff.hint).toContain('拆分');

    // 合并后仍然对不上时，照旧报 major
    render.fullText = '共 9999 条相关结果';
    expect(
      diffNode(design, render, { tolerances }).find((d) => d.property === 'text')!.severity,
    ).toBe('major');
  });

  it('skips lineHeight when design is AUTO', () => {
    const auto: DesignNode = { ...titleDesign, text: { ...titleDesign.text!, lineHeight: null } };
    expect(diffNode(auto, titleRender({ lineHeight: 30 }), { tolerances })).toEqual([]);
  });

  it('attaches token name and hint for expected colors', () => {
    const tokens = TokenMapper.fromCss(
      ':root { --aix-colorText: rgb(31 35 41); --aix-colorPrimary: #005826; }',
      '--aix-',
    );
    const diffs = diffNode(titleDesign, titleRender({ color: rgbaToColor(120, 120, 120) }), {
      tolerances,
      tokens,
    });
    const color = diffs.find((d) => d.property === 'color')!;
    expect(color.token).toBe('--aix-colorText');
    expect(color.hint).toContain('var(--aix-colorText)');
    expect(color.severity).toBe('major');
  });

  it('compares container fill, radius, padding, gap, shadow and border', () => {
    const cta: DesignNode = {
      id: '12:40',
      name: 'CTA',
      type: 'INSTANCE',
      visible: true,
      bounds: { x: 48, y: 144, width: 120, height: 40 },
      opacity: 1,
      fills: [rgbaToColor(0, 88, 38)],
      fillKind: 'solid',
      strokes: [{ color: rgbaToColor(0, 88, 38), weight: 1 }],
      cornerRadius: [8, 8, 8, 8],
      effects: [{ type: 'DROP_SHADOW', radius: 4 }],
      layout: {
        mode: 'HORIZONTAL',
        padding: [0, 16, 0, 16],
        gap: 8,
        primaryAlign: 'CENTER',
        counterAlign: 'CENTER',
      },
      isLeaf: false,
      children: [],
    };
    const render: RenderNode = {
      selector: '.cta',
      tag: 'button',
      bounds: cta.bounds,
      styles: {
        ...baseStyles,
        backgroundColor: rgbaToColor(0, 88, 38),
        backgroundKind: 'solid',
        borderRadius: [5, 5, 5, 5],
        borderColor: rgbaToColor(0, 88, 38),
        borderWidth: 1,
        borderWidths: [1, 1, 1, 1],
        padding: [0, 12, 0, 12],
        // HORIZONTAL 布局比 column-gap；row-gap 故意给个无关值确认不会被选中
        rowGap: 99,
        columnGap: 4,
        display: 'flex',
        flexDirection: 'row',
        boxShadow: 'none',
      },
      children: [],
    };

    const diffs = diffNode(cta, render, { tolerances });
    const props = diffs.map((d) => d.property).sort();
    expect(props).toEqual(['borderRadius', 'boxShadow', 'gap', 'padding']);
    expect(diffs.every((d) => d.severity === 'minor')).toBe(true);
    expect(diffs.find((d) => d.property === 'padding')!.hint).toContain('margin');
    expect(diffs.find((d) => d.property === 'gap')).toMatchObject({
      expected: '8px',
      actual: '4px',
    });

    // 同样的 DOM 若 Figma 是 VERTICAL 布局，则比 row-gap
    const vertical: DesignNode = { ...cta, layout: { ...cta.layout!, mode: 'VERTICAL' } };
    expect(
      diffNode(vertical, render, { tolerances }).find((d) => d.property === 'gap'),
    ).toMatchObject({ actual: '99px' });
  });

  it('recognises a single-side border (divider) via the max side width', () => {
    const divider: DesignNode = {
      id: 'd',
      name: 'Divider',
      type: 'RECTANGLE',
      visible: true,
      bounds: { x: 0, y: 0, width: 200, height: 1 },
      opacity: 1,
      fills: [],
      fillKind: 'none',
      strokes: [{ color: rgbaToColor(0, 0, 255), weight: 2 }],
      cornerRadius: [0, 0, 0, 0],
      effects: [],
      isLeaf: false,
      children: [],
    };
    const render: RenderNode = {
      selector: '.divider',
      tag: 'div',
      bounds: divider.bounds,
      styles: {
        ...baseStyles,
        borderWidth: 2,
        borderWidths: [0, 0, 2, 0],
        borderColor: rgbaToColor(0, 0, 255),
      },
      children: [],
    };
    expect(diffNode(divider, render, { tolerances })).toEqual([]);
  });

  it('reports transparent actual color as minor with a hint', () => {
    const card: DesignNode = {
      id: 'c',
      name: 'Card',
      type: 'FRAME',
      visible: true,
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      opacity: 1,
      fills: [rgbaToColor(255, 255, 255)],
      fillKind: 'solid',
      strokes: [],
      cornerRadius: [0, 0, 0, 0],
      effects: [],
      isLeaf: false,
      children: [],
    };
    const render: RenderNode = {
      selector: '.card',
      tag: 'div',
      bounds: card.bounds,
      styles: baseStyles,
      children: [],
    };
    const bg = diffNode(card, render, { tolerances }).find(
      (d) => d.property === 'backgroundColor',
    )!;
    expect(bg.severity).toBe('minor');
    expect(bg.actual).toBe('transparent');
    expect(bg.hint).toContain('父元素');
  });

  it('compares subtree text when the matched element has no direct text', () => {
    const wrapper = titleRender();
    wrapper.text = undefined; // 传 undefined 会触发默认参数，必须显式清掉
    wrapper.children = [
      {
        selector: '.hero__title > span',
        tag: 'span',
        text: '欢迎使用后台',
        bounds: titleDesign.bounds,
        styles: baseStyles,
        children: [],
      },
    ];
    const diffs = diffNode(titleDesign, wrapper, { tolerances });
    const text = diffs.find((d) => d.property === 'text')!;
    expect(text.severity).toBe('minor');
    expect(text.actual).toBe('欢迎使用后台');

    wrapper.children[0]!.text = '欢迎使用管理后台';
    expect(
      diffNode(titleDesign, wrapper, { tolerances }).find((d) => d.property === 'text'),
    ).toBeUndefined();
  });

  it('only compares geometry for leaf nodes', () => {
    const icon: DesignNode = {
      id: '12:50',
      name: 'Icon',
      type: 'VECTOR',
      visible: true,
      bounds: { x: 0, y: 0, width: 24, height: 24 },
      opacity: 1,
      fills: [rgbaToColor(0, 88, 38)],
      fillKind: 'solid',
      strokes: [],
      cornerRadius: [0, 0, 0, 0],
      effects: [],
      isLeaf: true,
      children: [],
    };
    const render: RenderNode = {
      selector: 'svg',
      tag: 'svg',
      bounds: { x: 0, y: 0, width: 24, height: 24 },
      styles: {
        ...baseStyles,
        backgroundColor: rgbaToColor(255, 0, 0),
        backgroundKind: 'solid',
        borderRadius: [12, 12, 12, 12],
      },
      children: [],
    };
    expect(diffNode(icon, render, { tolerances })).toEqual([]);
  });
});
