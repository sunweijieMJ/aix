/**
 * 属性级差异引擎
 *
 * 对每个 NodeMatch 逐属性比较，按容差判定 severity。规则见 docs/fidelity-architecture.md §5.5。
 * 全部确定性，不依赖 LLM。
 */

import { deltaE2000 } from '../../utils/color';
import { subtreeText } from './dom-extractor';
import { textKey } from './node-matcher';
import type { TokenMapper } from './token-mapper';
import type {
  Color,
  DesignNode,
  FidelitySeverity,
  NodeMatch,
  PropertyDiff,
  RenderNode,
} from './types';

export interface DiffTolerances {
  position: number;
  size: number;
  colorDeltaE: number;
  colorDeltaEMajor: number;
  geometryMajor: number;
  spacing: number;
  radius: number;
  lineHeight: number;
  letterSpacing: number;
  borderWidth: number;
  opacity: number;
}

export interface DiffOptions {
  tolerances: DiffTolerances;
  tokens?: TokenMapper;
  /** 选择 token 表中对应主题的变量 */
  theme?: 'light' | 'dark';
}

const fmt = (n: number) => `${Math.round(n * 100) / 100}px`;

/**
 * 为所有匹配填充 diffs（原地修改并返回）
 */
export function diffMatches(matches: NodeMatch[], options: DiffOptions): NodeMatch[] {
  for (const m of matches) {
    if (!m.render) continue;
    m.diffs = diffNode(m.design, m.render, options);
  }
  return matches;
}

export function diffNode(
  design: DesignNode,
  render: RenderNode,
  options: DiffOptions,
): PropertyDiff[] {
  const t = options.tolerances;
  const diffs: PropertyDiff[] = [];

  // 字体族失配时，TEXT 节点的宽高差异降级（度量差异来自字体本身）
  const fontMismatch = design.text
    ? !fontFamilyMatches(design.text.fontFamily, render.styles.fontFamily)
    : false;
  const geometryCap: FidelitySeverity | null =
    design.type === 'TEXT' && fontMismatch ? 'minor' : null;

  // ---- 几何 ----
  pushNumeric(
    diffs,
    'x',
    design.bounds.x,
    render.bounds.x,
    t.position,
    t.geometryMajor,
    geometryCap,
  );
  pushNumeric(
    diffs,
    'y',
    design.bounds.y,
    render.bounds.y,
    t.position,
    t.geometryMajor,
    geometryCap,
  );
  pushNumeric(
    diffs,
    'width',
    design.bounds.width,
    render.bounds.width,
    t.size,
    t.geometryMajor,
    geometryCap,
  );
  pushNumeric(
    diffs,
    'height',
    design.bounds.height,
    render.bounds.height,
    t.size,
    t.geometryMajor,
    geometryCap,
  );

  // 叶子（图标 / 图片）只比几何
  if (design.isLeaf) return diffs;

  // ---- 文本 ----
  if (design.text) {
    const dt = design.text;
    const rs = render.styles;

    if (dt.content) {
      if (render.text !== undefined) {
        if (textKey(render.text) !== textKey(dt.content)) {
          diffs.push({
            property: 'text',
            expected: dt.content,
            actual: render.text,
            tolerance: 0,
            severity: 'major',
          });
        }
      } else {
        // TEXT 节点匹配到了容器（文案在子元素里）：退而比较子树文本，置信度低所以只报 minor
        const inner = subtreeText(render);
        if (inner && textKey(inner) !== textKey(dt.content)) {
          diffs.push({
            property: 'text',
            expected: dt.content,
            actual: inner,
            tolerance: 0,
            severity: 'minor',
            hint: '匹配到的元素没有直接文本，此处比较的是其子树文本',
          });
        }
      }
    }
    if (dt.fontSize && Math.abs(dt.fontSize - rs.fontSize) > 0.01) {
      diffs.push({
        property: 'fontSize',
        expected: fmt(dt.fontSize),
        actual: fmt(rs.fontSize),
        delta: round(rs.fontSize - dt.fontSize),
        tolerance: 0,
        severity: 'major',
      });
    }
    if (dt.fontWeight !== rs.fontWeight) {
      diffs.push({
        property: 'fontWeight',
        expected: dt.fontWeight,
        actual: rs.fontWeight,
        tolerance: 0,
        severity: 'major',
      });
    }
    if (fontMismatch && dt.fontFamily) {
      diffs.push({
        property: 'fontFamily',
        expected: dt.fontFamily,
        actual: rs.fontFamily,
        tolerance: 0,
        severity: 'minor',
        hint: `字体栈中未包含 "${dt.fontFamily}"；若设计字体本机未安装，位置/尺寸差异可能由此引起`,
      });
    }
    if (dt.lineHeight !== null && rs.lineHeight !== null) {
      pushNumeric(
        diffs,
        'lineHeight',
        dt.lineHeight,
        rs.lineHeight,
        t.lineHeight,
        Infinity,
        'minor',
      );
    }
    pushNumeric(
      diffs,
      'letterSpacing',
      dt.letterSpacing,
      rs.letterSpacing,
      t.letterSpacing,
      Infinity,
      'minor',
    );
    if (dt.color) pushColor(diffs, 'color', dt.color, rs.color, options);
  } else {
    // ---- 填充 ----
    if (design.fillKind === 'solid' && design.fills[0]) {
      pushColor(diffs, 'backgroundColor', design.fills[0], render.styles.backgroundColor, options);
    }
  }

  // ---- 圆角 ----
  const maxRadiusDelta = Math.max(
    ...design.cornerRadius.map((r, i) => Math.abs(r - render.styles.borderRadius[i]!)),
  );
  if (maxRadiusDelta > t.radius) {
    diffs.push({
      property: 'borderRadius',
      expected: design.cornerRadius.map(fmt).join(' '),
      actual: render.styles.borderRadius.map(fmt).join(' '),
      delta: round(maxRadiusDelta),
      tolerance: t.radius,
      severity: 'minor',
    });
  }

  // ---- 描边（DOM 侧取四边最大宽度，单边 border-bottom 也能识别）----
  const stroke = design.strokes[0];
  if (stroke) {
    pushNumeric(
      diffs,
      'borderWidth',
      stroke.weight,
      render.styles.borderWidth,
      t.borderWidth,
      Infinity,
      'minor',
    );
    pushColor(diffs, 'borderColor', stroke.color, render.styles.borderColor, options, 'minor');
  } else if (render.styles.borderWidth > t.borderWidth) {
    diffs.push({
      property: 'borderWidth',
      expected: '0px',
      actual: fmt(render.styles.borderWidth),
      delta: render.styles.borderWidth,
      tolerance: t.borderWidth,
      severity: 'minor',
    });
  }

  // ---- 布局 ----
  if (design.layout && render.styles.padding) {
    const dp = design.layout.padding;
    const rp = render.styles.padding;
    const maxPad = Math.max(...dp.map((v, i) => Math.abs(v - rp[i]!)));
    if (maxPad > t.spacing) {
      diffs.push({
        property: 'padding',
        expected: dp.map(fmt).join(' '),
        actual: rp.map(fmt).join(' '),
        delta: round(maxPad),
        tolerance: t.spacing,
        severity: 'minor',
        hint: 'Figma 的 padding 在容器上，实现可能写在子元素 margin 上；请核对视觉间距',
      });
    }
    // gap 按主轴选：HORIZONTAL → column-gap，VERTICAL → row-gap
    const renderGap =
      design.layout.mode === 'HORIZONTAL' ? render.styles.columnGap : render.styles.rowGap;
    if (design.layout.gap !== null && renderGap !== null) {
      pushNumeric(diffs, 'gap', design.layout.gap, renderGap, t.spacing, Infinity, 'minor');
    }
  }

  // ---- 阴影：只比有无 ----
  const designShadow = design.effects.some((e) => e.type === 'DROP_SHADOW');
  const renderShadow = !!render.styles.boxShadow && render.styles.boxShadow !== 'none';
  if (designShadow !== renderShadow) {
    diffs.push({
      property: 'boxShadow',
      expected: designShadow ? 'shadow' : 'none',
      actual: renderShadow ? render.styles.boxShadow : 'none',
      tolerance: 0,
      severity: 'minor',
    });
  }

  // ---- 透明度 ----
  pushNumeric(
    diffs,
    'opacity',
    design.opacity,
    render.styles.opacity,
    t.opacity,
    Infinity,
    'minor',
  );

  return diffs;
}

