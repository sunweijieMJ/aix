import { describe, it, expect } from 'vitest';
import {
  matchNodes,
  iou,
  similarity,
  countByMethod,
} from '../../../src/core/fidelity/node-matcher';
import type { DesignNode, RenderNode, RenderStyles } from '../../../src/core/fidelity/types';

const styles = (over: Partial<RenderStyles> = {}): RenderStyles => ({
  color: null,
  backgroundColor: null,
  backgroundKind: 'none',
  fontFamily: 'PingFang SC',
  fontWeight: 400,
  fontSize: 14,
  lineHeight: null,
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
  ...over,
});

function d(
  id: string,
  name: string,
  bounds: [number, number, number, number],
  extra: Partial<DesignNode> = {},
): DesignNode {
  return {
    id,
    name,
    type: 'FRAME',
    visible: true,
    bounds: { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] },
    opacity: 1,
    fills: [],
    fillKind: 'none',
    strokes: [],
    cornerRadius: [0, 0, 0, 0],
    effects: [],
    isLeaf: false,
    children: [],
    ...extra,
  };
}

function text(
  id: string,
  name: string,
  content: string,
  bounds: [number, number, number, number],
): DesignNode {
  return d(id, name, bounds, {
    type: 'TEXT',
    text: {
      content,
      fontFamily: 'PingFang SC',
      fontWeight: 400,
      fontSize: 14,
      lineHeight: null,
      letterSpacing: 0,
      align: 'LEFT',
      color: null,
    },
  });
}

function r(
  selector: string,
  bounds: [number, number, number, number],
  extra: Partial<RenderNode> = {},
): RenderNode {
  return {
    selector,
    tag: 'div',
    bounds: { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] },
    styles: styles(),
    children: [],
    ...extra,
  };
}

const opts = { textSimilarity: 0.9, geometryIoU: 0.6 };

describe('geometry helpers', () => {
  it('iou of identical boxes is 1, disjoint is 0', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(iou(a, a)).toBe(1);
    expect(iou(a, { x: 20, y: 20, width: 10, height: 10 })).toBe(0);
  });
  it('similarity handles equal, partial and empty', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abcd', 'abcx')).toBe(0.75);
    expect(similarity('', 'x')).toBe(0);
  });
});

