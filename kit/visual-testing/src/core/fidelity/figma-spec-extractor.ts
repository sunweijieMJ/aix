/**
 * Figma 节点树 → DesignSpec 归一化
 *
 * 规则见 docs/fidelity-architecture.md §4.1：
 * - 坐标相对根节点 absoluteBoundingBox
 * - 填充色只乘 fills[].opacity，节点 opacity 单独记录
 * - lineHeight AUTO 按 lineHeightUnit === 'INTRINSIC_%' 识别
 * - SPACE_BETWEEN 时 gap 为 null
 * - VECTOR / BOOLEAN_OPERATION / 无子节点的图片填充 → isLeaf（带子节点的图片背景容器仍下钻）
 * - ELLIPSE 的圆角记为 min(w, h) / 2，对应 CSS border-radius: 50%
 * - visible === false 子树整体丢弃
 */

import { rgbaToColor } from '../../utils/color';
import type { FigmaNode, FigmaPaint, FigmaRect } from '../figma/types';
import type {
  Color,
  DesignEffect,
  DesignLayout,
  DesignNode,
  DesignNodeType,
  DesignText,
  FillKind,
} from './types';

const LEAF_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'STAR', 'REGULAR_POLYGON']);
const KNOWN_TYPES: DesignNodeType[] = [
  'FRAME',
  'GROUP',
  'TEXT',
  'RECTANGLE',
  'ELLIPSE',
  'VECTOR',
  'INSTANCE',
  'COMPONENT',
  'BOOLEAN_OPERATION',
  'LINE',
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 归一化文本：trim、连续空白折叠、去零宽字符
 */
export function normalizeText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDesignSpec(root: FigmaNode): DesignNode {
  const origin = root.absoluteBoundingBox ?? { x: 0, y: 0, width: 0, height: 0 };
  const node = convertNode(root, origin);
  if (!node) {
    throw new Error(`Figma root node "${root.name}" (${root.id}) is invisible or has no geometry`);
  }
  return node;
}

function convertNode(node: FigmaNode, origin: FigmaRect): DesignNode | null {
  if (node.visible === false) return null;

  const box = node.absoluteBoundingBox;
  if (!box) return null;

  const type = normalizeType(node.type);
  const fills = node.fills ?? [];
  const fillKind = classifyFills(fills);
  // 矢量与无子节点的图片填充视为叶子；带子节点的图片背景容器仍要下钻，否则里面的文本/按钮会静默消失
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isLeaf = LEAF_TYPES.has(node.type) || (fillKind === 'image' && !hasChildren);

  const design: DesignNode = {
    id: node.id,
    name: node.name,
    type,
    visible: true,
    bounds: {
      x: round2(box.x - origin.x),
      y: round2(box.y - origin.y),
      width: round2(box.width),
      height: round2(box.height),
    },
    opacity: node.opacity ?? 1,
    sizing:
      node.layoutSizingHorizontal || node.layoutSizingVertical
        ? { horizontal: node.layoutSizingHorizontal, vertical: node.layoutSizingVertical }
        : undefined,
    fills: type === 'TEXT' ? [] : solidColors(fills),
    fillKind: type === 'TEXT' ? 'none' : fillKind,
    strokes: (node.strokes ?? [])
      .filter((s) => s.visible !== false && s.type === 'SOLID' && s.color)
      .map((s) => ({ color: paintToColor(s)!, weight: strokeWeightOf(node) })),
    cornerRadius: normalizeRadius(node),
    effects: normalizeEffects(node),
    isLeaf,
    componentId: node.componentId,
    children: [],
  };

  if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
    design.layout = normalizeLayout(node);
  }

  if (type === 'TEXT') {
    design.text = normalizeTextNode(node);
  }

  if (!isLeaf && node.children) {
    for (const child of node.children) {
      const converted = convertNode(child, origin);
      if (converted) design.children.push(converted);
    }
  }

  return design;
}

/**
 * 描边宽度：四边独立设置时取最大值。
 *
 * DOM 侧 borderWidth 同样取四边 max（见 dom-extractor.ts），两边口径必须一致，
 * 否则「只给一条边加 border」的设计会被判成宽度不符。
 */
function strokeWeightOf(node: FigmaNode): number {
  const sides = node.individualStrokeWeights;
  if (sides) return Math.max(sides.top, sides.right, sides.bottom, sides.left);
  return node.strokeWeight ?? 1;
}