// ---- 辅助 ----

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function pushNumeric(
  diffs: PropertyDiff[],
  property: PropertyDiff['property'],
  expected: number,
  actual: number,
  tolerance: number,
  majorThreshold: number,
  cap: FidelitySeverity | null,
): void {
  const delta = Math.abs(expected - actual);
  if (delta <= tolerance) return;
  let severity: FidelitySeverity = delta > majorThreshold ? 'major' : 'minor';
  if (cap === 'minor' && severity === 'major') severity = 'minor';
  const isPx = property !== 'opacity';
  diffs.push({
    property,
    expected: isPx ? fmt(expected) : round(expected),
    actual: isPx ? fmt(actual) : round(actual),
    delta: round(actual - expected),
    tolerance,
    severity,
  });
}

function pushColor(
  diffs: PropertyDiff[],
  property: 'color' | 'backgroundColor' | 'borderColor',
  expected: Color,
  actual: Color | null,
  options: DiffOptions,
  maxSeverity: FidelitySeverity = 'major',
): void {
  const token = options.tokens?.lookup(expected, { theme: options.theme })?.name;
  const tokenHint = token ? `使用 var(${token})` : undefined;

  if (!actual) {
    // DOM 侧透明 / 未设置：背景可能由父元素提供、文本可能是占位态，置信度不足，只报 minor
    diffs.push({
      property,
      expected: expected.hex,
      actual: 'transparent',
      tolerance: options.tolerances.colorDeltaE,
      severity: 'minor',
      token,
      hint:
        [
          tokenHint,
          property === 'backgroundColor'
            ? '实现侧无背景色，可能由父元素或伪元素提供，请核对视觉效果'
            : undefined,
        ]
          .filter(Boolean)
          .join('；') || undefined,
    });
    return;
  }

  const dE = deltaE2000(expected, actual);
  const alphaDiff = Math.abs(expected.a - actual.a);
  if (dE <= options.tolerances.colorDeltaE && alphaDiff <= 0.05) return;

  let severity: FidelitySeverity =
    dE > options.tolerances.colorDeltaEMajor || alphaDiff > 0.2 ? 'major' : 'minor';
  if (maxSeverity === 'minor') severity = 'minor';

  diffs.push({
    property,
    expected: expected.hex,
    actual: actual.hex,
    delta: round(dE),
    tolerance: options.tolerances.colorDeltaE,
    severity,
    token,
    hint: tokenHint,
  });
}

/**
 * Figma 字体族是否包含在 CSS 字体栈中（忽略大小写、引号、空白）
 */
export function fontFamilyMatches(figmaFamily: string, cssStack: string): boolean {
  if (!figmaFamily) return true;
  const norm = (s: string) => s.replace(/["']/g, '').trim().toLowerCase();
  const target = norm(figmaFamily);
  return cssStack
    .split(',')
    .map(norm)
    .some((f) => f === target || f.replace(/\s+/g, '') === target.replace(/\s+/g, ''));
}
