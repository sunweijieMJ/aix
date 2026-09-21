import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../../src/core/report/fidelity-reporter';
import { summarize } from '../../../src/core/fidelity/orchestrator';
import type {
  DesignNode,
  FidelityResult,
  NodeMatch,
  RenderNode,
} from '../../../src/core/fidelity/types';
import { rgbaToColor } from '../../../src/utils/color';

const design = (
  id: string,
  name: string,
  w = 100,
  h = 40,
  extra: Partial<DesignNode> = {},
): DesignNode => ({
  id,
  name,
  type: 'FRAME',
  visible: true,
  bounds: { x: 0, y: 0, width: w, height: h },
  opacity: 1,
  fills: [],
  fillKind: 'none',
  strokes: [],
  cornerRadius: [0, 0, 0, 0],
  effects: [],
  isLeaf: false,
  children: [],
  ...extra,
});

const render = (selector: string, text?: string): RenderNode => ({
  selector,
  tag: 'div',
  text,
  bounds: { x: 0, y: 0, width: 100, height: 40 },
  styles: {
    color: null,
    backgroundColor: rgbaToColor(255, 0, 0),
    backgroundKind: 'solid',
    fontFamily: '',
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
  },
  children: [],
});

function buildResult(): FidelityResult {
  const matches: NodeMatch[] = [
    {
      design: design('1', 'Hero', 1200, 400),
      render: render('#hero'),
      method: 'attr',
      confidence: 1,
      diffs: [],
    },
    {
      design: design('2', 'Title', 300, 40, { type: 'TEXT' }),
      render: render('.hero__title', '标题'),
      method: 'text',
      confidence: 1,
      diffs: [
        {
          property: 'fontSize',
          expected: '28px',
          actual: '24px',
          delta: -4,
          tolerance: 0,
          severity: 'major',
        },
        {
          property: 'color',
          expected: '#1f2329',
          actual: '#333333',
          delta: 4.2,
          tolerance: 3,
          severity: 'minor',
          token: '--aix-colorText',
          hint: '使用 var(--aix-colorText)',
        },
      ],
    },
    {
      design: design('3', 'CTA', 120, 40),
      render: render('.hero__cta'),
      method: 'geometry',
      confidence: 0.82,
      diffs: [
        {
          property: 'borderRadius',
          expected: '8px 8px 8px 8px',
          actual: '6px 6px 6px 6px',
          delta: 2,
          tolerance: 2,
          severity: 'minor',
        },
      ],
    },
    {
      design: design('4', 'Badge', 96, 24, { componentId: '9:9' }),
      render: null,
      confidence: 0,
      diffs: [],
    },
    {
      design: design('5', 'Icon', 24, 24, { type: 'VECTOR', isLeaf: true }),
      render: null,
      confidence: 0,
      diffs: [],
    },
  ];

  return {
    meta: {
      figma: { fileKey: 'KEY', nodeId: '12:34', version: '2145', name: 'Hero' },
      url: 'http://localhost:5173/hero',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      generatedAt: '2026-09-10T00:00:00.000Z',
      durationMs: 1200,
    },
    warnings: ['设计图与实现截图尺寸略有差异（1200x400 vs 1200x404），已左上对齐比对'],
    matches,
    unmatchedRender: [render('.hero__divider')],
    pixel: {
      mismatchPercentage: 6.8,
      diffPath: '/out/diff.png',
      designImage: '/out/design.png',
      renderImage: '/out/render.png',
      regions: [
        {
          bounds: { x: 320, y: 48, width: 96, height: 24 },
          pixels: 900,
          cropDesign: '/out/crops/region-1-design.png',
          cropRender: '/out/crops/region-1-render.png',
          relatedNodeIds: ['4'],
        },
        {
          bounds: { x: 880, y: 120, width: 64, height: 64 },
          pixels: 400,
          cropDesign: '/out/crops/region-2-design.png',
          cropRender: '/out/crops/region-2-render.png',
          relatedNodeIds: ['1'],
          note: '图标方向相反',
        },
      ],
    },
    summary: summarize(matches),
  };
}

describe('summarize', () => {
  it('counts severities, missing (container vs leaf) and computes advisory score', () => {
    const s = buildResult().summary;
    expect(s).toEqual({
      total: 5,
      matched: 3,
      missing: 2,
      missingLeaf: 1,
      major: 1,
      minor: 2,
      info: 0,
      responsive: 0,
      interaction: 0,
      score: 100 - 5 - 2 - 8 - 2,
    });
  });

  it('keeps responsive / interaction counts out of the design-fidelity score', () => {
    const matches = buildResult().matches;
    const withProbes = summarize(matches, { responsive: 3, interaction: 5 });
    expect(withProbes.responsive).toBe(3);
    expect(withProbes.interaction).toBe(5);
    // score 只反映与设计稿的静态吻合度，不被工程质量探测稀释
    expect(withProbes.score).toBe(summarize(matches).score);
  });
});

describe('renderMarkdown', () => {
  const md = renderMarkdown(buildResult(), '/out');

  it('has header, summary line and warnings', () => {
    expect(md).toContain('# Fidelity Report: Hero (12:34) ↔ http://localhost:5173/hero');
    expect(md).toContain('matched 3/5 · major 1 · minor 2 · missing 2 · pixel mismatch 6.8%');
    expect(md).toContain('> - 设计图与实现截图尺寸略有差异');
  });

  it('lists major items with selector, token and delta', () => {
    expect(md).toContain('## Major');
    expect(md).toContain('### Title：字号不一致（另 1 项）');
    expect(md).toContain('DOM: `.hero__title` · match: text');
    expect(md).toContain('[**major**] fontSize: 期望 28px，实际 24px（Δ -4）');
    expect(md).toContain('color: 期望 #1f2329 → `var(--aix-colorText)`，实际 #333333（ΔE 4.2）');
  });

  it('lists missing nodes with crop paths relative to the report dir', () => {
    expect(md).toContain('### 未找到对应元素：Badge');
    expect(md).toContain('component 9:9');
    expect(md).toContain('裁图: crops/region-1-design.png · crops/region-1-render.png');
  });

  it('lists minor-only items with geometry confidence and abs delta', () => {
    expect(md).toContain('## Minor');
    expect(md).toContain('### CTA：圆角不一致');
    expect(md).toContain('match: geometry (82%)');
    expect(md).toContain('（最大 Δ 2）');
  });

  it('puts missing leaf nodes under Minor, containers under Major', () => {
    const majorIdx = md.indexOf('## Major');
    const minorIdx = md.indexOf('## Minor');
    expect(md.indexOf('### 未找到对应元素：Badge')).toBeGreaterThan(majorIdx);
    expect(md.indexOf('### 未找到对应元素：Badge')).toBeLessThan(minorIdx);
    expect(md.indexOf('### 未找到对应元素（图标/图片）：Icon')).toBeGreaterThan(minorIdx);
  });

  it('lists unexplained regions with LLM note and extra DOM nodes', () => {
    expect(md).toContain('## 未解释的差异区域');
    expect(md).toContain('region-2 (880, 120) 64×64 · nodes 1');
    expect(md).toContain('note: 图标方向相反（LLM，仅供参考）');
    expect(md).toContain('## DOM 多出的元素');
    expect(md).toContain('`.hero__divider`');
  });

  it('does not list the missing-node region as unexplained', () => {
    expect(md).not.toContain('region-1 (320, 48)');
  });
});