function normalizeType(type: string): DesignNodeType {
  return (KNOWN_TYPES as string[]).includes(type) ? (type as DesignNodeType) : 'OTHER';
}

function classifyFills(fills: FigmaPaint[]): FillKind {
  const visible = fills.filter((f) => f.visible !== false);
  if (visible.length === 0) return 'none';
  if (visible.some((f) => f.type === 'IMAGE' || f.type === 'VIDEO')) return 'image';
  if (visible.some((f) => f.type.startsWith('GRADIENT'))) return 'gradient';
  return 'solid';
}

function paintToColor(paint: FigmaPaint): Color | null {
  if (paint.type !== 'SOLID' || !paint.color) return null;
  const { r, g, b, a } = paint.color;
  // 只乘 paint.opacity；节点 opacity 单独比较，避免与 DOM 侧双算
  const alpha = (a ?? 1) * (paint.opacity ?? 1);
  return rgbaToColor(r * 255, g * 255, b * 255, alpha);
}

function solidColors(fills: FigmaPaint[]): Color[] {
  return fills
    .filter((f) => f.visible !== false)
    .map(paintToColor)
    .filter((c): c is Color => c !== null);
}

function normalizeRadius(node: FigmaNode): [number, number, number, number] {
  // ELLIPSE 没有 cornerRadius，对应 CSS border-radius: 50%
  if (node.type === 'ELLIPSE' && node.absoluteBoundingBox) {
    const r = round2(Math.min(node.absoluteBoundingBox.width, node.absoluteBoundingBox.height) / 2);
    return [r, r, r, r];
  }
  if (node.rectangleCornerRadii) {
    return node.rectangleCornerRadii.map(round2) as [number, number, number, number];
  }
  const r = round2(node.cornerRadius ?? 0);
  return [r, r, r, r];
}

function normalizeEffects(node: FigmaNode): DesignEffect[] {
  return (node.effects ?? [])
    .filter((e) => e.visible !== false)
    .map((e) => ({
      type:
        e.type === 'DROP_SHADOW'
          ? 'DROP_SHADOW'
          : e.type === 'INNER_SHADOW'
            ? 'INNER_SHADOW'
            : 'BLUR',
      color: e.color
        ? rgbaToColor(e.color.r * 255, e.color.g * 255, e.color.b * 255, e.color.a)
        : undefined,
      offset: e.offset,
      radius: e.radius,
    }));
}

function normalizeLayout(node: FigmaNode): DesignLayout {
  const spaceBetween = node.primaryAxisAlignItems === 'SPACE_BETWEEN';
  return {
    mode: node.layoutMode as 'HORIZONTAL' | 'VERTICAL',
    padding: [
      round2(node.paddingTop ?? 0),
      round2(node.paddingRight ?? 0),
      round2(node.paddingBottom ?? 0),
      round2(node.paddingLeft ?? 0),
    ],
    gap: spaceBetween ? null : round2(node.itemSpacing ?? 0),
    primaryAlign: node.primaryAxisAlignItems ?? 'MIN',
    counterAlign: node.counterAxisAlignItems ?? 'MIN',
  };
}

function normalizeTextNode(node: FigmaNode): DesignText {
  const style = node.style ?? {};
  const isAuto = style.lineHeightUnit === 'INTRINSIC_%';
  const textColor = solidColors(node.fills ?? [])[0] ?? null;

  return {
    content: normalizeText(node.characters ?? ''),
    fontFamily: style.fontFamily ?? '',
    fontWeight: style.fontWeight ?? 400,
    fontSize: round2(style.fontSize ?? 0),
    lineHeight: isAuto || style.lineHeightPx === undefined ? null : round2(style.lineHeightPx),
    letterSpacing: round2(style.letterSpacing ?? 0),
    align: style.textAlignHorizontal ?? 'LEFT',
    color: textColor,
  };
}

/**
 * 先序遍历
 */
export function walkDesign(
  node: DesignNode,
  visit: (n: DesignNode, depth: number) => void,
  depth = 0,
): void {
  visit(node, depth);
  for (const child of node.children) walkDesign(child, visit, depth + 1);
}

/**
 * 收集设计树中用到的字体族（去重）
 */
export function collectFontFamilies(root: DesignNode): string[] {
  const set = new Set<string>();
  walkDesign(root, (n) => {
    if (n.text?.fontFamily) set.add(n.text.fontFamily);
  });
  return [...set];
}
