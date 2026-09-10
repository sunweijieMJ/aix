import { describe, it, expect } from 'vitest';
import {
  extractDesignSpec,
  normalizeText,
  collectFontFamilies,
} from '../../../src/core/fidelity/figma-spec-extractor';
import { heroFixture } from '../../fixtures/figma-hero';
import type { FigmaNode } from '../../../src/core/figma/types';

/** 构造一个只关心描边的最小节点 */
function strokedNode(overrides: Partial<FigmaNode>): FigmaNode {
  return {
    id: '1:1',
    name: 'Box',
    type: 'RECTANGLE',
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
    strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
    ...overrides,
  };
}

describe('normalizeText', () => {
  it('collapses whitespace and strips zero-width chars', () => {
    expect(normalizeText('  a​  b\n c ')).toBe('a b c');
  });
});

describe('extractDesignSpec', () => {
  const root = extractDesignSpec(heroFixture);

  it('makes bounds relative to the root frame', () => {
    expect(root.bounds).toEqual({ x: 0, y: 0, width: 1200, height: 400 });
    const title = root.children.find((c) => c.name === 'Title')!;
    expect(title.bounds).toEqual({ x: 48, y: 48, width: 300, height: 40 });
  });

  it('drops invisible subtrees', () => {
    expect(root.children.map((c) => c.name)).toEqual(['Title', 'Subtitle', 'CTA', 'Icon']);
  });

  it('normalizes auto-layout padding and gap', () => {
    expect(root.layout).toMatchObject({ mode: 'VERTICAL', padding: [48, 48, 48, 48], gap: 16 });
  });

  it('sets gap to null for SPACE_BETWEEN', () => {
    const cta = root.children.find((c) => c.name === 'CTA')!;
    expect(cta.layout?.gap).toBeNull();
    expect(cta.layout?.padding).toEqual([0, 16, 0, 16]);
  });

  it('converts fills to hex without folding node opacity', () => {
    const cta = root.children.find((c) => c.name === 'CTA')!;
    expect(cta.fillKind).toBe('solid');
    expect(cta.fills[0]!.hex).toBe('#005826');
    expect(cta.opacity).toBe(1);
    expect(cta.cornerRadius).toEqual([8, 8, 8, 8]);
    expect(cta.effects[0]!.type).toBe('DROP_SHADOW');
    expect(cta.componentId).toBe('9:1');
  });

  it('extracts text style, normalizes content and detects AUTO line height', () => {
    const title = root.children.find((c) => c.name === 'Title')!;
    expect(title.text).toMatchObject({
      content: '欢迎使用 管理后台',
      fontFamily: 'PingFang SC',
      fontWeight: 600,
      fontSize: 28,
      lineHeight: 40,
    });
    expect(title.text!.color!.hex).toBe('#1f2329');
    expect(title.fills).toEqual([]);

    const subtitle = root.children.find((c) => c.name === 'Subtitle')!;
    expect(subtitle.text!.lineHeight).toBeNull();
  });

  it('marks vectors as leaves and does not descend', () => {
    const icon = root.children.find((c) => c.name === 'Icon')!;
    expect(icon.isLeaf).toBe(true);
    expect(icon.children).toEqual([]);
  });

  it('collects font families', () => {
    expect(collectFontFamilies(root)).toEqual(['PingFang SC']);
  });

  it('throws for invisible root', () => {
    expect(() => extractDesignSpec({ ...heroFixture, visible: false })).toThrow(/invisible/);
  });
});

describe('stroke weight', () => {
  it('falls back to strokeWeight when sides are uniform', () => {
    const node = extractDesignSpec(strokedNode({ strokeWeight: 2 }));
    expect(node.strokes[0]!.weight).toBe(2);
  });

  it('takes the max of individualStrokeWeights (DOM 侧同样取四边 max)', () => {
    const node = extractDesignSpec(
      strokedNode({
        strokeWeight: 1,
        individualStrokeWeights: { top: 0, right: 0, bottom: 3, left: 0 },
      }),
    );
    expect(node.strokes[0]!.weight).toBe(3);
  });

  it('defaults to 1 when neither is present', () => {
    const node = extractDesignSpec(strokedNode({}));
    expect(node.strokes[0]!.weight).toBe(1);
  });
});