describe('matchNodes', () => {
  it('matches by data-figma attr first', () => {
    const design = d('1', 'Root', [0, 0, 100, 100], {
      children: [d('2', 'Card', [10, 10, 50, 50])],
    });
    const render = r('#root', [0, 0, 100, 100], {
      figmaId: '1',
      children: [
        r('.wrong', [10, 10, 50, 50]), // 几何完全相同但没有属性
        r('[data-figma="2"]', [60, 60, 30, 30], { figmaId: '2' }),
      ],
    });

    const { matches } = matchNodes(design, render, opts);
    const card = matches.find((m) => m.design.id === '2')!;
    expect(card.method).toBe('attr');
    expect(card.render!.selector).toBe('[data-figma="2"]');
  });

  it('matches text nodes by normalized content, nearest wins on duplicates', () => {
    const design = d('1', 'Root', [0, 0, 300, 100], {
      children: [
        text('2', 'Btn A', '查看详情', [10, 10, 60, 20]),
        text('3', 'Btn B', '查看详情', [200, 10, 60, 20]),
      ],
    });
    const render = r('#root', [0, 0, 300, 100], {
      children: [
        r('.a', [12, 10, 60, 20], { text: '查看详情' }),
        r('.b', [198, 10, 60, 20], { text: '查看 详情' }),
      ],
    });

    const { matches } = matchNodes(design, render, opts);
    expect(matches.find((m) => m.design.id === '2')!.render!.selector).toBe('.a');
    expect(matches.find((m) => m.design.id === '3')!.render!.selector).toBe('.b');
    expect(matches.find((m) => m.design.id === '3')!.method).toBe('text');
  });

  it('accepts similar text above threshold with lower confidence', () => {
    const design = d('1', 'Root', [0, 0, 300, 100], {
      children: [text('2', 'T', '欢迎使用管理后台系统', [10, 10, 200, 20])],
    });
    const render = r('#root', [0, 0, 300, 100], {
      children: [r('.t', [10, 10, 200, 20], { text: '欢迎使用管理后台系统。' })],
    });

    const { matches } = matchNodes(design, render, opts);
    const m = matches.find((x) => x.design.id === '2')!;
    expect(m.method).toBe('text');
    expect(m.confidence).toBeGreaterThanOrEqual(0.9);
    expect(m.confidence).toBeLessThan(1);
  });

  it('falls back to geometry for containers and respects IoU threshold', () => {
    const design = d('1', 'Root', [0, 0, 200, 200], {
      children: [d('2', 'Card', [10, 10, 100, 100]), d('3', 'Far', [150, 150, 40, 40])],
    });
    const render = r('#root', [0, 0, 200, 200], {
      children: [r('.card', [12, 12, 100, 100]), r('.other', [0, 150, 40, 40])],
    });

    const { matches, unmatchedRender } = matchNodes(design, render, opts);
    const card = matches.find((m) => m.design.id === '2')!;
    expect(card.method).toBe('geometry');
    expect(card.render!.selector).toBe('.card');
    expect(card.confidence).toBeGreaterThan(0.6);

    const far = matches.find((m) => m.design.id === '3')!;
    expect(far.render).toBeNull();
    expect(unmatchedRender.map((n) => n.selector)).toEqual(['.other']);
  });

  it('scopes child matching to the matched parent subtree', () => {
    const design = d('1', 'Root', [0, 0, 200, 100], {
      children: [
        d('2', 'Left', [0, 0, 100, 100], { children: [text('4', 'L', '左', [10, 10, 20, 20])] }),
        d('3', 'Right', [100, 0, 100, 100], {
          children: [text('5', 'R', '右', [110, 10, 20, 20])],
        }),
      ],
    });
    const render = r('#root', [0, 0, 200, 100], {
      children: [
        r('.left', [0, 0, 100, 100], {
          figmaId: '2',
          children: [r('.left span', [10, 10, 20, 20], { text: '左' })],
        }),
        r('.right', [100, 0, 100, 100], {
          figmaId: '3',
          children: [r('.right span', [110, 10, 20, 20], { text: '右' })],
        }),
      ],
    });

    const { matches } = matchNodes(design, render, opts);
    expect(matches.find((m) => m.design.id === '4')!.render!.selector).toBe('.left span');
    expect(matches.find((m) => m.design.id === '5')!.render!.selector).toBe('.right span');
    // 根元素没有 data-figma 时按默认绑定，计入 root
    expect(countByMethod(matches)).toEqual({ attr: 2, text: 2, geometry: 0, root: 1, missing: 0 });
    expect(matches[0]!.method).toBe('root');
    expect(matches[0]!.confidence).toBe(0);
  });

  it('warns on duplicate data-figma and consumes only the first element', () => {
    const design = d('1', 'Root', [0, 0, 300, 100], {
      children: [d('2', 'Item', [0, 0, 100, 100]), d('3', 'Other', [200, 0, 100, 100])],
    });
    const render = r('#root', [0, 0, 300, 100], {
      children: [
        r('.item-a', [0, 0, 100, 100], { figmaId: '2' }),
        r('.item-b', [100, 0, 100, 100], { figmaId: '2' }),
        r('.other', [200, 0, 100, 100]),
      ],
    });

    const { matches, unmatchedRender, warnings } = matchNodes(design, render, opts);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('data-figma 重复：2');
    expect(matches.find((m) => m.design.id === '2')!.render!.selector).toBe('.item-a');
    expect(matches.find((m) => m.design.id === '3')!.render!.selector).toBe('.other');
    expect(unmatchedRender.map((n) => n.selector)).toEqual(['.item-b']);
  });

  it('does not reuse a render node for two design nodes', () => {
    const design = d('1', 'Root', [0, 0, 100, 100], {
      children: [d('2', 'A', [0, 0, 50, 50]), d('3', 'B', [0, 0, 50, 50])],
    });
    const render = r('#root', [0, 0, 100, 100], { children: [r('.only', [0, 0, 50, 50])] });

    const { matches } = matchNodes(design, render, opts);
    const withRender = matches.filter((m) => m.design.id !== '1' && m.render);
    expect(withRender).toHaveLength(1);
  });
});
