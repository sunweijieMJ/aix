import { describe, it, expect } from 'vitest';
import {
  analyzeResponsive,
  defaultProbeWidths,
  countBySeverity,
  type ResponsiveMeasurement,
} from '../../../src/core/fidelity/responsive-probe';
import type { Bounds, DesignNode, NodeMatch, RenderNode } from '../../../src/core/fidelity/types';

const b = (x: number, y: number, width: number, height: number): Bounds => ({
  x,
  y,
  width,
  height,
});

function measurement(
  width: number,
  rootWidth: number,
  nodes: Record<string, Bounds> = {},
  scrollWidth = width,
): ResponsiveMeasurement {
  return {
    width,
    scrollWidth,
    rootBounds: b(0, 0, rootWidth, 750),
    nodes: new Map(Object.entries(nodes)),
  };
}

function match(
  id: string,
  selector: string,
  bounds: Bounds,
  sizing?: 'FILL' | 'HUG' | 'FIXED',
): NodeMatch {
  const design = {
    id,
    name: id,
    type: 'FRAME',
    visible: true,
    bounds,
    opacity: 1,
    fills: [],
    fillKind: 'none',
    strokes: [],
    cornerRadius: [0, 0, 0, 0],
    effects: [],
    isLeaf: false,
    children: [],
    sizing: sizing ? { horizontal: sizing } : undefined,
  } as unknown as DesignNode;
  const render = { selector, tag: 'div', bounds, children: [] } as unknown as RenderNode;
  return { design, render, method: 'attr', confidence: 1, diffs: [] };
}

describe('defaultProbeWidths', () => {
  it('derives narrower breakpoints from the frame width, widest first', () => {
    expect(defaultProbeWidths(1440)).toEqual([1008, 768, 375]);
  });
  it('drops candidates that are not narrower than the frame', () => {
    expect(defaultProbeWidths(800)).toEqual([768, 560, 375].filter((w) => w < 800).slice(0, 3));
    expect(defaultProbeWidths(375)).toEqual([263]);
    expect(defaultProbeWidths(1)).toEqual([]);
  });
});

describe('analyzeResponsive', () => {
  const baseRoot = b(0, 0, 1440, 750);

  it('flags a root that does not shrink with the viewport', () => {
    const findings = analyzeResponsive(baseRoot, [measurement(768, 1440)], []);
    const noReflow = findings.find((f) => f.type === 'no-reflow')!;
    expect(noReflow.severity).toBe('major');
    expect(noReflow.detail).toContain('1440px');
    expect(noReflow.detail).toContain('768px');
  });

  it('does not flag a root that reflows', () => {
    const findings = analyzeResponsive(baseRoot, [measurement(768, 768)], []);
    expect(findings.filter((f) => f.type === 'no-reflow')).toEqual([]);
  });

  it('flags horizontal overflow with the overflow amount', () => {
    const findings = analyzeResponsive(baseRoot, [measurement(768, 768, {}, 1440)], []);
    const overflow = findings.find((f) => f.type === 'overflow')!;
    expect(overflow.severity).toBe('major');
    expect(overflow.detail).toContain('672px');
  });

  it('flags a FILL node whose width never changes', () => {
    const m = match('1:1', '.intro', b(40, 40, 1260, 78), 'FILL');
    const findings = analyzeResponsive(
      baseRoot,
      [measurement(768, 768, { '.intro': b(40, 40, 1260, 78) })],
      [m],
    );
    const fill = findings.find((f) => f.type === 'fixed-width-should-fill')!;
    expect(fill.severity).toBe('major');
    expect(fill.figmaId).toBe('1:1');
    expect(fill.selector).toBe('.intro');
    expect(fill.designSizing).toBe('FILL');
  });

  it('does not flag a FILL node that actually shrinks, nor HUG / FIXED nodes', () => {
    const fill = match('1:1', '.intro', b(40, 40, 1260, 78), 'FILL');
    const hug = match('1:2', '.btn', b(40, 40, 100, 34), 'HUG');
    const findings = analyzeResponsive(
      baseRoot,
      [measurement(768, 768, { '.intro': b(40, 40, 688, 78), '.btn': b(40, 40, 100, 34) })],
      [fill, hug],
    );
    expect(findings.filter((f) => f.type === 'fixed-width-should-fill')).toEqual([]);
  });

  it('flags elements spilling past the root and caps the list at three', () => {
    const nodes: Record<string, Bounds> = {};
    for (let i = 0; i < 6; i++) nodes[`.c${i}`] = b(700, 0, 200 + i * 10, 50);
    const findings = analyzeResponsive(baseRoot, [measurement(768, 768, nodes)], []);
    const clipped = findings.filter((f) => f.type === 'clipped');
    expect(clipped).toHaveLength(3);
    // 越界最多的排在前面
    expect(clipped[0]!.selector).toBe('.c5');
    expect(clipped[0]!.severity).toBe('minor');
  });

  it('reports each issue once, keeping the narrowest width', () => {
    const findings = analyzeResponsive(
      baseRoot,
      [measurement(1008, 1440), measurement(768, 1440), measurement(375, 1440)],
      [],
    );
    const noReflow = findings.filter((f) => f.type === 'no-reflow');
    expect(noReflow).toHaveLength(1);
    expect(noReflow[0]!.width).toBe(375);
  });

  it('produces nothing when there is no measurement', () => {
    expect(analyzeResponsive(baseRoot, [], [])).toEqual([]);
  });
});

describe('countBySeverity', () => {
  it('splits findings by severity', () => {
    const findings = analyzeResponsive(
      b(0, 0, 1440, 750),
      [measurement(768, 1440, { '.x': b(1300, 0, 300, 10) }, 1600)],
      [],
    );
    expect(countBySeverity(findings)).toEqual({ major: 2, minor: 1 });
  });
});
